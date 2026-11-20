"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { BTB_LOCATION_PAGES } from "@/lib/btb-admin";
import { btbCardGroup } from "@/lib/btb-dashboard";
import { pageSlug } from "@/lib/btb-page-access";

export default function PageGrantPicker({ pages, onChange }: { pages: string[]; onChange: (pages: string[]) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const cards = BTB_LOCATION_PAGES.filter(card => `${card.title} ${card.desc}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = [...new Set(cards.map(btbCardGroup))];
  return <section className="btb-console__grants" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Allowed workspace pages</h3>
    <p className="btb-console__hint">{pages.length} of {BTB_LOCATION_PAGES.length} selected. Nothing is enabled by default. A person’s role and saved role restrictions still apply; assigned active locations combine their selected pages.</p>
    <label className="btb-console__grant-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Find a workspace page</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a page…" /></label>
    <div className="btb-console__grant-actions"><button type="button" onClick={() => onChange([...new Set([...pages, ...cards.map(pageSlug)])])}>Select {query ? "matches" : "all"}</button><button type="button" onClick={() => onChange(pages.filter(page => !cards.some(card => pageSlug(card) === page)))}>Clear {query ? "matches" : "all"}</button></div>
    {groups.map(group => <fieldset key={group}><legend>{group}</legend><div className="btb-console__grant-grid">{cards.filter(card => btbCardGroup(card) === group).map(card => {
      const slug = pageSlug(card);
      return <label className="btb-console__checkbox" key={slug}><input type="checkbox" checked={pages.includes(slug)} onChange={event => onChange(event.target.checked ? [...pages, slug] : pages.filter(page => page !== slug))} /><span>{card.title}<small>{card.desc}</small></span></label>;
    })}</div></fieldset>)}
    {!cards.length && <p role="status">No pages match “{query}”.</p>}
  </section>;
}
