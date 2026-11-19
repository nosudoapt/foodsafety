import { redirect } from "next/navigation";
import { requireBtbAdmin } from "@/lib/btb-admin-api";
import { BtbApiError } from "@/lib/api-errors";
import BtbAdminShell from "@/components/BtbAdminShell";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let context;
  try { context = await requireBtbAdmin(); }
  catch (error) {
    if (error instanceof BtbApiError && error.status === 401) redirect("/btb/admin/login");
    return <main className="workspace-ui workspace-loading"><h1>The console couldn’t connect.</h1><p role="alert">Check the console migrations and backend connection, then try again. No changes have been made.</p><a href="/btb/admin" className="ui-button">Try again</a></main>;
  }
  return <BtbAdminShell admin={context.admin}>{children}</BtbAdminShell>;
}
