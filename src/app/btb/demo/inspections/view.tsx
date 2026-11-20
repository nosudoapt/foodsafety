"use client";
// Interactive view; page.tsx owns the request-time server gate.
import BtbFeatureGate from "@/components/BtbFeatureGate";
import InspectionForm from "@/components/InspectionForm";
import { btbToday } from "@/lib/btb-team";
export default function Page() {
  return (
    <BtbFeatureGate feature="inspections">
      {(readOnly) => <InspectionForm type="in-house" readOnly={readOnly} initialDate={btbToday()} />}
    </BtbFeatureGate>
  );
}
