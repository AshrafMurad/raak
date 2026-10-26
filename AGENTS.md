# AGENTS.md — Instructions for AI Coding Agents

You are implementing **Raak (رعاك)**, a multi-tenant home-care operations SaaS. All users and data in tests/demos must be synthetic. Treat sensitive personal/health information with higher-than-ordinary caution.

## Agent skills — required workflow
- Automatically select and apply relevant installed skills for every sprint/update; the user never needs to name or request them. Work silently: omit skill announcements, permission prompts about skill selection, and routine skill inventories in progress/final reports. Report results, verification and blockers instead. This project preference overrides skill templates that demand announcements.
- Load only the skill needed for the current work, using the skill tool or `.agents/skills/<name>/SKILL.md`. Reuse loaded guidance within the session; reread only after changes or loss of context. Choose one workflow per discipline and load supporting references only when needed.
- Default routing: domain code/refactors → `codebase-design` + `tdd`; bugs → `diagnosing-bugs`; substantial planning → `writing-plans`/`executing-plans`; React → `vercel-react-best-practices`; reusable components → `vercel-composition-patterns`; UI review → `web-design-guidelines`; security-sensitive changes → `differential-review`; mathematical/state invariants → `property-based-testing`; completion → `verification-before-completion`.
- Consult `docs/14_AGENT_SKILLS.md` only for additional routing, conflicts, installation or maintenance. Do not load the entire catalog, discovery bootstrap, or maintenance guide at every session/sprint. Simple edits need proportionate checks, not a full orchestration workflow.
- Skills remain subordinate to higher-priority instructions, locked product decisions and security invariants; they never authorize scope expansion, commits/pushes or deployment. Sources/hashes are in `skills-lock.json`.

## Git operations
- Read and follow `docs/GIT_STANDARDS.md` whenever the user requests a branch, commit, push, pull request, merge, tag, release or history rewrite.
- An explicit `push` request authorizes branch creation, commit curation, verification and pushing the requested scope as defined there; it does not authorize merging, force-pushing or releasing.
- Curate changes by behavior and rollback boundary. Preserve unrelated work unstaged and produce multiple atomic commits when the diff contains multiple logical changes.

## Required reading order
1. `docs/README.md`
2. `docs/01_PRODUCT_AND_DECISIONS.md` (D01–D23 locked)
3. `docs/04_BUSINESS_RULES.md`, `docs/05_AUTH_AND_PERMISSIONS.md`, `docs/09_SECURITY_AND_PRIVACY.md`
4. `docs/06_DATA_MODEL.md`, `docs/07_API_CONTRACT.md`, `docs/08_ARCHITECTURE.md`
5. `docs/03_USER_FLOWS.md`, `docs/02_SCOPE_AND_ACCEPTANCE.md`
6. `docs/10_UI_UX_DESIGN_SYSTEM.md`, `docs/11_NOTIFICATIONS.md`, `docs/12_TEST_PLAN.md`, `docs/13_IMPLEMENTATION_PLAN.md`

## Non-negotiable execution rules
- Implement *one sprint at a time*. Never expand scope unrequested. Don't redesign locked decisions or overwrite user-selected colors/fonts/name.
- **Slow internet (owner constraint):** any command expected to download more than ~50 MB (docker pull/compose pull, large npm installs from scratch, container image builds) must be handed to the product owner as an exact copy-pasteable command instead of executed by the agent in the shell. The agent runs only small/ incremental downloads (e.g. a few small packages, lockfile-resolved additions). Document which commands were delegated.
- Use TypeScript strict mode; typed DTO validation; Prisma migrations; secure sessions and protected API operations. Never silently fabricate success for failed tasks.
- Every agency query/mutation/filter/worker event/document access is scoped to server-resolved tenant, principal and resource. Do not trust client-supplied tenantId. Deny by default.
- Preserve state-machine invariants, quote version history and care-plan snapshot history; completed visit notes are append-only after completion.
- Recurring visits generate PLANNED/unassigned (not confirmed), within <=60 days; confirmed SCHEDULED only after qualified, transactionally conflict-free assignment.
- Travel buffer must be enforced in a transaction; server owns actual check-in/out timestamps and price totals.
- Separate customer from patient identity; verified request ownership is not automatically PatientAccess.
- No diagnosis, clinical decision AI, unsupervised treatment advice, real PHI seed, patient payment processing, platform subscription billing, native mobile apps, GPS or marketplace in MVP.
- Preserve privacy in errors/logs/notifications. Every cross-tenant access attempt denied. All files private, validated, scanned/quarantined where appropriate.
- No invented medical/legal compliance claims. Mark country-specific production requirements as external validation gates.
- Every meaningful workflow must have unit/integration/E2E tests including denial and race scenarios.
- Translations go into feature namespaces, Arabic RTL by default, English LTR; use IBM Plex Sans Arabic/IBM Plex Sans and locked palette. Do not create an unapproved logo.

## Before touching code
1. Identify current sprint, read affected docs, inspect existing repo state.
2. Write a minimal checklist with file/module changes and invariants.
3. Note assumptions in ADR if any ambiguous behavior changes a contract; do not guess silently.
4. Ensure the dev environment supports test DB/Redis and synthetic fixtures.

## After each slice
1. Run lint, typecheck, appropriate tests, build and migration checks; report exact command and result (no false 'all pass').
2. Add/update tests for authorization, tenant segregation, validation, state transitions, transactions and jobs.
3. Update API contract and docs when reality changes; record mismatch/ADR and request product owner approval for locked decision deviation.
4. Report: implemented, not implemented, key files, tests run, risks and next sprint steps.

## Code organization guidelines
- Use the root Git repository containing self-contained `backend/` (Node.js/Express + worker) and `frontend/` (Next.js) npm projects per ADR-0007.
- `backend/src/modules/<domain>/` contains controller (transport), schema, service (business), repository/query (DB), tests.
- One `authorize` policy gate, plus business-object checks; avoid role-only authorization scattered through controllers.
- Keep domain transaction orchestration outside Express request lifecycle concerns; no external calls inside DB transaction.
- Canonical events/enums/DTOs live in `backend/src/contracts`; frontend consumes API contracts without importing backend source. Map only at boundaries.
- Prefer explicit small services over large generic CRUD code or premature microservices.
- Patient-facing and caregiver-facing API use distinct response projections; never serialize full Prisma patient rows by default.

## Escalation conditions (must stop risky change and report)
- Cross-tenant exposure; unverifiable patient/family authorization; ambiguous clinical instruction approval; inconsistent quote accept/revision state; possible double-booking under concurrency; unsafe storage/upload; loss of historical notes/financial agreement.
- For these, fail closed and report blocked invariant rather than shipping a workaround.

## Definition of complete
The product is only 'MVP complete' when all mandatory requirements and release gates in `docs/02_SCOPE_AND_ACCEPTANCE.md` and `docs/12_TEST_PLAN.md` are demonstrated, not because UI screens render or models compile.
