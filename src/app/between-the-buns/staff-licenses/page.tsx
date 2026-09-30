"use client";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import StaffLicenses from "@/components/StaffLicenses";
export default function Page() {
  return (
    <BtbFeatureGate feature="staff_licenses">
      {(readOnly) => <StaffLicenses readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}
