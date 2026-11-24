"use client";

import { useState } from "react";
import { Copy, Mail, Search, ShieldBan, Trash2, UserPlus, UsersRound } from "lucide-react";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { fetchJson } from "@/lib/fetch-json";
import { BTB_INVITE_ROLES, btbInvitationDeliveryLabel, validateBtbAdminPerson, type BtbAdminLocation, type BtbAdminPeople as BtbAdminPeopleData, type BtbAdminPerson, type BtbInvitationReceipt, type BtbInviteRole } from "@/lib/btb-admin";

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "Never signed in";
type PersonAction = { person: BtbAdminPerson; action: "block" | "remove" | "reinvite" | "password" };

export default function BtbAdminPeople({ location }: { location: BtbAdminLocation }) {
  const endpoint = `/api/btb/admin/locations/${location.id}/people`;
  const { data, loading, error, reload } = useBtbData<BtbAdminPeopleData>(endpoint);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<PersonAction | null>(null);
  const [receipt, setReceipt] = useState<BtbInvitationReceipt | null>(null);
  const [notice, setNotice] = useState("");
  const visible = data?.people.filter(person => `${person.name} ${person.email} ${person.role} ${person.status}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  function invited(result: BtbInvitationReceipt) { setReceipt(result); setNotice(""); setAdding(false); setAction(null); reload(); }
  return <section className="btb-console__stack" aria-labelledby="console-people-heading">
    <div className="btb-console__sectionhead"><div><p className="btb-console__eyebrow">Named access</p><h2 id="console-people-heading">People at this location</h2><p className="btb-console__hint">An employee’s name, role and password are shared across their assigned locations.</p></div><Button accent="red" disabled={!location.active || loading || !!error} onClick={() => setAdding(true)}><UserPlus size={18} aria-hidden="true" />Invite person</Button></div>
    {!location.active && <p className="ui-notice">This location is closed. Activate it before inviting or accepting invitations.</p>}
    {data && !data.emailService.senderConfigured && <p className="ui-notice">Email is not configured. New invitations provide a one-time manual link; share it privately with the intended person.</p>}
    {data?.emailService.senderConfigured && <p className="ui-notice">Invitations are emailed the moment you click invite. The daily outbox retries any delivery that fails.</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {receipt && <InvitationReceipt receipt={receipt} onDismiss={() => setReceipt(null)} />}
    <div className="btb-console__toolbar"><label className="btb-console__search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search people</span><input type="search" placeholder="Name, email, role or status" value={query} onChange={event => setQuery(event.target.value)} /></label><Button accent="red" variant="ghost" disabled={loading} onClick={reload}>Refresh people</Button></div>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && !error && <div className="btb-console__people-grid">{visible.map(person => <Card key={person.id} className="btb-console__person-card"><div className="btb-console__sectionhead"><h3>{person.name}</h3><Badge accent={person.status === "active" ? "green" : person.status === "blocked" ? "red" : "amber"}>{person.status === "active" ? "Active" : person.status === "blocked" ? "Blocked" : "Invited"}</Badge></div><p className="btb-console__person-email"><Mail size={16} aria-hidden="true" />{person.email || "Email needed"}</p><p className="btb-console__hint">{person.role} · {person.location_ids.length} assigned {person.location_ids.length === 1 ? "location" : "locations"}</p><dl><div><dt>Last sign-in</dt><dd>{dateLabel(person.last_login_at)}</dd></div><div><dt>Latest invitation</dt><dd>{btbInvitationDeliveryLabel(person.invitation)}</dd></div>{person.invitation && !person.invitation.used_at && <div><dt>Link expires</dt><dd>{dateLabel(person.invitation.expires_at)}</dd></div>}</dl>{person.invitation?.email_error && <p className="btb-console__hint" role="status">{person.invitation.email_error}</p>}<div className="btb-console__person-actions"><Button accent="red" variant="ghost" disabled={!location.active} aria-label={`Set a new password for ${person.name}`} onClick={() => setAction({ person, action: "password" })}>Set password</Button><Button accent="red" variant="ghost" disabled={!location.active || !person.email || !BTB_INVITE_ROLES.includes(person.role as BtbInviteRole)} aria-label={`Re-invite ${person.name}`} onClick={() => setAction({ person, action: "reinvite" })}>Re-invite</Button><Button accent="red" variant="ghost" disabled={person.status === "blocked"} aria-label={`Block ${person.name}`} onClick={() => setAction({ person, action: "block" })}><ShieldBan size={15} aria-hidden="true" />Block</Button><Button accent="red" variant="ghost" aria-label={`Remove ${person.name} from this location`} onClick={() => setAction({ person, action: "remove" })}><Trash2 size={15} aria-hidden="true" />Remove</Button></div></Card>)}</div>}
    {data && !error && !visible.length && <Card><div className="ui-empty"><UsersRound size={28} aria-hidden="true" /><h3>{query ? "No matching people" : "No people assigned yet"}</h3><p>{query ? "Try a different name, email or status." : "Invite a staff member, supervisor or manager. They set their own password; you never choose or see it."}</p></div></Card>}
    {adding && <InviteForm endpoint={endpoint} onClose={() => setAdding(false)} onInvited={invited} />}
    {action && <PersonActionDialog {...action} endpoint={endpoint} onClose={() => setAction(null)} onInvited={invited} onChanged={() => { setAction(null); setReceipt(null); setNotice(action.action === "block" ? `${action.person.name} is blocked at every location. Employee sessions and unused links are revoked.` : action.action === "password" ? `${action.person.name}’s password was reset. Share the new password privately; they can change it under My account.` : `${action.person.name} is removed from this location. Their historical records are kept.`); reload(); }} />}
  </section>;
}

function InvitationReceipt({ receipt, onDismiss }: { receipt: BtbInvitationReceipt; onDismiss: () => void }) {
  const [copied, setCopied] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(receipt.manualLink!); setCopied("Link copied. Share it privately."); }
    catch { setCopied("Copy wasn’t available. Select the link below and copy it manually."); }
  }
  const heading = receipt.manualLink ? "Invitation created · manual link"
    : receipt.email_status === "accepted" ? "Invitation sent"
      : receipt.email_status === "failed" ? "Invitation created · email failed"
        : "Invitation queued";
  const message = receipt.manualLink ? "Email is unavailable. This link is shown only now and is not saved in your browser."
    : receipt.email_status === "accepted" ? "Resend accepted the branded setup email. The person should receive it shortly."
      : receipt.email_status === "failed" ? `The setup email could not be delivered${receipt.email_error ? ` — ${receipt.email_error}` : ""}. The daily outbox will retry; you can also re-invite.`
        : "The email worker will send the setup link. Queued is not a delivery confirmation; refresh people to check its status.";
  return <Card className="btb-console__receipt"><div className="btb-console__sectionhead"><h3>{heading}</h3><Button accent="red" variant="ghost" onClick={onDismiss}>Dismiss</Button></div><p>{message}</p><p className="btb-console__hint">Single use · expires {dateLabel(receipt.expires_at)}. Previous unused links for this person no longer work.</p>{receipt.manualLink && <><label className="ui-form-stack">Private setup link<Input accent="red" readOnly value={receipt.manualLink} onFocus={event => event.target.select()} /></label><Button accent="red" variant="ghost" onClick={copy}><Copy size={16} aria-hidden="true" />Copy private link</Button>{copied && <p role="status" className="btb-console__hint">{copied}</p>}</>}</Card>;
}

function InviteForm({ endpoint, onClose, onInvited }: { endpoint: string; onClose: () => void; onInvited: (receipt: BtbInvitationReceipt) => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as BtbInviteRole });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function invite(event: React.FormEvent) {
    event.preventDefault(); if (saving) return;
    const invalid = validateBtbAdminPerson(form); if (invalid) { setError(invalid); return; }
    setSaving(true); setError("");
    try { onInvited(await fetchJson<BtbInvitationReceipt>(endpoint, { ...jsonRequest(form), signal: AbortSignal.timeout(20_000) })); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  }
  return <Modal open title="Invite person" description="The person receives a single-use, seven-day password-setup link. No password is created until they accept." busy={saving} onClose={onClose}><form onSubmit={invite} aria-busy={saving}>{error && <p className="ui-notice ui-notice--error" role="alert">{error} Your entries are still here.</p>}<fieldset className="ui-form-stack" disabled={saving}><label>Person’s name<Input accent="red" data-modal-autofocus required maxLength={100} autoComplete="off" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Employee email<Input accent="red" type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Employee role<select className="ui-input" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as BtbInviteRole })}>{BTB_INVITE_ROLES.map(role => <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>)}</select><small>The location’s page grants narrow this role’s permissions; they never elevate it.</small></label><p className="btb-console__hint">Already assigned elsewhere? Use their existing name and role with the same email. This reuses their account and replaces all prior unused setup links.</p></fieldset><div className="ui-modal__actions"><Button accent="red" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button accent="red" type="submit" disabled={saving}>{saving ? "Creating invitation…" : "Create invitation"}</Button></div></form></Modal>;
}

function PersonActionDialog({ person, action, endpoint, onClose, onChanged, onInvited }: PersonAction & {
  endpoint: string; onClose: () => void; onChanged: () => void; onInvited: (receipt: BtbInvitationReceipt) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const title = action === "remove" ? "Remove from location" : action === "block" ? "Block person" : action === "password" ? "Set a new password" : "Re-invite person";
  const description = action === "block" ? `Block ${person.name} at EVERY assigned location. Current employee sessions and unused invitation links stop working.`
    : action === "remove" ? `Remove ${person.name} from this location only. Historical records are kept.${person.location_ids.length === 1 ? " This is their last membership, so sign-in will be disabled." : " Their other memberships and sign-in remain active."}`
    : action === "password" ? `Set a temporary password for ${person.name}. Share it privately; they can change it under My account. Older sessions and unused invitation links stop working.`
    : `Create a new setup link for ${person.name}. Every previous unused link for this person is invalidated.${person.status === "blocked" ? " This also unblocks them; they must set a password to sign in again." : " Accepting the new link replaces their password and signs out older employee sessions."}`;
  async function confirm() {
    if (saving) return;
    if (action === "password" && (password.length < 10 || password.length > 128)) { setError("Set a password of 10–128 characters."); return; }
    setSaving(true); setError("");
    try {
      const request = action === "remove" ? { method: "DELETE" } : jsonRequest({ action, ...(action === "password" ? { password } : {}) }, "PATCH");
      const result = await fetchJson<BtbInvitationReceipt>(`${endpoint}/${person.id}`, { ...request, signal: AbortSignal.timeout(20_000) });
      if (action === "reinvite") onInvited(result); else onChanged();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  }
  return <Modal open title={title} description={description} busy={saving} onClose={onClose}>{error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}{action === "password" && <label className="ui-form-stack">Temporary password<Input accent="red" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /><small>10–128 characters. You will see it only while typing; share it privately.</small></label>}<div className="ui-modal__actions"><Button accent="red" variant="ghost" data-modal-autofocus disabled={saving} onClick={onClose}>Cancel</Button><Button accent="red" variant={action === "reinvite" ? "solid" : "danger"} disabled={saving} onClick={confirm}>{saving ? "Saving…" : action === "block" ? "Block at all locations" : action === "remove" ? "Remove membership" : action === "password" ? "Set password" : "Create new invitation"}</Button></div></Modal>;
}
