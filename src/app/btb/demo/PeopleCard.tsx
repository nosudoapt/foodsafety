"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserPlus, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { btbCanView } from "@/lib/btb-access";
import { BTB_ROLE_LABELS } from "@/lib/btb-roles";
import type { BtbEmployee } from "@/lib/btb-team";
import { fetchJson } from "@/lib/fetch-json";

/** The first thing on a branch's page: who works here, who can sign in, and the
 *  two ways to add someone. The invite form itself lives on the Employees page;
 *  these links open it directly. */
export default function PeopleCard({ branch }: { branch: string }) {
  const { identity, access } = useBtbWorkspace();
  const [people, setPeople] = useState<BtbEmployee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const employeeId = identity?.employeeId;
  const canSee = !!identity && btbCanView("employees", identity.role, identity.console === true);

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    const controller = new AbortController();
    void fetchJson<{ employees: BtbEmployee[] }>("/api/btb/employees", { signal: controller.signal })
      .then((data) => { if (!cancelled) setPeople(data.employees); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; controller.abort(); };
  }, [canSee, employeeId, access?.locationIds.length]);

  if (!canSee) return null;
  const active = people?.filter((person) => person.active) ?? [];
  const logins = active.filter((person) => person.login_enabled).length;
  const shown = active.slice(0, 6);

  return <section className="btb-people" aria-labelledby="btb-people-title">
    <div className="btb-people__head">
      <div>
        <p className="btb-console__eyebrow">Named access</p>
        <h2 id="btb-people-title">People at {branch}</h2>
        <p>{people ? `${active.length} ${active.length === 1 ? "person" : "people"} · ${logins} ${logins === 1 ? "login" : "logins"} enabled` : failed ? "The team could not be loaded." : "Loading the team…"}</p>
      </div>
      <div className="ui-actions">
        <Link className="ui-button ui-button--ghost" href="/btb/demo/employees?action=add">Add manually</Link>
        <Link className="ui-button ui-button--primary" href="/btb/demo/employees?action=invite"><UserPlus size={16} aria-hidden="true" />Invite teammate</Link>
      </div>
    </div>
    {shown.length > 0 && <ul className="btb-people__list">
      {shown.map((person) => <li key={person.id}>
        <span className="btb-people__avatar" aria-hidden="true">{person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>
        <span className="btb-people__who"><strong>{person.name}</strong><small>{person.email ?? "No email yet"}</small></span>
        <Badge accent="purple">{BTB_ROLE_LABELS[person.role]}</Badge>
        <Badge accent={person.login_enabled ? "green" : "amber"}>{person.login_enabled ? "Signs in" : "Needs setup"}</Badge>
      </li>)}
    </ul>}
    <Link className="btb-people__more" href="/btb/demo/employees"><UsersRound size={15} aria-hidden="true" />Open the full team — roles, invitations and schedules</Link>
  </section>;
}
