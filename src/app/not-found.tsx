import { FeedbackScreen } from "@/components/FeedbackScreen";

export const metadata = { title: "Page not found · Pholo" };

export default function NotFound() {
  return (
    <FeedbackScreen
      kind="notfound"
      code="404"
      title="That page isn't on the pass"
      body="The link may be old, or the page may have moved. Everything you can open from your own dashboard is still there."
    />
  );
}