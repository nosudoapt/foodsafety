"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import InspectionForm from "@/components/InspectionForm";
export default function Page() {
  return (
    <BtbFeatureGate feature="franchise_inspection">
      {(readOnly) => <InspectionForm type="franchisee" readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
