import { CanvasSkeleton } from "@/components/FeedbackScreen";

// Route-level loading state. Matches the admin canvas geometry so the layout
// doesn't jump when the real content lands.
export default function Loading() {
  return (
    <div style={{ padding: "clamp(18px, 3vw, 34px) clamp(16px, 3vw, 32px)" }}>
      <CanvasSkeleton />
    </div>
  );
}