// Public console types. Credentials and signing code live in btb-admin-auth.
export interface BtbAdminIdentity {
  id: string;
  email: string;
  name: string;
  sessionVersion: number;
}
