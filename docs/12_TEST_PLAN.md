# 12 — Testing and Acceptance Matrix

## Test strategy
- Unit: pure domain rules, schedules, quote math, state machines, permissions.
- Integration: API + real PostgreSQL test DB (migrations), lock/concurrency, outbox, tenant scoping.
- Contract: OpenAPI/Zod request/response validation; status and error-code consistency.
- E2E: Playwright desktop RTL/English LTR + mobile caregiver/customer workflows.
- Security: negative privilege escalation and cross-tenant matrix, request link token replay, CSRF, file validation.
- Reliability: restart during visit/worker delivery, failed mail provider, cache unavailable, migration and restore rehearsal.

## Test data requirements
- Seed tenant A and B with overlapping human-like synthetic names to ensure isolation does not rely on globally unique names.
- Staff: owner A, coordinator A1/A2, caregiver A1/A2, owner B, caregiver B1, customer A1, customer B1, platform operator.
- Patients: A patient A1/A2; B patient B1. Authorized account A1 can view only A1 patient; family representative case with 2 active grants; revoked grant case.
- Appointments: exact adjacency, buffer boundary, no interval, different caregiver, different tenant, overlapping leave, DST edge in timezone with DST.
- Quotes: fixed, starting and custom, 2 versions, expired, revision pending, accepted, rejected.
- Mock email provider and deterministic clock for tests. Never use real PHI.

## Unit test examples
| ID | Rule | Expected result |
|---|---|---|
| U01 | Recurrence Mon/Wed/Fri, finite inclusive local dates | Exact expected occurrences, no duplicate keys |
| U02 | 60-day cap and 61-day plan | 60 accepted, 61 rejected with `PLAN_DURATION_EXCEEDED` |
| U03 | Local clock during DST spring-forward gap | Validation rejects nonexistent local time |
| U04 | Buffer 30min: previous ends 10:00; next starts 10:29 | Conflict |
| U05 | Buffer 30min: next starts 10:30 | No buffer conflict (subject to other rules) |
| U06 | Candidate after previous visit and before next visit | Both neighbors checked |
| U07 | Primary caregiver available and eligible | Ranked ahead of otherwise comparable eligible candidates |
| U08 | Primary missing clinical verification | Excluded, substitutes may appear |
| U09 | Caregiver on leave | Excluded; impacted future visit flagged |
| U10 | Quote total 12 * 15000 minor units | 180000 (currency correct, no float) |
| U11 | Revision pending on SENT quote | Accept denied with `QUOTE_REVISION_PENDING` |
| U12 | Customer grant revoked | No future access, including file downloads |
| U13 | Task required marked NOT_DONE without reason | Completion 422 |
| U14 | Care plan activated twice same idempotency | Same occurrence set, no duplicates |

## Integration/API cases
| ID | Scenario | Expected |
|---|---|---|
| I01 | Tenant A asks for B patient/visit/doc by id | 404/no content leak |
| I02 | Tenant A reports with crafted B filters | Data restricted to A |
| I03 | Guest tries to track with reference only | Access denied |
| I04 | Expired/consumed email token reused | 401/409, not accepted twice |
| I05 | Customer account email same in A and B | Independent accounts, no session switching |
| I06 | Staff invite used after expiry or from wrong tenant | Refused |
| I07 | Caregiver attempts list of unassigned/other caregiver visits | Refused/restricted |
| I08 | Two coordinators assign overlapping visits in parallel | Exactly one commit, one actionable conflict |
| I09 | Parallel activate same plan | One occurrence per key, stable return |
| I10 | Quote v1 replaced by v2, v1 acceptance | Rejected |
| I11 | Quote accepted twice with same key | One acceptance/outbox emission |
| I12 | Pending customer change request | Original visit unchanged |
| I13 | Approve change where new time now occupied | Conflict; keep pending and original unchanged |
| I14 | Change cutoff exceeded with allowLate=true | LATE queue; no direct mutation |
| I15 | Tenant suspend during authenticated staff session | Next private call denied |
| I16 | Content type spoofing/unsafe file | Quarantined/rejected |
| I17 | Completed visit notes edited via ordinary patch | Denied; append-only correction route required |
| I18 | Sensitive outbox/email payload | No patient free text/address/medical details |
| I19 | 30min -> 60min travel buffer update | Historical unchanged; conflicts flagged prospectively |
| I20 | Scheduled visit assigned caregiver loses verified license | Future impacted visits flagged/reassignment; no new assignments |

## E2E journeys — Playwright
**E01 Agency registration:** fill form -> verify -> pending -> operator activates -> configure brand/services -> portal visible.

**E02 Guest lifecycle:** agency portal AR -> choose service -> submit guest request -> verified secure link -> status page -> coordinator receives queue -> reviews.

**E03 Quote revision:** coordinator sends quote -> verified customer opens -> requests revision -> previous quote locked -> v2 issued -> customer accepts -> coordinator approves request.

**E04 Customer onboarding:** registered account verifies email -> claim old request after fresh verification -> agency grants permission to two patients -> sees only authorized patient summaries.

**E05 Care plan and schedule:** coordinator creates clinical-review-required plan -> qualified reviewer approves -> activate -> preview generated visits -> select primary caregiver -> bulk assign with conflict row flagged -> other row confirmed.

**E06 Caregiver on mobile:** log in -> today's visits -> start -> mark task DONE/NOT_DONE+reason -> save note -> complete -> see Completed; coordinator receives review flag.

**E07 Change request:** customer chooses future visit -> requests reschedule -> pending -> coordinator approves conflict-free new slot -> client and caregiver see update; alternate rejected case preserves old slot.

**E08 Reports:** coordinator filters period/status/service; counts reconcile with seeded rows; B data never included.

**E09 RTL/English:** Arabic navigation orientation, modals/tab order, mixed LTR ids/date; switch English and ensure no overflow on mobile.

## Performance budgets — targets to measure, not guaranteed claims
- Typical paginated list endpoint p95 <= 500 ms against synthetic dataset of 10 tenants x 1,000 visits (under defined hardware/network conditions).
- Schedule candidate suggestion <= 1s median for 100 caregivers over a two-week horizon in local test environment; record hardware and DB plan.
- Guest request/quote accept transaction completes without waiting for email provider response; email asynchronous.
- Worker processes repeated outbox event idempotently; no unbounded retries.
- Cap list size and data expansion; no N+1 relation fetch on high-volume tables.

## Manual UX checklist
- Guest sees plain-language statement that requested time is not confirmed.
- Quotes clearly show version, currency, units and expiry, and do not imply payment.
- Arabic screen readers announce status text and form error; adequate focus rings and tab order.
- Caregiver on 360px width can perform start/end without horizontal viewport scrolling.
- Error and loading states never show unconfirmed success.

## Release gates
- [ ] Core E2E journeys green in CI
- [ ] All negative tenant/isolation tests green
- [ ] Migration clean on empty DB and upgrade DB
- [ ] Auth/session/CSRF/file upload review complete
- [ ] Deterministic recurrence and lock tests pass under concurrency
- [ ] Email templates verified; failed jobs observable and retryable
- [ ] Backup restore and basic monitoring documented
- [ ] No real patient data in test/demo systems
[ ] Pilot and jurisdiction-specific security/regulatory launch readiness reviewed before real patient onboarding
