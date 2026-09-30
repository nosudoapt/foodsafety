"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import FranchiseInspection from "@/components/FranchiseInspection";
export default function Page() {
  return (
    <BtbFeatureGate feature="franchise_inspection">
      {(readOnly) => <FranchiseInspection readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
