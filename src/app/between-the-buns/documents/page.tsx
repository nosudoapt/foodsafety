"use client";

// BTB Business Documents — the shared DocumentVault (file uploads + expiry
// alerts) rendered inside the cookie-authed BTB surface. There is no Supabase
// session here, so we pass an `uploader` identity for the insert; managers and
// owners can upload, corporate is read-only (BtbFeatureGate → readOnly).
import BtbFeatureGate from "@/components/BtbFeatureGate";
import DocumentVault from "@/components/DocumentVault";

export default function Page() {
  return (
    <BtbFeatureGate feature="documents">
      {(readOnly) => (
        <DocumentVault
          title="Business Documents"
          subtitle="Insurance, hood/fire, pest & lease files — with live expiry alerts"
          readOnly={readOnly}
          uploader={{ restaurantName: "The Grill House" }}
        />
      )}
    </BtbFeatureGate>
  );
}
