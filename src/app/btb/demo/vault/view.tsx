"use client";
// Interactive view; page.tsx owns the request-time server gate.

// Shared presentation, explicitly BTB authentication and effective grants.
import BtbFeatureGate from "@/components/BtbFeatureGate";
import VaultManager from "@/components/VaultManager";

export default function Page() {
  return (
    <BtbFeatureGate feature="vault">
      {(readOnly) => <VaultManager workspace="btb" canEdit={!readOnly} />}
    </BtbFeatureGate>
  );
}
