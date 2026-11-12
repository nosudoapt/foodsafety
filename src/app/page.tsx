"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
  Menu,
  X as CloseIcon,
  Printer,
  Zap,
  Boxes,
  Timer,
  Building2,
} from "lucide-react";
import "./landing.css";
import { DotProvider, DayDotDial, DotPicker, DOTS } from "@/components/marketing/dot-theme";
import {
  Reveal,
  Mask,
  Counter,
  Tilt,
  Spotlight,
  Magnetic,
  Seal,
  ScrollProgress,
  useStuck,
} from "@/components/marketing/motion";
import { IndustryRegister } from "@/components/marketing/industry-register";
import { ModuleDemo } from "@/components/marketing/module-demo";

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */

const NAV_LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#live", label: "Preview" },
  { href: "#compare", label: "Why Pholo" },
  { href: "#pricing", label: "Pricing" },
];

/** Marquee vocabulary — trades, not a feature list. */
const MARQUEE_A = [
  "Restaurants",
  "Cafés",
  "Bakeries",
  "Hotels",
  "Gas stations",
  "Convenience stores",
  "Pharmacies",
  "Salons & spas",
  "Gyms",
  "Retail",
  "Car washes",
  "Auto repair",
  "Dental clinics",
  "Medical offices",
  "Veterinary clinics",
  "Daycares",
  "Schools",
  "Law firms",
  "Accounting firms",
  "Real estate",
  "Insurance brokers",
  "Bars & nightclubs",
  "Food trucks",
  "Catering",
  "Dry cleaners",
  "Laundromats",
];
const MARQUEE_B = [
  "Florists",
  "Pet grooming",
  "Tattoo studios",
  "Photography",
  "Event venues",
  "Bowling alleys",
  "Escape rooms",
  "Cinemas",
  "Parking lots",
  "Storage facilities",
  "Warehouses",
  "Logistics",
  "Courier services",
  "Plumbing",
  "Electrical",
  "HVAC",
  "Landscaping",
  "Cleaning services",
  "Construction",
  "Printing shops",
  "Jewellery",
  "Electronics repair",
  "Furniture stores",
  "Mortgage brokers",
  "Fitness studios",
  "Childcare centres",
];

const COMPARE = {
  old: {
    label: "The way it runs now",
    title: "A stack of printouts, kept in sync by memory",
    items: [
      "A new sheet for every shift, every site",
      "Counts retyped into a spreadsheet at month end",
      "Renewals noticed when the letter arrives",
      "Only the person who built it knows how it works",
      "Numbers enter the head office days late",
    ],
  },
  new: {
    label: "With Pholo",
    title: "One live record, answered the moment it's asked",
    items: [
      "One outline per trade, versioned and shared",
      "Counts land in the report as they're entered",
      "Renewals flagged months before expiry",
      "Any supervisor can pick it up cold",
      "Every location, current, in one view",
    ],
  },
};

const MODULES = [
  {
    n: "01",
    name: "Checks & routines",
    line: "Opening, closing, hourly, by role — signed with a timestamp.",
    sector: "Restaurants · Construction · Gyms",
  },
  {
    n: "02",
    name: "Counts & inventory",
    line: "On-hand, waste, variance — reconciled while the count happens.",
    sector: "Retail · Pharmacies · Auto repair",
  },
  {
    n: "03",
    name: "Scheduling & cover",
    line: "Rotas, swaps and who is on the floor right now.",
    sector: "Hotels · Salons · Logistics",
  },
  {
    n: "04",
    name: "Documents & compliance",
    line: "Licences, certificates and permissions with real expiry dates.",
    sector: "Law firms · Daycares · Dental",
  },
  {
    n: "05",
    name: "Inspections & audits",
    line: "The walk-through, scored, with the follow-up already assigned.",
    sector: "Warehouses · Schools · Spas",
  },
  {
    n: "06",
    name: "Assets & equipment",
    line: "What you own, when it was last checked, what comes next.",
    sector: "Car washes · HVAC · Cinemas",
  },
  {
    n: "07",
    name: "The operations vault",
    line: "Logins, emergency contacts and outage protocols, role-restricted.",
    sector: "Every trade on this page",
  },
];

const ROLE_STORIES = [
  {
    role: "Staff",
    title: "Open the shift, not a binder.",
    description:
      "Today's checks, counts and notes in one screen — with the last answer still visible.",
  },
  {
    role: "Supervisors & managers",
    title: "See the exception, not the stack.",
    description:
      "What was missed, what was flagged, who is covering — the three things that actually need a decision.",
  },
  {
    role: "Owners & corporate",
    title: "Every site, one current answer.",
    description:
      "Compare locations, chase renewals and export clean records without asking anyone for a spreadsheet.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "$49",
    per: "/mo",
    desc: "One location, the core record: checks, counts, scheduling and documents.",
    cta: "Start free",
    href: "/auth/sign-up?trial=1",
    featured: false,
    list: ["1 location", "Unlimited staff", "Core modules", "Document vault"],
  },
  {
    name: "Pro",
    price: "$149",
    per: "/mo",
    desc: "Growing operators: inspections, assets, reporting and receipt tracking.",
    cta: "Start free",
    href: "/auth/sign-up?trial=1",
    featured: true,
    list: [
      "Everything in Starter",
      "Inspections & assets",
      "Reporting exports",
      "Integrations",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    desc: "Multi-location groups with per-site permissions and a dedicated lead.",
    cta: "Talk to us",
    href: "/auth/sign-up?trial=1",
    featured: false,
    list: [
      "Multi-location rollup",
      "Per-brand workspaces",
      "SSO & advanced roles",
      "Dedicated account lead",
    ],
  },
];

const STATS = [
  { to: 50, suffix: "+", label: "Industries supported", icon: Building2 },
  { to: 48, suffix: "h", label: "Average go-live", icon: Timer },
  { to: 7, suffix: "", label: "Reusable modules", icon: Boxes },
  { to: 1, suffix: "", label: "Record of truth", icon: Zap },
];

/* ------------------------------------------------------------------ */
/* logo                                                                */
/* ------------------------------------------------------------------ */

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="brand" style={{ color: light ? "var(--paper)" : undefined }}>
      <DayDotDial size={34} interactive={false} />
      <span className="brand__word">Pholo</span>
      <span className="brand__tld" aria-hidden>/ca</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const stuck = useStuck();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);

  // A single rAF writes one scroll variable; the whole hero reads it. This is
  // what makes the first screen feel physical without a scroll library.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, window.innerHeight);
        el.style.setProperty("--sy", String(y));
        el.style.setProperty("--p", (y / window.innerHeight).toFixed(3));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Close the mobile menu on Escape only; the open button handles the rest.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <DotProvider>
      <ScrollProgress />
      <a href="#main" className="skip">Skip to content</a>

      {/* ---------- top bar ---------- */}
      <header className="topbar" data-stuck={stuck}>
        <div className="wrap topbar__inner">
          <Link href="/" aria-label="Pholo home" className="topbar__brand">
            <Logo />
          </Link>
          <nav className="nav" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <a className="navlink" href={l.href} key={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="topbar__actions">
            <DotPicker />
            <Link href="/auth/sign-in" className="btn btn--ghost">Sign in</Link>
            <Magnetic strength={6}>
              <Link href="/auth/sign-up?trial=1" className="btn btn--primary">
                Start free
              </Link>
            </Magnetic>
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
          {NAV_LINKS.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {l.label}
            </a>
          ))}
          <Link href="/auth/sign-in" onClick={() => setMenuOpen(false)}>Sign in</Link>
          <div className="mobilemenu__hue">
            <span className="small">Accent</span>
            <DotPicker />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* ---------- hero ---------- */}
        <section className="hero" ref={heroRef}>
          <div className="hero__gridBg" aria-hidden />
          <div className="hero__glow" aria-hidden />

          <div className="wrap hero__inner">
            <div className="hero__copy">
              <div className="hero__meta">
                <span className="dot-live">
                  <span className="live" aria-hidden /> Live operations
                </span>
                <span className="hero__metaSep" aria-hidden />
                <span>Built in Canada · running everywhere</span>
              </div>

              <h1 className="display">
                <Mask delay={60} as="span" className="hero__line">
                  Your business
                </Mask>
                <Mask delay={150} as="span" className="hero__line">
                  runs on <em className="hero__em">paper</em>.
                </Mask>
                <Mask delay={240} as="span" className="hero__line">
                  <span className="hero__cut">Let&apos;s fix that.</span>
                </Mask>
              </h1>

              <Reveal delay={420} variant="blur">
                <p className="lede hero__lede">
                  Pholo takes the printouts, spreadsheets and clipboards your team
                  already fills in — and turns them into one live record. Checks,
                  counts, schedules, documents, inspections. Every location,
                  every shift, answered before anyone has to ask.
                </p>
              </Reveal>

              <Reveal delay={520}>
                <div className="hero__cta">
                  <Magnetic strength={8}>
                    <Link href="/auth/sign-up?trial=1" className="btn btn--primary btn--lg">
                      Start free <ArrowRight size={17} />
                    </Link>
                  </Magnetic>
                  <Link href="#live" className="btn btn--ink btn--lg">
                    See it running
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={600}>
                <div className="hero__foot">
                  <span className="hero__pill">
                    <Check size={13} strokeWidth={3} /> 30-day trial
                  </span>
                  <span className="hero__pill">
                    <Check size={13} strokeWidth={3} /> No card
                  </span>
                  <span className="hero__pill">
                    <Check size={13} strokeWidth={3} /> Live in days
                  </span>
                </div>
              </Reveal>
            </div>

            <div className="hero__visual">
              <Tilt max={4} glare={false}>
                <IndustryRegister />
              </Tilt>
              <Seal core="50+" sub="industries" />
              {/* the thing being replaced, peeking out behind the software */}
              <div className="hero__ghost" aria-hidden>
                <span className="hero__ghostHead">
                  <Printer size={12} /> SHIFT SHEET — REV 04
                </span>
                <span className="hero__ghostRule" />
                <span className="hero__ghostRule" />
                <span className="hero__ghostRule hero__ghostRule--short" />
                <span className="hero__ghostStamp">SUPERSEDED</span>
              </div>
            </div>
          </div>

          <div className="hero__scroll" aria-hidden>
            <span className="hero__scrollLine" />
          </div>
        </section>

        {/* ---------- marquee ---------- */}
        <div className="marquee" aria-hidden>
          <div className="marquee__row marquee__row--a">
            <div className="marquee__track">
              {[...MARQUEE_A, ...MARQUEE_A].map((item, i) => (
                <span className="marquee__item" key={`a${i}`}>
                  <span className="marquee__dot" style={{ background: DOTS[i % DOTS.length].hex }} />
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="marquee__row marquee__row--b">
            <div className="marquee__track">
              {[...MARQUEE_B, ...MARQUEE_B].map((item, i) => (
                <span className="marquee__item" key={`b${i}`}>
                  <span className="marquee__dot" style={{ background: DOTS[(i + 2) % DOTS.length].hex }} />
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="marquee__fade marquee__fade--l" />
          <div className="marquee__fade marquee__fade--r" />
        </div>

        {/* ---------- one platform (module rail) ---------- */}
        <section id="platform" className="section wrap">
          <div className="split-head">
            <div>
              <Reveal variant="fade">
                <span className="marker">one platform, seven modules</span>
              </Reveal>
              <h2 className="h2">
                <Mask as="span">Not a tool for one trade.</Mask>
                <Mask as="span" delay={90}>
                  A platform for <span className="serif">the way you work</span>.
                </Mask>
              </h2>
            </div>
            <Reveal variant="right" delay={120}>
              <p className="lede split-head__note">
                A restaurant, a clinic and a construction site don&apos;t need
                different software. They need the same seven things, filled in
                differently. That&apos;s the whole idea.
              </p>
            </Reveal>
          </div>

          <div className="modules">
            {MODULES.map((m, i) => (
              <Reveal key={m.n} delay={i * 45} variant="up">
                <article className="module">
                  <span className="module__n tabular">{m.n}</span>
                  <div className="module__body">
                    <h3 className="module__name">{m.name}</h3>
                    <p className="module__line">{m.line}</p>
                  </div>
                  <span className="module__sector">{m.sector}</span>
                  <span className="module__arrow" aria-hidden>
                    <ArrowUpRight size={16} />
                  </span>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- compare ---------- */}
        <section id="compare" className="compare-band">
          <Spotlight className="compare-band__spot">
            <div className="wrap">
              <div className="split-head split-head--dark">
                <div>
                  <Reveal variant="fade">
                    <span className="marker">the actual upgrade</span>
                  </Reveal>
                  <h2 className="h2">
                    <Mask as="span">You&apos;re not buying software.</Mask>
                    <Mask as="span" delay={90}>
                      You&apos;re <span className="serif">retiring the spreadsheet</span>.
                    </Mask>
                  </h2>
                </div>
                <Reveal variant="right" delay={100}>
                  <p className="lede split-head__note">
                    The sheet in the drawer was never the problem — the copying
                    between it, the binder and the head-office email was. Pholo
                    deletes that gap.
                  </p>
                </Reveal>
              </div>

              <div className="compare">
                <Reveal variant="left" className="cmp-wrap">
                  <div className="cmp cmp--old">
                    <div className="cmp__paper" aria-hidden>
                      <span /><span /><span /><span /><span />
                    </div>
                    <span className="cmp__label">{COMPARE.old.label}</span>
                    <h3 className="cmp__title">{COMPARE.old.title}</h3>
                    <ul className="cmp__list">
                      {COMPARE.old.items.map((it) => (
                        <li key={it}>
                          <span className="mk mk--no">
                            <X size={12} strokeWidth={2.8} />
                          </span>
                          {it}
                        </li>
                      ))}
                    </ul>
                    <span className="cmp__tag">manual · stale · single-site</span>
                  </div>
                </Reveal>

                <Reveal variant="right" delay={110} className="cmp-wrap">
                  <div className="cmp cmp--new">
                    <div className="cmp__cursor" aria-hidden>
                      <span className="cmp__cursorRing" />
                    </div>
                    <span className="cmp__label">{COMPARE.new.label}</span>
                    <h3 className="cmp__title">{COMPARE.new.title}</h3>
                    <ul className="cmp__list">
                      {COMPARE.new.items.map((it) => (
                        <li key={it}>
                          <span className="mk mk--yes">
                            <Check size={12} strokeWidth={3} />
                          </span>
                          {it}
                        </li>
                      ))}
                    </ul>
                    <span className="cmp__tag cmp__tag--new">live · current · every site</span>
                  </div>
                </Reveal>

                <span className="compare__switch" aria-hidden>
                  <ArrowRight size={16} />
                </span>
              </div>
            </div>
          </Spotlight>
        </section>

        {/* ---------- live demo ---------- */}
        <section id="live" className="section wrap">
          <div className="split-head">
            <div>
              <Reveal variant="fade">
                <span className="marker">same module, different trade</span>
              </Reveal>
              <h2 className="h2">
                <Mask as="span">Pick a module.</Mask>
                <Mask as="span" delay={90}>
                  Watch the trade change.
                </Mask>
              </h2>
            </div>
            <Reveal variant="right" delay={100}>
              <p className="lede split-head__note">
                This is the point most platforms miss: the record is the same
                shape everywhere. Only the words on it change.
              </p>
            </Reveal>
          </div>
          <Reveal delay={80}>
            <ModuleDemo />
          </Reveal>
        </section>

        {/* ---------- roles ---------- */}
        <section className="roles">
          <div className="wrap">
            <div className="roles__head">
              <h2 className="h2">
                <Mask as="span">Six views.</Mask>
                <Mask as="span" delay={80}>One version of the truth.</Mask>
              </h2>
              <Reveal variant="fade" delay={140}>
                <Link href="/app" className="link-arrow">
                  Explore the workspaces <ArrowRight size={16} aria-hidden />
                </Link>
              </Reveal>
            </div>
            <div className="role-stories">
              {ROLE_STORIES.map((story, i) => (
                <Reveal key={story.role} delay={i * 90} variant="up">
                  <article className="role-story">
                    <span className="role-story__role">{story.role}</span>
                    <h3>{story.title}</h3>
                    <p>{story.description}</p>
                    <span className="role-story__line" aria-hidden />
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- stats ---------- */}
        <section className="stats-band">
          <div className="wrap">
            <div className="stats">
              {STATS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <Reveal key={s.label} delay={i * 80} variant="up">
                    <div className="stat-block">
                      <Icon size={18} strokeWidth={1.7} className="stat-block__icon" aria-hidden />
                      <div className="stat-block__num tabular">
                        <Counter to={s.to} suffix={s.suffix} />
                      </div>
                      <div className="stat-block__label">{s.label}</div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- pricing ---------- */}
        <section id="pricing" className="section wrap">
          <div className="split-head">
            <div>
              <Reveal variant="fade">
                <span className="marker">no setup fee, no lock-in</span>
              </Reveal>
              <h2 className="h2">
                <Mask as="span">Priced per site.</Mask>
                <Mask as="span" delay={90}>Not per seat, not per form.</Mask>
              </h2>
            </div>
            <Reveal variant="right" delay={100}>
              <p className="lede split-head__note">
                Start with a 30-day trial. Every module is included from day one
                — because nobody should pay extra to find out what they needed.
              </p>
            </Reveal>
          </div>

          <div className="plans">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 80} variant="up">
                <div className={`plan${p.featured ? " plan--featured" : ""}`}>
                  {p.featured && <span className="plan__tag">Most operators</span>}
                  <span className="plan__name">{p.name}</span>
                  <div className="plan__price">
                    {p.price}
                    {p.per && <small>{p.per}</small>}
                  </div>
                  <p>{p.desc}</p>
                  <ul className="plan__list">
                    {p.list.map((l) => (
                      <li key={l}>
                        <Check size={14} strokeWidth={2.8} aria-hidden />
                        {l}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={p.href}
                    className={`btn ${p.featured ? "btn--primary" : "btn--ink"}`}
                  >
                    {p.cta} <ArrowRight size={16} />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- close ---------- */}
        <section className="wrap section-close">
          <Reveal variant="scale">
            <div className="close">
              <div className="close__grid" aria-hidden />
              <div className="close__body">
                <h2 className="h2">Retire the paper.<br />Keep the record.</h2>
                <p className="lede">
                  Start a trial, or sign in and poke at a real register with live
                  data.
                </p>
              </div>
              <div className="close__actions">
                <Magnetic strength={7}>
                  <Link href="/auth/sign-up?trial=1" className="btn btn--primary btn--lg">
                    Start free <ArrowRight size={17} />
                  </Link>
                </Magnetic>
                <Link href="/auth/sign-in" className="btn btn--ink btn--lg">
                  Sign in
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
              <p className="small footer__blurb">
                One platform powering the way every trade records its work.
                Built in Canada for businesses anywhere.
              </p>
              <span className="footer__url">pholo.ca</span>
            </div>
            <div>
              <h3>Platform</h3>
              <ul>
                <li><a href="#platform">Modules</a></li>
                <li><a href="#live">Product preview</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><Link href="/auth/sign-in">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h3>Company</h3>
              <ul>
                <li><a href="#compare">Why Pholo</a></li>
                <li><a href="#platform">Industries</a></li>
                <li><a href="#pricing">Plans</a></li>
                <li><Link href="/auth/sign-up?trial=1">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h3>Start</h3>
              <ul>
                <li>
                  <Link href="/auth/sign-up?trial=1">
                    Free trial <ArrowUpRight size={12} style={{ display: "inline" }} />
                  </Link>
                </li>
                <li><Link href="/auth/sign-in">Book a walkthrough</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer__base">
            <span>© {new Date().getFullYear()} Pholo · pholo.ca · All rights reserved</span>
            <span className="footer__baseNote">
              <span className="live" aria-hidden /> Records updated across every site
            </span>
          </div>
        </div>
      </footer>
    </DotProvider>
  );
}
