"use client";

// The day-dot palette. Five dots in a dial, exactly like the date labels a
// kitchen puts on prep — and the same five dots that recolour the page.
// Cassis is the brand default; the rest are the switchable accents.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type DotId = "cassis" | "pistachio" | "butter" | "coral" | "sky";

export const DOTS: { id: DotId; hex: string; name: string }[] = [
  { id: "cassis", hex: "#5b1e3b", name: "Cassis" },
  { id: "pistachio", hex: "#cde27a", name: "Pistachio" },
  { id: "butter", hex: "#f7cb5b", name: "Butter" },
  { id: "coral", hex: "#f47b5c", name: "Coral" },
  { id: "sky", hex: "#a9c7e8", name: "Sky" },
];

const STORAGE_KEY = "foodsafe.dot";

type Ctx = {
  dot: DotId;
  index: number;
  setDot: (d: DotId) => void;
  next: () => void;
};

const DotCtx = createContext<Ctx | null>(null);

const FALLBACK: Ctx = {
  dot: "cassis",
  index: 0,
  setDot: () => {},
  next: () => {},
};

// Auth screens show the mark without the interactive theme switch, so the
// hook returns a static default when no provider is mounted above it.
export function useDot() {
  return useContext(DotCtx) ?? FALLBACK;
}

export function DotProvider({ children }: { children: React.ReactNode }) {
  // Start on the brand default — the server and the first client render must
  // agree or React discards the hydrated tree. The saved hue is applied on the
  // next frame instead, so a returning visitor sees their colour land instantly
  // without a hydration mismatch.
  const [dot, setDotState] = useState<DotId>("cassis");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* private mode — keep the default */
    }
    if (!saved || !DOTS.some((d) => d.id === saved)) return;
    const nextDot = saved as DotId;
    const raf = requestAnimationFrame(() => setDotState(nextDot));
    return () => cancelAnimationFrame(raf);
  }, []);

  const persist = (d: DotId) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* private mode — the colour still applies for this visit */
    }
  };

  const setDot = useCallback((d: DotId) => {
    setDotState(d);
    persist(d);
  }, []);

  // Functional update so several clicks in one tick still advance one step
  // each instead of all reading the same stale colour.
  const next = useCallback(() => {
    setDotState((current) => {
      const at = DOTS.findIndex((d) => d.id === current);
      const step = DOTS[(at + 1) % DOTS.length].id;
      persist(step);
      return step;
    });
  }, []);

  const index = Math.max(0, DOTS.findIndex((d) => d.id === dot));

  const value = useMemo(
    () => ({ dot, index, setDot, next }),
    [dot, index, setDot, next]
  );

  return (
    <DotCtx.Provider value={value}>
      <div className="fs" data-dot={dot}>
        {children}
      </div>
    </DotCtx.Provider>
  );
}

// The logo. A dial of five date dots; the active colour sits at twelve
// o'clock. Hover nudges the dial, click indexes the next colour — which
// re-skins the entire page.
export function DayDotDial({
  size = 40,
  interactive = true,
}: {
  size?: number;
  interactive?: boolean;
}) {
  const { dot, index, next } = useDot();
  const name = DOTS[index]?.name ?? "Cassis";
  const R = size / 2;

  const Tag = interactive ? "button" : "span";
  const props = interactive
    ? {
        type: "button" as const,
        onClick: next,
        "aria-label": `Change accent colour. Current: ${name}.`,
        title: `Accent: ${name} — click to change`,
      }
    : { "aria-hidden": true as const };

  return (
    <Tag
      {...props}
      className="dial"
      style={{ width: size, height: size }}
    >
      <span
        className="dial__ring"
        style={
          {
            "--rot": `${index * -72}deg`,
            transform: "rotate(var(--rot))",
          } as React.CSSProperties
        }
        aria-hidden
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={R}
            cy={R}
            r={R - 1}
            fill="none"
            stroke="var(--line)"
            strokeWidth="1"
          />
          {DOTS.map((d, i) => {
            const a = (i * 72 - 90) * (Math.PI / 180);
            const r = R - 7.5;
            return (
              <circle
                key={d.id}
                cx={R + Math.cos(a) * r}
                cy={R + Math.sin(a) * r}
                r={i === 0 ? 3.4 : 2.6}
                fill={d.hex}
                stroke={i === 0 ? "var(--ink)" : "none"}
                strokeWidth={i === 0 ? 0.9 : 0}
                opacity={i === index ? 1 : 0.72}
              />
            );
          })}
        </svg>
      </span>
      <span
        className="dial__core"
        style={{ position: "absolute", background: DOTS[index].hex }}
        aria-hidden
      />
      {interactive && <span className="sr-only">{dot}</span>}
    </Tag>
  );
}

export function DotPicker() {
  const { dot, setDot } = useDot();
  return (
    <div className="dotpicker" role="group" aria-label="Accent colour">
      {DOTS.map((d) => (
        <button
          key={d.id}
          type="button"
          className="dotpicker__dot"
          style={{ background: d.hex }}
          aria-label={d.name}
          aria-pressed={dot === d.id}
          title={d.name}
          onClick={() => setDot(d.id)}
        />
      ))}
    </div>
  );
}