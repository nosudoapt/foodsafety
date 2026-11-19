import { ShieldCheck } from "lucide-react";

export default function ConsoleOverview() {
  return <><div className="ui-pagehead"><div><p className="btb-console__eyebrow">Between the Buns · Administration</p><h1>The group, at a glance.</h1><p>Your independent console for location access, people and operations.</p></div></div><section className="ui-card btb-console__panel"><ShieldCheck size={28} aria-hidden="true" /><h2>Separate access. One familiar workspace.</h2><p>Console accounts administer the group. Invited employees use their own team credentials; shared demo roles stay in the demo.</p></section></>;
}
