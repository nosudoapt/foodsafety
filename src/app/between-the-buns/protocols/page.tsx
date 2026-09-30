"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import OperationalProtocols from "@/components/OperationalProtocols";
export default function Page() {
  return (
    <BtbFeatureGate feature="protocols">
      {(readOnly) => <OperationalProtocols readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
