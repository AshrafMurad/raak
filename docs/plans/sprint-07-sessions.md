# Sprint 7 — Operational quality and launch prep: multi-session plan

Date: 2026-11-04. Sprint 7 is larger than one agent session. This document
splits it into six ordered, independently verifiable sessions. Each session
implements exactly one slice, runs the full required checks, records evidence
in `docs/plans/sprint-07-status.md` (append per session) and pushes its own
branch for owner review/merge before the next session starts.

Baseline: Sprint 6 merged to `main` (PR from
`feat/sprint6-visits-and-changes`). Locked D01–D23 and existing ADRs stay
locked; deviations require a new ADR and owner approval.

## Owner-dependency gates (never silently simulated)

| Gate | Owner action needed | Code stance until then |
| --- | --- | --- |
| Live email provider/domain | Provide/verify `EMAIL_API_KEY`, verified `EMAIL_FROM`, `BASE_DOMAIN` | Events stay pending; worker reports `EMAIL_NOT_CONFIGURED`; no fake sends |
| Private S3 object storage | Provide S3-compatible endpoint passing the startup privacy probe | Uploads rejected 503; existing fail-closed behavior unchanged |
| Deployment downloads | Run any Docker/Coolify image or dependency downloads > ~50 MB via exact delegated commands | Agent prepares configs and hands over commands; waits for confirmation |
| Jurisdictional/regulatory review | External legal/operational review before real patient data | Documentation only; no compliance claims |

## Session map

| # | Slice | Primary exit evidence |
| --- | --- | --- |
| 1 | Notification policy + general delivery pipeline | Policy matrix, dedupe/retry/suspension integration tests green |
| 2 | In-app inbox + notification preferences UI | Bilingual inbox/settings E2E; i18n parity green |
| 3 | Business templates + reminders | Template matrix tests AR/EN; reschedule invalidation tests |
| 4 | Reports + audit screens | E08 reconciliation + tenant-scoping (I02) tests green |
| 5 | Accessibility, locale and performance QA | E09 sweep results + measured budgets recorded |
| 6 | Deployment, backup/restore, release gates | Gate checklist in docs/12 updated with evidence |

Sessions must run in order (1→2→3 build on each other; 4 is independent but
follows 1 for event/audit reuse; 5–6 are last). If a session cannot finish,
stop at a coherent boundary, record partial status honestly and resume the
same session before moving on.

---

## Session 1 — Notification policy and general delivery pipeline (backend)

Scope:
- `NotificationPolicy(tenantId,eventType,channel,enabled,reminderOffsetMin?,updatedBy,updatedAt)`
  schema + API. Essential events (docs 11 matrix) immutable server-side;
  optional events tenant-configurable. Personal opt-out model for optional
  events only.
- General outbox dispatcher: resolve audience, access, current tenant status,
  tenant policy and personal preferences; create in-app record and queue email
  with stable dedupe key `(eventId,recipient,channel)`; bounded exponential
  backoff, permanent-failure marking, safe failure observability for admins.
- Worker generalization beyond the dedicated request-email queue without
  regressing Sprint 2–6 delivery behavior; other event kinds remain
  durable/undiscarded until policy says otherwise.
- Suspended tenant: no operational mail; security/identity notification
  policy per docs 11.

Out of scope: end-user UI (Session 2), templates/reminders (Session 3),
reports/audit screens (Session 4).

Key files: `backend/prisma/schema.prisma` + additive migration,
`backend/src/contracts/` (policy DTOs, events), `backend/src/modules/notifications/`
(new), `backend/src/worker/`, tests under `backend/test/notifications/`.

Invariants: no PHI/free text in payloads or logs; dedupe prevents duplicate
in-app/email per eventId+recipient+channel; revoked grants rechecked at
delivery; every mutation tenant-scoped with central `authorize()`.

Exit checks: full backend suite (incl. new policy/dedupe/retry/suspension
tests), lint/typecheck/build, prisma validate/status/diff, frontend untouched
but lint/typecheck/test/build still run; browser suites unchanged-green.

## Session 2 — In-app inbox and notification preferences UI

Scope:
- Backend: inbox list/unread badge count/mark-as-read for current principal
  and tenant; unread-only filter; links resolve to tenant-authorized
  resources with generic unavailable state on stale authorization.
- Frontend (AR RTL/EN LTR): header badge, inbox screen, personal notification
  preferences (optional events only), agency notification-policy settings
  screen with essential events visibly locked.
- Reuse shared UI primitives; new namespaces `notifications`/`settings`
  extension; URL-backed filters; i18n parity tests extended.

Exit checks: full backend+frontend suites; i18n parity; browser E2E for
badge→inbox→read→navigate and settings flows in both locales and 360px.

## Session 3 — Business templates and visit reminders

Scope:
- Localized (AR/EN) templates for the docs 11 event matrix with safe-content
  rules (no patient identity, addresses, notes, clinical detail), generic
  subjects, authenticated CTA links to tenant portal routes.
- Visit reminders: default optional 24h/2h offsets; skip when booked inside
  offset; cancel/recompute stale reminder jobs on reschedule/cancel with
  event-version checks at delivery time.
- Email rendering (plain text/RTL-safe) through the existing verified-adapter
  gate; delivery attempts observable.

Exit checks: template content tests both locales; reminder
schedule/invalidate/reschedule tests; dedupe on retries; browser E2E where
feasible with the capture sender.

## Session 4 — Reports and audit screens

Scope:
- Reports API+UI: requests, visit statuses, timeliness, caregiver load with
  time/status/service filters; counts reconcile with source records (E08);
  always tenant-scoped (I02); platform operator sees aggregates only, no raw
  patient rows.
- Audit screens: append-only audit trail views with safe summaries
  (actor/entity/time/reason), pagination, no notes/patient dumps.
- Query hygiene: no N+1 on high-volume tables, capped list sizes.

Exit checks: report reconciliation and cross-tenant filter denial tests;
audit-view tests; E08 E2E in AR/EN.

## Session 5 — Accessibility, locale and performance QA

Scope:
- E09 sweep: RTL orientation, modal/tab order, focus rings, mixed LTR
  ids/dates, EN overflow on mobile; keyboard-complete core flows.
- Manual UX checklist items from docs 12 across key screens.
- Performance budgets (docs 12): measure paginated list p95, candidate
  suggestion latency, guest/quote transaction independence from email,
  worker idempotency under repeated events; record hardware/DB plan.

Exit checks: documented measurements with environment notes; fixes for found
defects with regression tests; all suites green.

## Session 6 — Deployment, backup/restore and release gates

Scope:
- Docker/Coolify deployment configuration, managed secrets, health/readiness
  endpoints for API/web/worker, queue-depth/failed-job monitoring hooks,
  structured log redaction review.
- Backup + restore rehearsal on disposable data; migration replay on empty
  and upgrade DBs; rollback path documented.
- Update docs/12 release-gate checklist with evidence links; final Sprint 7
  status; list remaining external launch gates explicitly (they stay open).

Constraint: all image/dependency downloads > ~50 MB are owner-run; provide
exact copy-pasteable commands with working directory and purpose, then wait.

Exit checks: verified local rehearsal evidence; owner-delegated commands
recorded; release-gate checklist updated honestly (unchecked boxes remain
unchecked unless demonstrated).

---

## Per-session protocol

1. Confirm the previous session's PR is merged; branch
   `feat/sprint7-<slice>` from current `main` (kebab-case, conventional
   prefix per docs/GIT_STANDARDS.md).
2. Write/update the session's implementation plan under
   `docs/plans/sprint-07-*.md` before coding; note interpretations as ADRs.
3. Implement the slice only; synthetic data only; deny-by-default
   authorization; tenant-scoped queries; no PHI in errors/logs/payloads.
4. Run and report exact verification commands and results per AGENTS.md:
   backend and frontend lint/typecheck/test/build, prisma checks, relevant
   browser suites, `git diff --check`.
5. Curate atomic commits, push the branch, report commits/verification/risks
   and the next-session handoff. Never merge, release or claim MVP-complete
   without owner instruction; release gates in docs/12 define deployability.

## General session prompt

Preserve verbatim for every session; replace `<N>`:

```text
Read AGENTS.md, docs/README.md, docs/01 through docs/14, docs/GIT_STANDARDS.md
and docs/plans/sprint-07-sessions.md. Treat D01–D23 and existing ADRs as
locked. You are implementing Sprint 7 SESSION <N> ONLY, exactly as scoped in
the "Session <N>" section of docs/plans/sprint-07-sessions.md; confirm the
previous session's PR is merged and branch feat/sprint7-<slice> from current
main before coding.

Do not implement later sessions' features, expand scope, use real patient
data, fabricate compliance claims, or weaken tenant authorization, privacy
projections, immutability or CSRF/idempotency invariants. Live email, private
S3 and any download over ~50 MB are owner gates: stay fail-closed, hand me
exact commands and wait. Never fake success for failed or unverified tasks.

Every query/mutation is tenant-scoped from server-resolved context with one
central authorize() gate plus business-object checks; outbox/payloads carry
IDs only; keep transactions free of external calls. Update API contract docs
and record interpretations as ADRs; append session evidence to
docs/plans/sprint-07-status.md.

Before reporting completion run, separately, and show exact commands and
results: backend and frontend npm run lint, typecheck, test, build; npm exec
-- prisma validate, migrate status and migrate diff --from-config-datasource
--to-schema prisma/schema.prisma --exit-code (backend/); the browser suites
affected by this slice (npm run build:browser in frontend/ first); and
git diff --check. Report implemented, not implemented, key files, tests run,
risks and the handoff for the next session. Commit atomically per
docs/GIT_STANDARDS.md and push only when I ask you to push.
```
