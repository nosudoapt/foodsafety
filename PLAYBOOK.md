# FoodSafe / Between the Buns — Build Playbook

My working contract. Every task follows the loop. Ponytail discipline is non-negotiable.

## 0. Ponytail ladder (before writing ANY code)
Stop at the first rung that holds:
1. **Does it need to exist?** (YAGNI — cut speculative work)
2. **Already in this repo?** Reuse the helper/type/pattern.
3. **Stdlib / Next / React does it?** Use it.
4. **Native platform feature?** CSS over JS, DB constraint/RLS over app code.
5. **Already-installed dep?** (supabase, date-fns, lucide, tailwind) — no new deps for a few lines.
6. **One line?** Ship it.
7. Only then: minimum code that works. Mark shortcuts with `// ponytail:` + upgrade path.

**Never lazy on:** input validation, error handling, security/RLS, accessibility, or anything explicitly requested. The ladder shortens the solution, never the reading.

## 1. Loop: BUILD → REVERT → TEST → BUILD
Per feature, in order:
1. **Read** the target files + `26d5020` diff for that feature. Reuse what exists.
2. **Build** the smallest wired version.
3. **Revert-check:** `npm run build` + `npm run lint` must pass. If broken, revert the change (`git restore`) rather than patch-on-patch.
4. **Test:** one runnable check per non-trivial logic (formula, RLS, auth guard). Manual smoke on iPad viewport (1024×1366) + desktop.
5. **Build for real:** commit only when green. Small commits, one feature each.

Commands:
```bash
npm run build
npm run lint
npm run dev   # port 5001
```

## 2. Execution order (foundation first, then re-land)
1. `src/lib/roles.ts` — single source: all 6 roles (staff, manager, owner, multi_location_owner, corporate, designer) + labels/colors/nav-visibility. Re-widen DB CHECK constraint to match.
2. **Auth:** mount `AuthProvider` in root layout; `handle_new_user` trigger (server-side profile row); fix sign-up role; `middleware.ts` guarding `/admin` + BTB admin/vault/docs. BTB staff pages stay public (tablet).
3. **Entry `/`:** chooser → Demo login | Between the Buns login (separate logins).
4. **Wire graph:** `between-the-buns/layout.tsx` header (← Hub · Home); Sidebar gains BTB + Home; hub links back to `/`.
5. **Re-land `26d5020`** in order SQL → shell → pages, wired not orphaned.

## 3. Design system (extra-trim, sophisticated)
- **Tokens in `globals.css`** (CSS vars): brand green (FoodSafe) / red (BTB), spacing scale, radius, shadows. One `components/ui.tsx` — Button, Card, Input, Badge, Sheet. Reuse everywhere; no per-page bespoke styling.
- **Type:** one font (Geist/Inter), tight scale, generous whitespace, left-aligned. Content-first, chrome-light.
- **Motion (native + cheap):** CSS transitions + `@keyframes`; `view-transition-name` for route changes; `prefers-reduced-motion` respected. Micro-interactions only (150–250ms ease-out): card hover-lift, button press, list stagger via CSS `animation-delay`. No animation library unless a screen truly needs it.
- **Signature screens** = prep sheet + cleaning schedule: fast tablet entry, live `MAKE = PAR − OH`, before/after photo diff. These carry the brand — polish them first.

## 4. Protection / defensibility (USP moat)
- **Auth:** middleware server-guard (no client-only flash), RLS on every table, `handle_new_user` trigger, 6-role RBAC.
- **Data moat (hard to copy):** per-location compliance timeline — expiry alerts + handbook e-signatures + quarterly rubric scores accumulate into an auditable history a competitor can't replicate by cloning a screen.
- **Enterprise wedge:** multi-location corporate rollup + rubric scoring.
- **Continuity layer:** steps-to-do + login vault + emergency contacts bundled — nobody else ships this.
- **Secrets:** never inline keys; env vars only; vault passwords encrypted at rest (Supabase Vault / pgcrypto), never returned to non-owner roles.

## 5. iPad + Web (one codebase)
- **PWA** (native, no framework): `public/manifest.json` (`display: standalone`, icons 180/192/512, portrait), meta `apple-mobile-web-app-capable`, service worker for offline shell + last prep/temp data. → "Add to Home Screen" = installable iPad app.
- **Responsive:** Tailwind breakpoints; tablet-first for staff pages (large tap targets ≥44px), desktop-dense for admin.
- **Offline-tolerant:** staff entry queues locally, syncs on reconnect (ponytail: start with optimistic write + retry, not a full sync engine).

## 6. Definition of done (per feature)
- [ ] Reused before writing new (ladder logged in commit if notable)
- [ ] `build` + `lint` green
- [ ] Wired both directions (no orphan/dead-end)
- [ ] RLS + role gate correct
- [ ] iPad + desktop smoke passed
- [ ] Runnable check for any formula/guard

_Ref: [ponytail skill](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md)_
