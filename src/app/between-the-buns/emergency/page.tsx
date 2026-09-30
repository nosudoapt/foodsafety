"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import EmergencyContacts from "@/components/EmergencyContacts";
export default function Page() {
  return (
    <BtbFeatureGate feature="emergency">
      {(readOnly) => <EmergencyContacts readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
