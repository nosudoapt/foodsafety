"use client";

// BTB Business Documents — plain files with no expiry (forms, SOPs, brand
// assets, menus). DocumentVault filters expiry_date IS NULL, so expiring items
// live only in Compliance & Renewals. There is no Supabase session here, so we
// pass an `uploader` identity for the insert; managers and owners can upload,
// corporate is read-only (BtbFeatureGate → readOnly).
import BtbFeatureGate from "@/components/BtbFeatureGate";
import DocumentVault from "@/components/DocumentVault";

export default function Page() {
  return (
    <BtbFeatureGate feature="documents">
      {(readOnly) => (
        <DocumentVault
          title="Business Documents"
          subtitle="Forms, SOPs, brand assets & menus — files that don't expire"
          readOnly={readOnly}
          uploader={{ restaurantName: "The Grill House" }}
        />
      )}
    </BtbFeatureGate>
  );
}
