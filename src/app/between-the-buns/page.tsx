import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import BtbHub from "./hub";

// Server-side role resolution: the session cookie carries the account's role,
// so the hub renders the right cards on first paint with no client fetch.
// No valid BTB session here means the proxy let something odd through —
// send it to the BTB sign-in rather than render the wrong card set.
export default async function BetweenTheBunsHome() {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) redirect("/between-the-buns/login");
  return <BtbHub role={role} />;
}
