"use client";

// Pholo marketing motion primitives. Native only — IntersectionObserver for
// entrances, rAF for pointer work, CSS custom properties for the paint.
// Everything degrades to "visible and still" under prefers-reduced-motion.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* hooks                                                               */
/* ------------------------------------------------------------------ */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/**
 * Fires once when the element is meaningfully in view. Also sweeps on scroll
 * so an anchor jump or a very fast scroll never strands a section hidden.
 */
export function useInView<T extends HTMLElement>(
  rootMargin = "0px 0px -10% 0px",
  threshold = 0.12
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(raf);
    }

    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      setInView(true);
      io.disconnect();
      window.removeEventListener("scroll", sweep);
      window.removeEventListener("resize", sweep);
    };
    const sweep = () => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) show();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) show();
      },
      { rootMargin, threshold }
    );
    io.observe(el);
    window.addEventListener("scroll", sweep, { passive: true });
    window.addEventListener("resize", sweep, { passive: true });
    sweep();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", sweep);
      window.removeEventListener("resize", sweep);
    };
  }, [rootMargin, threshold]);

  return [ref, inView] as const;
}

/** Pointer position inside an element, normalised to -0.5…0.5 on both axes. */
export function usePointer<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [p, setP] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setP({ x, y }));
    };
    const reset = () => setP({ x: 0, y: 0 });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
    };
  }, []);
  return [ref, p] as const;
}

/* ------------------------------------------------------------------ */
/* entrance                                                            */
/* ------------------------------------------------------------------ */

type RevealVariant = "up" | "blur" | "scale" | "left" | "right" | "fade";

export function Reveal({
  children,
  delay = 0,
  variant = "up",
  as: Tag = "div",
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  variant?: RevealVariant;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref as never}
      className={`rv ${className}`.trim()}
      data-v={variant}
      data-in={inView ? "true" : "false"}
      style={{ ...style, transitionDelay: inView ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}

/**
 * A single masked line. Children slide up from behind their own baseline.
 * Use one per display line — it is the headline's whole choreography.
 */
export function Mask({
  children,
  delay = 0,
  className = "",
  as: Tag = "span",
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: ElementType;
  once?: boolean;
}) {
  const [ref, inView] = useInView<HTMLElement>("0px 0px -6% 0px", 0.02);
  const shown = inView;
  return (
    <Tag
      ref={ref as never}
      className={`mask ${className}`.trim()}
      data-in={shown ? "true" : "false"}
      data-once={once ? "true" : "false"}
    >
      <span
        className="mask__i"
        style={{ transitionDelay: `${delay}ms` }}
      >
        {children}
      </span>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* numbers                                                             */
/* ------------------------------------------------------------------ */

export function Counter({
  to,
  suffix = "",
  prefix = "",
  duration = 1400,
  decimals = 0,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>("0px 0px -12% 0px", 0.2);
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    // Reduced motion still arrives at the final figure, just without the run.
    const start = performance.now() - (reduced ? duration : 0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // expo-out — fast arrival, gentle settle
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduced]);

  return (
    <span ref={ref} className="tabular">
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* pointer-driven surfaces                                             */
/* ------------------------------------------------------------------ */

/** Subtle 3D tilt that follows the cursor. Writes CSS vars, not state. */
export function Tilt({
  children,
  max = 6,
  className = "",
  glare = true,
}: {
  children: ReactNode;
  max?: number;
  className?: string;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || reduced) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--tx", `${(-py * max).toFixed(2)}deg`);
      el.style.setProperty("--ty", `${(px * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${((py + 0.5) * 100).toFixed(1)}%`);
    },
    [max, reduced]
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", "0deg");
    el.style.setProperty("--ty", "0deg");
  }, []);

  return (
    <div
      ref={ref}
      className={`tilt ${className}`.trim()}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      data-glare={glare ? "true" : "false"}
    >
      {children}
    </div>
  );
}

/** A soft light that follows the pointer across a dark surface. */
export function Spotlight({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  }, []);

  return (
    <div ref={ref} className={`spotlight ${className}`.trim()} onPointerMove={onMove}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* chrome                                                              */
/* ------------------------------------------------------------------ */

export function useStuck() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return stuck;
}

/** A hairline progress bar pinned to the top of the viewport. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const pct = max > 0 ? window.scrollY / max : 0;
        el.style.transform = `scaleX(${Math.min(1, pct)})`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <div className="progress" aria-hidden>
      <div ref={ref} className="progress__bar" />
    </div>
  );
}

/** Rotating text ring, drawn on an SVG path so the words follow a real circle. */
export function Seal({
  lines = ["ONE PLATFORM", "EVERY INDUSTRY", "EVERY SITE"],
  core = "50+",
  sub = "industries",
}: {
  lines?: string[];
  core?: string;
  sub?: string;
}) {
  const text = [...lines, ...lines].join(" · ") + " · ";
  const id = useId();
  return (
    <div className="seal" aria-hidden>
      <svg className="seal__text" viewBox="0 0 116 116">
        <defs>
          <path
            id={id}
            d="M58,58 m-42,0 a42,42 0 1,1 84,0 a42,42 0 1,1 -84,0"
            fill="none"
          />
        </defs>
        <text fill="currentColor" fontSize="7.4" letterSpacing="1.7">
          <textPath href={`#${id}`} startOffset="0">
            {text}
          </textPath>
        </text>
      </svg>
      <div className="seal__core">
        <div className="seal__num">{core}</div>
        <div className="seal__sub">{sub}</div>
      </div>
    </div>
  );
}

/** Small magnetic pull on a CTA / icon. */
export function Magnetic({
  children,
  strength = 10,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = useReducedMotion();

  return (
    <span
      ref={ref}
      className={`magnetic ${className}`.trim()}
      onPointerMove={(e) => {
        if (reduced) return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * strength;
        const y = ((e.clientY - r.top) / r.height - 0.5) * strength;
        el.style.transform = `translate(${x}px, ${y}px)`;
      }}
      onPointerLeave={() => {
        const el = ref.current;
        if (el) el.style.transform = "translate(0, 0)";
      }}
    >
      {children}
    </span>
  );
}
