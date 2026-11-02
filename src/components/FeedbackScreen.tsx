"use client";

// Shared full-screen states: not found, error, and a loading skeleton.
// One component so the whole app fails in the same voice.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, RefreshCw, SearchX, ServerCrash } from "lucide-react";
import { DayDotDial } from "@/components/marketing/dot-theme";
import "@/app/feedback.css";

export function FeedbackScreen({
  kind,
  code,
  title,
  body,
  detail,
  onRetry,
}: {
  kind: "notfound" | "error";
  code: string;
  title: string;
  body: string;
  detail?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const Icon = kind === "notfound" ? SearchX : ServerCrash;

  return (
    <div className="fbs">
      <div className="fbs__card">
        <Link href="/" className="fbs__brand" aria-label="FoodSafe home">
          <DayDotDial size={34} interactive={false} />
          <span className="fbs__brand-word">FoodSafe</span>
        </Link>

        <span className="fbs__icon" aria-hidden>
          <Icon size={22} strokeWidth={1.8} />
        </span>

        <p className="fbs__code">{code}</p>
        <h1 className="fbs__title">{title}</h1>
        <p className="fbs__body">{body}</p>

        {detail && (
          <details className="fbs__details">
            <summary>Technical detail</summary>
            <pre>{detail}</pre>
          </details>
        )}

        <div className="fbs__actions">
          {onRetry ? (
            <button type="button" className="fbs__btn fbs__btn--primary" onClick={onRetry}>
              <RefreshCw size={15} strokeWidth={2.2} /> Try again
            </button>
          ) : (
            <Link href="/dashboard" className="fbs__btn fbs__btn--primary">
              Go to dashboard <ArrowRight size={15} strokeWidth={2.2} />
            </Link>
          )}
          <button
            type="button"
            className="fbs__btn fbs__btn--quiet"
            onClick={() => router.back()}
          >
            <ArrowLeft size={15} strokeWidth={2.2} /> Go back
          </button>
        </div>

        <p className="fbs__foot">
          Still stuck? <Link href="/admin/emergency">Contact your shift lead</Link> or
          email support — we answer within the hour on weekdays.
        </p>
      </div>
    </div>
  );
}

// A skeleton that matches the admin canvas so the layout never jumps.
export function CanvasSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      <div className="skel__title" />
      <div className="skel__sub" />
      <div className="skel__grid">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="skel__card" key={i} />
        ))}
      </div>
      <div className="skel__line" />
      <div className="skel__line skel__line--short" />
    </div>
  );
}