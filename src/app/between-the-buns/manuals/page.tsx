"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import PrintManuals from "@/components/PrintManuals";
export default function Page() {
  return (
    <BtbFeatureGate feature="manuals">
      {(readOnly) => <PrintManuals readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
