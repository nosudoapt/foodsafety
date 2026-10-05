// Pure helpers for the SQL migration runner. No I/O, no DB — everything here
// is covered by tests/migrate.test.mjs so the CLI itself stays thin.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Stable hash of a SQL file (CRLF-normalised so a Windows checkout matches). */
export function sha256(text) {
  return createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
}

/**
 * argv → flags. Supports `--flag`, `--step=16` and `--step 16`.
 * Unknown flags throw: a typo must never silently run a migration.
 */
export function parseArgs(argv) {
  const out = {
    dryRun: false,
    status: false,
    force: false,
    allowProd: false,
    help: false,
    step: null,
    baseline: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--status") out.status = true;
    else if (a === "--force") out.force = true;
    else if (a === "--allow-prod") out.allowProd = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--step=")) out.step = readStep(a.slice("--step=".length));
    else if (a === "--step") {
      const next = argv[++i];
      if (next === undefined) throw new Error("--step needs a number, e.g. --step 16");
      out.step = readStep(next);
    } else if (a.startsWith("--baseline=")) out.baseline = readStep(a.slice("--baseline=".length));
    else if (a === "--baseline") {
      const next = argv[++i];
      if (next === undefined) throw new Error("--baseline needs a number, e.g. --baseline 15");
      out.baseline = readStep(next);
    } else {
      throw new Error(`Unknown argument: ${a} (try --help)`);
    }
  }
  return out;
}

function readStep(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`step numbers must be positive integers, got "${value}"`);
  return n;
}

/**
 * Manifest sanity: every entry well-formed, every file on disk, no duplicate
 * steps or filenames, and steps strictly ascending after sorting.
 * Returns the sorted steps plus a list of problems (empty = good).
 */
export function validateManifest(manifest, dir) {
  const errors = [];
  if (!manifest || !Array.isArray(manifest.steps)) {
    return { steps: [], errors: ["manifest must be an object with a `steps` array"] };
  }

  const seenSteps = new Map();
  const seenFiles = new Map();
  const steps = [];

  for (const [i, entry] of manifest.steps.entries()) {
    const where = `steps[${i}]`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${where} is not an object`);
      continue;
    }
    const { step, file } = entry;
    if (!Number.isInteger(step) || step < 1) errors.push(`${where}.step must be a positive integer`);
    if (typeof file !== "string" || file.length === 0) errors.push(`${where}.file must be a non-empty string`);
    if (typeof entry.description !== "string" || entry.description.length === 0) {
      errors.push(`${where}.description is required (it shows up in --status)`);
    }
    if (entry.alwaysRun !== undefined && typeof entry.alwaysRun !== "boolean") {
      errors.push(`${where}.alwaysRun must be a boolean when present`);
    }
    if (typeof file !== "string") continue;

    if (seenSteps.has(step)) errors.push(`duplicate step ${step}: "${seenFiles.get(step)}" and "${file}"`);
    else seenSteps.set(step, file);

    if (seenFiles.has(file)) errors.push(`duplicate file "${file}" at steps ${seenFiles.get(file)} and ${step}`);
    else seenFiles.set(file, step);

    const full = path.join(dir, file);
    if (!fs.existsSync(full)) errors.push(`${where}: ${file} does not exist in ${dir}`);

    steps.push({ step, file, description: entry.description, alwaysRun: entry.alwaysRun === true });
  }

  steps.sort((a, b) => a.step - b.step);
  return { steps, errors };
}

/**
 * What to do with each step.
 *   apply — run it now            skip — already applied, unchanged
 *   error — applied before but the file was edited since
 *   defer — beyond --step
 * `applied` is Map<filename, { checksum, step, applied_at }>.
 */
export function plan({ steps, applied = new Map(), force = false, maxStep = null }) {
  return steps.map((entry) => {
    const base = {
      step: entry.step,
      file: entry.file,
      description: entry.description,
      checksum: entry.checksum,
      alwaysRun: entry.alwaysRun === true,
    };
    if (maxStep !== null && entry.step > maxStep) {
      return { ...base, action: "defer", reason: `beyond --step=${maxStep}` };
    }
    const prev = applied.get(entry.file);
    if (!prev) return { ...base, action: "apply", reason: "not applied yet" };
    if (force) return { ...base, action: "apply", reason: "--force" };
    if (entry.alwaysRun) return { ...base, action: "apply", reason: "alwaysRun" };
    if (prev.checksum !== entry.checksum) {
      return {
        ...base,
        action: "error",
        reason: "file changed after it was applied — restore the original or re-run with --force",
      };
    }
    return { ...base, action: "skip", reason: "already applied" };
  });
}

/** Postgres reports errors as a 1-based character offset into the statement. */
export function lineNumberFor(sqlText, position) {
  const p = Number(position);
  if (!Number.isInteger(p) || p < 1) return null;
  const before = String(sqlText).slice(0, p - 1);
  return before.split("\n").length;
}

/**
 * Minimal KEY=VALUE loader for .env.local / .env so the runner doesn't depend
 * on a dotenv package. Existing process.env always wins; values are never logged.
 */
export function readEnvFile(file) {
  const out = {};
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const clean = line.startsWith("export ") ? line.slice(7) : line;
    const eq = clean.indexOf("=");
    if (eq < 1) continue;
    const key = clean.slice(0, eq).trim();
    let value = clean.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Row for --status / --dry-run tables. */
export function statusRows(entries, applied) {
  return entries.map((e) => {
    const row = applied.get(e.file);
    return {
      step: e.step,
      file: e.file,
      applied: row ? "applied" : "pending",
      appliedAt: row?.applied_at ? formatTime(row.applied_at) : "—",
      duration: row?.duration_ms != null ? `${row.duration_ms}ms` : "—",
    };
  });
}

export function formatTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Column-aligned table (no dependency, stable in CI logs). */
export function renderTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(stripAnsi(h).length, ...rows.map((r) => stripAnsi(String(r[i] ?? "")).length)),
  );
  // Pad to the *visible* width so coloured cells stay aligned.
  const line = (cells) =>
    cells
      .map((c, i) => {
        const cell = String(c ?? "");
        return cell + " ".repeat(Math.max(0, widths[i] - stripAnsi(cell).length));
      })
      .join("  ")
      .trimEnd();
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(r))].join("\n");
}

function stripAnsi(s) {
  return String(s).replace(/\u001b\[\d+m/g, "");
}
