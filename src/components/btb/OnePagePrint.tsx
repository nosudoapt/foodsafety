"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintSheetButton({ disabled = false, label = "Print one page" }: { disabled?: boolean; label?: string }) {
  return <Button variant="ghost" disabled={disabled} onClick={() => window.print()}><Printer size={17} aria-hidden="true" />{label}</Button>;
}

/** Fit all content to a Letter sheet. Scaling changes size, never clips rows. */
export default function OnePagePrint({ children, landscape = false, label }: { children: React.ReactNode; landscape?: boolean; label: string }) {
  const page = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const width = (landscape ? 11 : 8.5) * 96 - 72;
  const height = (landscape ? 8.5 : 11) * 96 - 76;
  useEffect(() => {
    const sheet = page.current;
    const inner = content.current;
    if (!sheet || !inner) return;
    const fit = () => {
      inner.style.width = `${width}px`;
      let scale = Math.min(1, height / Math.max(1, inner.scrollHeight), width / Math.max(1, inner.scrollWidth));
      if (scale < 1) {
        // Reflow at the full printable width at each scale. This keeps dense
        // sheets readable instead of shrinking them into a narrow left column.
        let low = scale;
        let high = 1;
        for (let step = 0; step < 9; step++) {
          const candidate = (low + high) / 2;
          inner.style.width = `${width / candidate}px`;
          if (inner.scrollHeight * candidate <= height) low = candidate;
          else high = candidate;
        }
        scale = low;
        inner.style.width = `${width / scale}px`;
      }
      const contentHeight = Math.max(1, inner.scrollHeight);
      const contentWidth = Math.max(1, inner.scrollWidth);
      scale = Math.min(scale, height / contentHeight, width / contentWidth);
      inner.style.transform = `scale(${scale})`;
      sheet.style.height = `${Math.ceil(contentHeight * scale) + 1}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(inner);
    window.addEventListener("beforeprint", fit);
    void document.fonts.ready.then(fit);
    return () => { observer.disconnect(); window.removeEventListener("beforeprint", fit); };
  }, [height, width, children]);
  return <div className={`btb-print-root ${landscape ? "btb-print-landscape" : "btb-print-portrait"}`} aria-label={label} style={{ width }}>
    <div ref={page} className="btb-print-page" style={{ width }}><div ref={content} className="btb-print-content" style={{ width }}>{children}</div></div>
  </div>;
}
