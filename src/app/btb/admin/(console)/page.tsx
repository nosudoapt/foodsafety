import BtbAdminOverview from "@/components/btb-admin/Overview";
import BtbAdminAccount from "@/components/btb-admin/Account";
import { requireBtbAdmin } from "@/lib/btb-admin-api";

export default async function ConsoleOverviewPage() {
  const { admin } = await requireBtbAdmin();
  return <div className="btb-console__stack"><BtbAdminOverview /><BtbAdminAccount admin={admin} /></div>;
}
