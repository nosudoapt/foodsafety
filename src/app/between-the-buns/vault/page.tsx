"use client";

// BTB Login Vault — reuses the same client component as the FoodSafe admin
// vault. It talks to /api/vault*, which authorizes either a Supabase owner-tier
// session OR a valid BTB "owner" cookie (see src/lib/vault-server.ts). Only the
// BTB owner role reaches this route (BtbFeatureGate feature="vault").
import BtbFeatureGate from "@/components/BtbFeatureGate";
import VaultManager from "@/app/admin/vault/page";

export default function Page() {
  return (
    <BtbFeatureGate feature="vault">
      {() => <VaultManager />}
    </BtbFeatureGate>
  );
}
