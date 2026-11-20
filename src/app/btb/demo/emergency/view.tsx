"use client";
// Interactive view; page.tsx owns the request-time server gate.
import BtbFeatureGate from "@/components/BtbFeatureGate";
import EmergencyContacts from "@/components/EmergencyContacts";
export default function Page() {
  return (
    <BtbFeatureGate feature="emergency">
      {(readOnly) => <EmergencyContacts readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
