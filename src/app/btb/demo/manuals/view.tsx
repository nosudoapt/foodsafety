"use client";
// Interactive view; page.tsx owns the request-time server gate.
import BtbFeatureGate from "@/components/BtbFeatureGate";
import PrintManuals from "@/components/PrintManuals";
export default function Page() {
  return (
    <BtbFeatureGate feature="manuals">
      {(readOnly) => <PrintManuals application="btb" readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
