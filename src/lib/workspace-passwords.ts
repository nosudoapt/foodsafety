import { compare } from "bcryptjs";
import { verifyEmployeePassword } from "./btb-passwords";
import type { AuthPrincipal } from "./workspace-auth-types";

// A public dummy hash, not an account credential. Always run both providers'
// password work so failed/unknown/disabled accounts use the same verifier path.
const DUMMY_BCRYPT = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
export async function verifyWorkspacePassword(candidate: AuthPrincipal | null, password: string): Promise<boolean> {
  const hash = candidate?.passwordHash;
  const bcrypt = candidate?.principalType === "supabase" && typeof hash === "string" && /^\$2[aby]\$(?:0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(hash) ? hash : DUMMY_BCRYPT;
  const [providerValid, employeeValid] = await Promise.all([
    compare(password, bcrypt), // bcryptjs uses a constant-time digest comparison.
    verifyEmployeePassword(password, candidate?.principalType !== "supabase" ? hash ?? null : null),
  ]);
  return !!candidate && (candidate.principalType === "supabase" ? bcrypt === hash && providerValid : employeeValid);
}
