"use client";

// Route-level error boundary. Shows the digest so a support ticket can be
// matched to a server log, but keeps the message human and the action clear.
import { useEffect } from "react";
import { FeedbackScreen } from "@/components/FeedbackScreen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the console for anyone with devtools open; the digest is the
    // only part that matches a server-side log line.
    console.error("Route error:", error);
  }, [error]);

  return (
    <FeedbackScreen
      kind="error"
      code={error.digest ? `Error ${error.digest}` : "Something went wrong"}
      title="This screen didn't load"
      body="The rest of the app is fine — this one page failed. Try again, and if it keeps happening send support the reference below."
      detail={error.message}
      onRetry={reset}
    />
  );
}