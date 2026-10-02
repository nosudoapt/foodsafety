"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import InspectionForm from "@/components/InspectionForm";
export default function Page() {
  return (
    <BtbFeatureGate feature="inspections">
      {(readOnly) => <InspectionForm type="in-house" readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
