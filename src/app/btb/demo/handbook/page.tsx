"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import EmployeeHandbook from "@/components/EmployeeHandbook";
export default function Page() {
  return (
    <BtbFeatureGate feature="handbook">
      {(readOnly) => <EmployeeHandbook readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
