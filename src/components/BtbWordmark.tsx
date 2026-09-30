// The "BETWEEN [the] BUNS" wordmark, rebuilt in CSS so it stays crisp at any
// size and sits cleanly on any background (the printed charts render it on
// cream). Colours are the brand palette pulled from the recipe charts:
// orange BETWEEN, green BUNS, a dark burger badge for "the". Presentational
// only — no hooks, no client state — so any page (server or client) can use it.
// Size scales with font-size: set the text size on `className` and the badge
// follows via em units.

export default function BtbWordmark({
  className = "text-3xl",
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center font-extrabold tracking-tight leading-none select-none ${className}`}
      aria-label="Between the Buns"
    >
      <span className="text-[#E07B2E]">BETWEEN</span>

      {/* "the" burger badge with a green planet ring */}
      <span
        className="relative inline-flex items-center justify-center mx-[0.3em]"
        style={{ width: "1.55em", height: "1.15em" }}
        aria-hidden
      >
        <span
          className="absolute rounded-full border-[#7CB83F]"
          style={{
            width: "1.55em",
            height: "0.7em",
            borderWidth: "0.12em",
            transform: "rotate(-14deg)",
          }}
        />
        <span
          className="relative flex items-center justify-center rounded-full bg-[#3a2417]"
          style={{ width: "0.98em", height: "0.98em" }}
        >
          <span
            className="italic text-[#fdf8e8] leading-none"
            style={{ fontSize: "0.4em" }}
          >
            the
          </span>
        </span>
      </span>

      <span className="text-[#7CB83F]">BUNS</span>
    </div>
  );
}
