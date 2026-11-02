"use client";

// Small marketing-only behaviours: sticky bar shadow, scroll reveal, and the
// rotating "audit ready" seal. All native, no dependencies.
import { useEffect, useId, useRef, useState } from "react";

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

// Reveals once, then unobserves. Respects prefers-reduced-motion by showing
// everything immediately.
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  as?: React.ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion: reveal on the next frame rather than synchronously in
    // the effect body, which would cascade an extra render.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    // Reveal when intersection is confirmed, but also sweep on scroll: an
    // anchor jump lands past a section in a single frame, so the observer
    // can report "not intersecting" for something the reader has already
    // jumped over. A plain geometric check on scroll closes that gap.
    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      setShown(true);
      io.disconnect();
      window.removeEventListener("scroll", sweep);
      window.removeEventListener("resize", sweep);
    };

    const inView = () => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight * 0.92 && r.bottom > 0;
    };

    const sweep = () => {
      // Anything at or above the viewport counts as "reached" too, so a fast
      // scroll or an anchor jump never strands a section invisible.
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) show();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) show();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    io.observe(el);
    window.addEventListener("scroll", sweep, { passive: true });
    window.addEventListener("resize", sweep, { passive: true });

    // Catch the case where the element is already on screen at mount.
    if (inView()) {
      const raf = requestAnimationFrame(show);
      return () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener("scroll", sweep);
        window.removeEventListener("resize", sweep);
      };
    }

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", sweep);
      window.removeEventListener("resize", sweep);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(18px)",
        transition: `opacity 0.7s cubic-bezier(0.2,0.8,0.2,1) ${delay}ms, transform 0.7s cubic-bezier(0.2,0.8,0.2,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}

// Rotating text ring, drawn on an SVG path so the words follow a real circle.
export function Seal({
  lines = ["DAILY ROUTINES", "EVERY SHIFT", "EVERY SITE"],
  core = "6 roles",
  sub = "one workspace",
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
        <text fill="currentColor" fontSize="7.6" letterSpacing="1.6">
          <textPath href={`#${id}`} startOffset="0">
            {text}
          </textPath>
        </text>
      </svg>
      <div className="seal__core">
        <div style={{ fontSize: "1.35rem", lineHeight: 1 }}>{core}</div>
        <div style={{ fontSize: "0.5rem", letterSpacing: "0.06em", marginTop: 2 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

// The bit of the marketing page that responds to where you are.
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      el.style.transform = `scaleX(${pct / 100})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: "0 0 auto 0",
        height: 2,
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      <div
        ref={ref}
        style={{
          height: "100%",
          background: "var(--dot)",
          transformOrigin: "0 50%",
          transform: "scaleX(0)",
          transition: "transform 0.1s linear, background-color 0.45s ease",
        }}
      />
    </div>
  );
}
