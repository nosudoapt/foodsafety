import "server-only";

import { normalizeDraft as normalizeDraftOf, type ExtractKind } from "./btb-platform-inventory";

export type { ExtractKind };

/**
 * AI document extraction for the BTB location platform.
 *
 * The extractor is an AID, never a writer: it turns an uploaded invoice,
 * receipt, POS report or master sheet into DRAFT values for the existing
 * review/confirm pipeline. Nothing here touches the ledger — a person still
 * confirms every number through btb_platform_import + the inventory actions.
 *
 * Not operational without a configured API key: the route answers 503 when the
 * location has none, and every call is metered against the location's daily
 * cap through btb_ai_consume before the provider is contacted.
 */

export interface AiSettings {
  enabled: boolean;
  model: string | null;
  api_key: string | null;
  daily_limit: number;
}

const SYSTEM_PROMPT = [
  "You extract data from restaurant documents for a review screen. A human will verify every value before it is saved.",
  "Rules: copy numbers exactly as printed (never compute or fix them); keep the document's own spelling and item order;",
  "use null for anything not on the document — never guess and never write zero for a blank;",
  "currency is CAD; dates are YYYY-MM-DD when the document shows a full date, otherwise null;",
  "output ONLY a JSON object, no markdown, no commentary.",
].join(" ");

const KIND_CONTRACT: Record<ExtractKind, string> = {
  gfs: `Extract a GFS invoice. Return JSON:
{"vendor":"supplier name as printed","reference":"invoice number","date":"YYYY-MM-DD or null","total":"invoice total as printed",
 "lines":[{"description":"item description","item_code":"item code","cases":number|null,"packets":number|null,"unit_price":number|null,"line_total":number|null}]}
Include one line per invoice row, in order.`,
  local: `Extract a local purchase receipt. Return JSON:
{"vendor":"shop or supplier name (may be absent on a till receipt — use null)","reference":"receipt/invoice number or null","date":"YYYY-MM-DD or null","total":"receipt total as printed",
 "lines":[{"description":"item text","item_code":null,"cases":null,"packets":null,"unit_price":number|null,"line_total":number|null}]}
For till receipts put the printed quantity in packets when a per-item amount exists.`,
  sales: `Extract the monthly POS sales summary. Return JSON:
{"figures":[{"label":"the report's own line label, e.g. Total Net Sales","value":number}]}
Include every total-style line the report prints (net, gross, combined variants), each with its label exactly as printed and its value.`,
  master: `Extract a master inventory sheet. Return JSON:
{"items":[{"item_number":"item/supplier code or null","name":"item description","unit_size":"unit size text or null","pack_size":number|null,
 "category":"sheet category or null","case_price":number|null,"packet_price":number|null,"par_value":number|null,
 "qty_case":number|null,"qty_packet":number|null}]}
packet_price is the per-packet price column when the sheet has one — do NOT compute it. Keep every row, including rows without prices or counts.`,
};

/** Strip a provider response down to its first balanced JSON object. */
function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("The model response contained no JSON object.");
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
  }
  throw new Error("The model response was not complete JSON.");
}

/** Shape-validate a draft. Delegates to the shared, testable normaliser. */
export function normalizeDraft(kind: ExtractKind, raw: unknown): Record<string, unknown> | null {
  return normalizeDraftOf(kind, raw);
}

export interface ExtractInput {
  kind: ExtractKind;
  mime: string;
  bytes: Buffer;
  pdfText?: string;
  hint?: string;
}

export interface ExtractOutcome {
  ok: boolean;
  extracted?: Record<string, unknown>;
  text?: string;
  error?: string;
}

/** One OpenAI-compatible chat call. Never retries on auth errors; never logs. */
export async function runAiExtract(
  settings: { api_key: string; model: string },
  input: ExtractInput,
): Promise<ExtractOutcome> {
  const base = (process.env.BTB_AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.BTB_AI_MODEL || settings.model || "gpt-4o-mini";
  const parts: unknown[] = [
    { type: "text", text: `${KIND_CONTRACT[input.kind]}${input.hint ? `\n\nContext: ${input.hint}` : ""}` },
  ];
  if (input.pdfText !== undefined) {
    parts.push({ type: "text", text: `Document text layer:\n${input.pdfText.slice(0, 60_000)}` });
  } else {
    parts.push({ type: "image_url", image_url: { url: `data:${input.mime};base64,${input.bytes.toString("base64")}` } });
  }
  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.api_key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: parts },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (cause) {
    return { ok: false, error: cause instanceof Error && cause.name === "TimeoutError" ? "The AI service did not respond in time. Try again." : "The AI service could not be reached. Try again." };
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    if (response.status === 401 || response.status === 403) return { ok: false, error: "The configured AI API key was rejected by the provider." };
    if (response.status === 429) return { ok: false, error: "The AI provider rate limit was hit. Try again shortly." };
    return { ok: false, error: `The AI service returned an error (${response.status}). ${detail}` };
  }
  let payload: { choices?: { message?: { content?: string } }[] };
  try { payload = await response.json(); }
  catch { return { ok: false, error: "The AI service response could not be read." }; }
  const content = payload.choices?.[0]?.message?.content ?? "";
  try {
    const draft = normalizeDraft(input.kind, parseJsonLoose(content));
    if (!draft) return { ok: false, error: "The AI response did not contain usable rows for this document type." };
    return { ok: true, extracted: draft, text: content };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "The AI response could not be parsed." };
  }
}
