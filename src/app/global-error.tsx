"use client";

// Last-resort boundary — catches failures in the root layout itself, where
// `error.tsx` cannot help. Must render its own <html>/<body>.
import "./tokens.css";
import "./feedback.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div className="fbs">
          <div className="fbs__card">
            <span className="fbs__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </span>
            <p className="fbs__code">{error.digest ? `Error ${error.digest}` : "Startup error"}</p>
            <h1 className="fbs__title">Pholo couldn&apos;t load</h1>
            <p className="fbs__body">
              Something failed before the page could start. Reloading usually
              fixes it; if it doesn&apos;t, the reference above is what support
              needs.
            </p>
            <div className="fbs__actions">
              <button
                type="button"
                className="fbs__btn fbs__btn--primary"
                onClick={reset}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}