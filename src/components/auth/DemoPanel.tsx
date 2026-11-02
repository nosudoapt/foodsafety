"use client";

// Collapsible "enter as a demo role" panel for the auth screens. Closed by
// default so it never competes with the real sign-in form; when opened it
// explains what each role can see in one line.
import { useState } from "react";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { useDemoSignIn } from "@/components/DemoRolePicker";
import { DEMO_ACCOUNTS } from "@/lib/demo-roles";
import { Alert } from "./AuthShell";

export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const { enterAs, pendingRole, error } = useDemoSignIn();

  return (
    <div className="demo" data-open={open}>
      <button
        type="button"
        className="demo__toggle"
        aria-expanded={open}
        aria-controls="demo-roles"
        onClick={() => setOpen((o) => !o)}
      >
        <Sparkles size={14} strokeWidth={2} />
        Try a demo role — no signup
        <ChevronDown size={15} strokeWidth={2} />
      </button>

      {open && (
        <div className="demo__body" id="demo-roles">
          {error && <Alert kind="error">{error}</Alert>}
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.role}
              type="button"
              className="demorole"
              onClick={() => enterAs(account.role)}
              disabled={pendingRole !== null}
            >
              <span className="demorole__tile" aria-hidden>
                {account.label.charAt(0)}
              </span>
              <span className="demorole__text">
                <span className="demorole__name">{account.label}</span>
                <span className="demorole__desc">{account.headline}</span>
              </span>
              <ArrowRight size={14} strokeWidth={2.2} className="demorole__go" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}