"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import MarketingBoard from "@/components/MarketingBoard";
import { BTB_RESTAURANT } from "@/lib/btb-roles";
export default function Page() {
  return (
    <BtbFeatureGate feature="marketing">
      {(readOnly) => <MarketingBoard readOnly={readOnly} restaurant={BTB_RESTAURANT} />}
    </BtbFeatureGate>
  );
}
