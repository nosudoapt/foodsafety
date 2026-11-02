"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/** Native modality with initial focus, keyboard containment and trigger restoration. */
export default function Modal({ open, title, description, busy = false, onClose, children }: {
  open: boolean; title: string; description?: string; busy?: boolean;
  onClose: () => void; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    // These forms stay mounted while closed, so focus on opening, not on mount.
    element.querySelector<HTMLElement>("[data-modal-autofocus]:not(:disabled)")?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return (
    <dialog ref={dialog} className="ui-modal" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]'))
          .filter((control) => control.tabIndex >= 0 && !control.matches(":disabled") && control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        // Native dialogs make the page inert; explicitly wrap at the form edges.
        if (!first) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="ui-modal__header">
        <div><h2 id={`${id}-title`}>{title}</h2>{description && <p id={`${id}-description`}>{description}</p>}</div>
        <button type="button" className="ui-iconbutton" disabled={busy} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="ui-modal__body">{children}</div>
    </dialog>
  );
}
