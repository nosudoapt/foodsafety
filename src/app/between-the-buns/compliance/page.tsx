"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import ComplianceRegister from "@/components/ComplianceRegister";
export default function Page() {
  return (
    <BtbFeatureGate feature="compliance">
      {(readOnly) => <ComplianceRegister readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
