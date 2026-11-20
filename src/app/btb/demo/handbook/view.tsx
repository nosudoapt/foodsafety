"use client";
// Interactive view; page.tsx owns the request-time server gate.
import BtbFeatureGate from "@/components/BtbFeatureGate";
import EmployeeHandbook from "@/components/EmployeeHandbook";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
export default function Page() {
  const { identity } = useBtbWorkspace();
  return (
    <BtbFeatureGate feature="handbook">
      {(readOnly) => <EmployeeHandbook readOnly={readOnly} application="btb" acknowledgerName={identity?.employeeId ? identity.name : ""} />}
    </BtbFeatureGate>
  );
}
