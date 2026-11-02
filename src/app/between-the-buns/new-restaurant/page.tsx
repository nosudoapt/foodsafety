"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import FranchiseChecklist from "@/components/btb/FranchiseChecklist";
export default function Page() {
  return (
    <BtbFeatureGate feature="new_restaurant">
      {(readOnly) => <FranchiseChecklist readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
