"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import PrintManuals from "@/components/PrintManuals";
export default function Page() {
  return (
    <BtbFeatureGate feature="manuals">
      {(readOnly) => <PrintManuals application="btb" readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
