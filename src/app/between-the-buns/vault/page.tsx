"use client";

// BTB Login Vault — reuses the same client component as the FoodSafe admin
// vault. It talks to /api/vault*, which authorizes either a Supabase owner-tier
// session OR a valid BTB management-tier cookie — manager or corporate (see
// src/lib/vault-server.ts, btb-access "vault"). BtbFeatureGate feature="vault"
// keeps staff and supervisors out.
import BtbFeatureGate from "@/components/BtbFeatureGate";
import VaultManager from "@/app/admin/vault/page";

export default function Page() {
  return (
    <BtbFeatureGate feature="vault">
      {() => <VaultManager />}
    </BtbFeatureGate>
  );
}
