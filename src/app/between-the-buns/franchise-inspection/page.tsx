"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import InspectionForm from "@/components/InspectionForm";
import { btbToday } from "@/lib/btb-team";
export default function Page() {
  return (
    <BtbFeatureGate feature="franchise_inspection">
      {(readOnly) => <InspectionForm type="franchisee" readOnly={readOnly} initialDate={btbToday()} />}
    </BtbFeatureGate>
  );
}
