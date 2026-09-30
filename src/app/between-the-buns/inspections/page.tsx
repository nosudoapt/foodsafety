"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import InhouseInspections from "@/components/InhouseInspections";
export default function Page() {
  return (
    <BtbFeatureGate feature="inspections">
      {(readOnly) => <InhouseInspections readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
