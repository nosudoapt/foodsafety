"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
  Bell,
  Tablet,
  Lock,
  KeyRound,
  Sparkles,
  Menu,
  X as CloseIcon,
} from "lucide-react";
import "./landing.css";
import { DotProvider, DayDotDial, DotPicker, DOTS } from "@/components/marketing/dot-theme";
import { Reveal, Seal, ScrollProgress, useStuck } from "@/components/marketing/chrome";
import { LiveLog } from "@/components/marketing/live-log";

const CAPABILITIES = [
  {
    icon: Bell,
    title: "Compliance & Renewals",
    desc: "Keep certificates, permits and upcoming renewals in one register. See what needs attention before the next deadline.",
    foot: "Upcoming deadlines, in view",
    accent: true,
  },
  {
    icon: Tablet,
    title: "Everyday Digital Logs",
    desc: "Temperature readings, cleaning routines and prep sheets, together in practical tools for the tablet by the pass.",
    foot: "Built around the shift",
    accent: false,
  },
  {
    icon: Lock,
    title: "Six Role-Based Workspaces",
    desc: "Staff see today's prep. Owners see the vault. Corporate sees every location. One app, six tailored experiences.",
    foot: "Granular permissions",
    accent: false,
  },
  {
    icon: KeyRound,
    title: "Secure Operations Vault",
    desc: "Keep important logins, emergency contacts and outage protocols within reach of the people responsible for them.",
    foot: "Role-restricted access",
    accent: false,
  },
];

const COMPARE = {
  old: {
    label: "The clipboard",
    title: "Everything lives in someone's head",
    items: [
      "Paper temp logs go missing mid-week",
      "Renewal dates found out by letter",
      "New staff taught by whoever's on",
      "One shift lead holds all the logins",
    ],
  },
  new: {
    label: "With FoodSafe",
    title: "One register, one vault, every site",
    items: [
      "Dated logs and recent activity together",
      "Renewals highlighted before expiry",
      "Handbooks and protocols in the vault",
      "Tools matched to each person’s role",
    ],
  },
};

const ROLE_STORIES = [
  {
    role: "Staff",
    title: "Start with the shift.",
    description: "Open daily checks, record temperatures and see your recent work from one practical home screen.",
  },
  {
    role: "Managers & owners",
    title: "See what needs attention.",
    description: "Review flagged readings, upcoming renewals and business records, with tools tailored to your responsibilities.",
  },
  {
    role: "Corporate & creative teams",
    title: "Keep the bigger picture clear.",
    description: "Corporate teams compare locations. Designers get a dedicated home for campaigns, scheduled posts and artwork.",
  },
];

const PLANS = [
  {
    name: "Demo",
    price: "Free",
    desc: "Explore the full platform with sample data. No signup required.",
    cta: "Open demo",
    href: "/app",
    featured: false,
    list: ["Full platform with sample data", "All log types", "No card, no signup"],
  },
  {
    name: "Single site",
    price: "$79",
    per: "/mo",
    desc: "One restaurant, unlimited staff, and the full compliance engine.",
    cta: "Start 30-day trial",
    href: "/auth/sign-up?trial=1",
    featured: true,
    list: ["Compliance register", "Unlimited staff", "Tablet-friendly tools", "Operations vault"],
  },
  {
    name: "Multi-location",
    price: "Let's talk",
    desc: "Corporate rollups, per-brand workspaces, and priority onboarding.",
    cta: "Get started",
    href: "/auth/sign-up?trial=1",
    featured: false,
    list: ["Per-brand workspaces", "Corporate rollup", "Priority onboarding"],
  },
];

const RAIL = [
  "Compliance register",
  "Tablet-friendly tools",
  "Temperature logs",
  "Opening & closing checks",
  "Prep & order sheets",
  "Operations vault",
  "Six-role access",
  "Emergency protocols",
];

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="brand" style={{ color: dark ? "var(--paper)" : undefined }}>
      <DayDotDial size={36} interactive={false} />
      <span className="brand__word">FoodSafe</span>
    </span>
  );
}

const NAV_LINKS = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#live", label: "Product preview" },
  { href: "#compare", label: "Why FoodSafe" },
  { href: "#pricing", label: "Pricing" },
];

export default function Landing() {
  const stuck = useStuck();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  return (
    <DotProvider>
      <ScrollProgress />
      <a href="#main" className="skip">Skip to content</a>

      {/* ---------- top bar ---------- */}
      <header className="topbar" data-stuck={stuck} onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}>
        <div className="wrap topbar__inner">
          <Link href="/" aria-label="FoodSafe home" style={{ textDecoration: "none" }}>
            <Logo />
          </Link>
          <nav className="nav" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <a className="navlink" href={l.href} key={l.href}>{l.label}</a>
            ))}
          </nav>
          <div className="topbar__actions">
            <DotPicker />
            <Link href="/auth/sign-in" className="btn btn--ghost">Sign in</Link>
            <Link href="/auth/sign-up?trial=1" className="btn btn--primary">
              Start free
            </Link>
            <button
              ref={menuButton}
              type="button"
              className="menubtn"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <CloseIcon size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        <div className="mobilemenu" id="mobile-menu" data-open={menuOpen}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link href="/auth/sign-in" onClick={() => setMenuOpen(false)}>Sign in</Link>
          <div className="mobilemenu__hue">
            <span className="small">Accent colour</span>
            <DotPicker />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* ---------- hero ---------- */}
        <section className="wrap hero">
          <div className="hero__grid">
            <div>
              <div className="hero__meta">
                <span className="dot-live">
                  <span className="live" aria-hidden="true" /> A clearer day, from the first check
                </span>
                <span>UK &amp; Canada · cafés, pubs, takeaways</span>
              </div>

              <h1 className="display">
                Every shift,<br />
                <span className="cut">written down</span>{" "}
                <span className="serif" style={{ fontStyle: "italic" }}>before</span><br />
                it&apos;s forgotten.
              </h1>

              <p className="lede hero__lede">
                FoodSafe is the operations register for independent restaurants
                — temperature, cleaning and prep logs, a compliance engine that
                warns you months early, and one sealed vault for every login.
                All of it on the tablet by the pass.
              </p>

              <div className="hero__cta">
                <Link href="/auth/sign-up?trial=1" className="btn btn--primary">
                  Start 30-day trial <ArrowRight size={17} />
                </Link>
                <Link href="/app" className="btn btn--ink">
                  Open the live demo
                </Link>
              </div>

              <div className="hero__foot">
                <Check size={16} aria-hidden="true" /> Six role-based workspaces. No card to start.
              </div>
            </div>

            {/* the ticket stack */}
            <div className="stack" aria-label="Sample shift logs">
              <article className="stack__ticket">
                <div className="ticket__perf" />
                <div className="ticket__head">
                  <span className="ticket__title">Cold chain</span>
                  <span className="ticket__id">#T-0606</span>
                </div>
                <div className="ticket__rows">
                  <div className="ticket__row">
                    <span className="k">Walk-in cooler</span>
                    <span className="pill pill--good">2.4°C</span>
                  </div>
                  <div className="ticket__row">
                    <span className="k">Line fridge</span>
                    <span className="pill pill--good">3.1°C</span>
                  </div>
                  <div className="ticket__row">
                    <span className="k">Freezer</span>
                    <span className="pill pill--good">−19.2°C</span>
                  </div>
                </div>
              </article>

              <article className="stack__ticket">
                <div className="ticket__perf" />
                <div className="ticket__head">
                  <span className="ticket__title">Renewals</span>
                  <span className="stamp">SCANNED</span>
                </div>
                <div className="ticket__rows">
                  <div className="ticket__row">
                    <span className="k">Health permit</span>
                    <span className="v">42 days</span>
                  </div>
                  <div className="ticket__row">
                    <span className="k">Fire suppression</span>
                    <span className="v">88 days</span>
                  </div>
                </div>
              </article>

              <article className="stack__ticket">
                <div className="ticket__perf" />
                <div className="ticket__head">
                  <span className="ticket__title">Closing check</span>
                  <span className="pill pill--dark">22:45</span>
                </div>
                <div className="ticket__rows">
                  <div className="ticket__row">
                    <span className="k">Fryer filter</span>
                    <span className="v">done</span>
                  </div>
                  <div className="ticket__row">
                    <span className="k">Cold room</span>
                    <span className="v">done</span>
                  </div>
                </div>
              </article>

              <Seal />
            </div>
          </div>
        </section>

        {/* ---------- rail ---------- */}
        <div className="rail" aria-hidden>
          <div className="rail__track">
            {[...RAIL, ...RAIL].map((item, i) => (
              <span className="rail__item" key={i}>
                <span
                  className="rail__dot"
                  style={{ background: DOTS[i % DOTS.length].hex }}
                />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ---------- compare ---------- */}
        <section id="compare" className="section band-dark">
          <div className="wrap">
            <div className="stack-head">
              <span className="marker">before it slips</span>
              <div>
                <h2 className="h2">
                  The clipboard forgets.<br />
                  The register doesn&apos;t.
                </h2>
                <p className="lede" style={{ marginTop: 18 }}>
                  Keep the daily routines and important records in reach, so
                  the next handover starts with a clearer picture.
                </p>
              </div>
            </div>

            <div className="compare">
              <div className="cmp cmp--old">
                <span className="cmp__label">{COMPARE.old.label}</span>
                <h3 className="cmp__title">{COMPARE.old.title}</h3>
                <ul className="cmp__list">
                  {COMPARE.old.items.map((it) => (
                    <li key={it}>
                      <span className="mk mk--no">
                        <X size={13} strokeWidth={2.6} />
                      </span>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="cmp cmp--new">
                <span className="cmp__label">{COMPARE.new.label}</span>
                <h3 className="cmp__title">{COMPARE.new.title}</h3>
                <ul className="cmp__list">
                  {COMPARE.new.items.map((it) => (
                    <li key={it}>
                      <span className="mk mk--yes">
                        <Check size={13} strokeWidth={3} />
                      </span>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- capabilities ---------- */}
        <section id="capabilities" className="section wrap">
          <div className="feat-head">
            <span className="marker">four corners of the pass</span>
            <div>
              <h2 className="h2">
                What runs under the pass
              </h2>
              <p className="lede" style={{ marginTop: 18 }}>
                Temperature, prep, cleaning and renewals — the four things a
                good shift lead checks, in one place that never forgets.
              </p>
            </div>
          </div>

          <Reveal>
            <div className="features">
              {CAPABILITIES.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.title}
                    className={`feature${c.accent ? " feature--accent" : ""}`}
                  >
                    <span className="feature__icon">
                      <Icon size={20} strokeWidth={1.8} />
                    </span>
                    <h3 className="feature__title">{c.title}</h3>
                    <p>{c.desc}</p>
                    <span className="feature__foot">
                      <Sparkles size={13} /> {c.foot}
                    </span>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </section>

        {/* ---------- live logs ---------- */}
        <section id="live" className="section wrap">
          <div className="feat-head">
            <span className="marker">one shift, four logs</span>
            <div>
              <h2 className="h2">
                The same tablet, every check
              </h2>
              <p className="lede" style={{ marginTop: 18 }}>
                Explore temperature, prep, cleaning and renewal records in this
                interactive preview. The figures below are sample data.
              </p>
            </div>
          </div>
          <Reveal>
            <LiveLog />
          </Reveal>
        </section>

        {/* ---------- role-based workspaces ---------- */}
        <section className="section--tight" aria-labelledby="roles-heading">
          <div className="wrap">
            <Reveal>
              <div className="role-stories__head">
                <h2 className="h2" id="roles-heading">A different view for every role</h2>
                <Link href="/app" className="link-arrow">Explore the workspaces <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
              <div className="role-stories">
                {ROLE_STORIES.map((story) => (
                  <article className="role-story" key={story.role}>
                    <span>{story.role}</span>
                    <h3>{story.title}</h3>
                    <p>{story.description}</p>
                  </article>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------- pricing ---------- */}
        <section id="pricing" className="section wrap">
          <div className="feat-head">
            <span className="marker">no setup fee</span>
            <div>
              <h2 className="h2">Priced per site, not per seat</h2>
              <p className="lede" style={{ marginTop: 18 }}>
                Start with a 30-day trial. No card required. Explore the
                role-based demo before creating your workspace.
              </p>
            </div>
          </div>

          <div className="plans">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`plan${p.featured ? " plan--featured" : ""}`}
              >
                {p.featured && <span className="plan__tag">30-day trial</span>}
                <span className="plan__name">{p.name}</span>
                <div className="plan__price">
                  {p.price}
                  {p.per && <small>{p.per}</small>}
                </div>
                <p>{p.desc}</p>
                <ul className="plan__list">
                  {p.list.map((l) => (
                    <li key={l}>
                      <Check
                        size={14}
                        strokeWidth={2.6}
                        style={{ flex: "none", marginTop: 2 }}
                      />{" "}
                      {l}
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.href}
                  className={`btn ${p.featured ? "btn--primary" : p.name === "Demo" ? "btn--soft" : "btn--ink"}`}
                >
                  {p.cta} <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- close ---------- */}
        <section className="wrap" style={{ paddingBottom: "clamp(48px,7vw,96px)" }}>
          <Reveal>
            <div className="close">
              <div>
                <h2 className="h2">Run a tighter kitchen.</h2>
                <p className="lede">
                  Start the free trial, or click straight into the live demo and
                  poke at a real register with sample data.
                </p>
              </div>
              <div className="close__actions">
                <Link href="/auth/sign-up?trial=1" className="btn btn--primary">
                  Start 30-day trial <ArrowRight size={17} />
                </Link>
                <Link href="/app" className="btn btn--ink">
                  View demo
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer__grid">
            <div>
              <Logo />
              <p className="small" style={{ marginTop: 14, maxWidth: 30 + "ch" }}>
                The operations register for independent restaurants. Built for
                the UK &amp; Canada.
              </p>
            </div>
            <div>
              <h3>Product</h3>
              <ul>
                <li><a href="#capabilities">Capabilities</a></li>
                <li><a href="#live">Product preview</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><Link href="/app">Demo</Link></li>
              </ul>
            </div>
            <div>
              <h3>Company</h3>
              <ul>
                <li><a href="#compare">Why FoodSafe</a></li>
                <li><a href="#pricing">Plans & pricing</a></li>
                <li><Link href="/auth/sign-in">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h3>Get started</h3>
              <ul>
                <li><Link href="/auth/sign-up?trial=1">Free trial <ArrowUpRight size={12} style={{ display: "inline" }} /></Link></li>
                <li><Link href="/app">Open demo</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer__base">
            <span>© {new Date().getFullYear()} FoodSafe · Built for UK &amp; Canadian food businesses</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Bell size={13} /> Compliance done before the inspector arrives
            </span>
          </div>
        </div>
      </footer>
    </DotProvider>
  );
}
