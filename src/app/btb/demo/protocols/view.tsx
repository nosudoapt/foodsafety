"use client";
// Interactive view; page.tsx owns the request-time server gate.
import BtbFeatureGate from "@/components/BtbFeatureGate";
import OperationalProtocols from "@/components/OperationalProtocols";
export default function Page() {
  return (
    <BtbFeatureGate feature="protocols">
      {(readOnly) => <OperationalProtocols readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
