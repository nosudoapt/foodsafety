"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import MarketingBoard from "@/components/MarketingBoard";
export default function Page() {
  return (
    <BtbFeatureGate feature="marketing">
      {(readOnly) => <MarketingBoard readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
