# Sprint 4 — People and Access status

Date: 2026-11-02.
Status: **People workflows implemented and locally demonstrated; private-storage
acceptance has owner-deferred/open infrastructure gates; milestone mapping approved.**

Owner direction (2026-11-02): no private S3-compatible service or email provider
is currently available. The owner will arrange and verify these later on their
own server. Both infrastructure gates are explicitly deferred and remain open;
this is not acceptance of the failed emulator. The owner subsequently approved
ADR-0011's mapping correction; the infrastructure gates remain open.

This is not an unconditional Sprint 4 closure or an MVP-complete claim. The
installed LocalStack emulator returned HTTP 200 for anonymous object access.
The production S3 adapter now probes privacy with non-sensitive bytes before
being enabled; failed verification leaves file operations unavailable. The
failing gate was not weakened. LocalStack was stopped again; volumes preserved.

## Delivered workflows and key files

- Customer registration, resend, email verification, explicit customer-audience
  sign-in and fresh request claiming: `backend/src/modules/customers/`,
  `modules/auth/{auth.controller,auth.service}.ts`, `contracts/people.ts`.
  Matching email never links a request or grants patient authority. Claims are
  tenant/customer/request bound, single-use, expiry checked and serialized with
  ownership/audit/outbox. Same-email staff/customer identities stay independent.
- Operational patient list/detail/edit, reasoned advisory duplicate review and
  replay/concurrency-safe create/link from APPROVED requests:
  `backend/src/modules/patients/{patient.service,patient.repository}.ts`.
  Request associations never replace an existing target or rewrite agreements.
- Explicit independent PatientAccess issuance, scope/expiry checks and immediate
  revocation: `patients/patient-access.service.ts`. Owner/Admin review only;
  customer summaries are exactly id/name/status. VIEW_DOCUMENTS does not imply
  VIEW_BASIC, uploads or evidence-document access.
- Caregiver operational profiles, existing invitations/accounts, qualifications
  with agency review/withdrawal/expiry, explicit service authorizations and
  revision-controlled weekly hours/date exceptions:
  `backend/src/modules/caregivers/`. The foundation eligibility result explicitly
  says booking availability is not checked and no appointment is confirmed.
- Private file DTOs, parent/classification policy, bounded binary upload,
  immutable randomized storage keys, signature/trailer validation, reserved
  scanning/quarantine, checksum-checked session-bound download capabilities:
  `backend/src/modules/documents/`. S3 SigV4 and ClamAV INSTREAM adapters exist;
  no simulated scanner or public-file fallback exists in production.
- Shared live-principal gate moved to `modules/common/agency-action.ts`, with a
  compatibility re-export for existing Sprint 2/3 callers. Audit/outbox changes
  share `common/record-change.ts`; customer checks use `customer-action.ts`.
- Security email events reuse the existing outbox/lease/retry worker. Recipient
  and current tenant/account/request are rechecked; new events contain no email,
  plaintext token, patient text or file capability. Live provider/domain proof
  inherited from Sprint 2/3 remains open.
- Frontend `features/people/` and `messages/{ar,en}/people.json`: `/account`,
  `/my/patients`, `/workspace/patients`, `/workspace/caregivers`,
  `/caregiver/profile`; approved-request navigation and shared workspace links.
  Includes reasoned duplicate creation, grant/revoke forms, named service
  selection, qualification review, weekly hours/leave and private file states.

## Acceptance evidence

| Requirement                       | Actual evidence                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F05 / E04 AR and EN               | Installed Chrome: register → captured security email → verify → customer-only sign-in → fresh claim email → claim old request → agency creates/reviews two patients → independently grants both → customer sees only their summaries → revoke one → next customer read excludes it |
| F06 / approved request conversion | Browser create-from-APPROVED plus manual duplicate review; API preapproval denial, explicit existing-patient linking, concurrent conflicting links (one winner), stable replay and concurrent create returning one patient                                                         |
| U12                               | Real API/PostgreSQL revoked/expired grants deny subsequent summaries; an already-issued document capability fails after grant revocation                                                                                                                                           |
| Exact I01 patients/documents      | Existing B patient/document IDs queried from A return 404; caregiver/customer agency browse denied; platform content browse denied. Visit portion remains Sprint 5–6                                                                                                               |
| I16 application controls          | Spoofed magic bytes rejected; oversized/unsafe filenames/types rejected; unscanned/quarantined downloads denied; absent scanner quarantines, absent storage returns 503; mid-read quarantine denies bytes; concurrent scan reservation and abandoned-scan quarantine covered       |
| I16 live private-storage gate     | **BLOCKED / FAILED**: cached LocalStack anonymous GET returned 200. `scripts/check-private-storage.ts` exits nonzero; production storage activation rejects this privacy failure before sensitive uploads                                                                          |
| Real ClamAV adapter/engine        | **PASSED 2026-11-02**: healthy owner-provisioned pinned container; synthetic clean control CLEAN and in-memory EICAR REJECTED through the real INSTREAM adapter. This closes the local real-engine check, not the separate S3 gate |
| Caregiver foundations             | API tests verify independent agency review, expiry at requested local date, service authorization, stale availability denial, leave and verification withdrawal. Browser exercises setup and eligibility without booking claims                                                    |
| Interval invariants               | Exhaustive occupied-hour oracle over 64 schedules, all bounded start/end pairs and reversed interval order; typed overlap/date/leave validation                                                                                                                                    |
| Localization/accessibility        | 40 Sprint 4 AR/EN × light/dark × mobile/desktop route checks, plus 16 populated caregiver/file/long-content checks at 360/1440px. Keyboard Select/Escape/focus and reduced-motion caregiver contexts exercised                                                                     |
| Prior sprints                     | Final Sprint 2 E01/E02 AR/EN + 56 route checks; Sprint 3 E03 AR/EN, I10/I11 + eight commercial viewport/theme checks passed                                                                                                                                                        |
| I12 | **Not implemented or claimed.** Retains its pending-visit-change meaning and Sprint 6 ownership; ADR-0011's Sprint 4 mapping correction is owner-approved (2026-11-02) |

Tests: `backend/test/people/{customers.integration,patients.integration,
availability,storage}.test.ts`, `backend/test/browser/sprint4.e2e.ts`;
frontend translation parity and binary-upload/download-origin tests.

## Verification ledger

All directories below are relative to `E:\projects\MERN stack\raak`.
Latest full application run: backend **26 files / 200 passed**, frontend
**8 files / 40 passed**, no skipped tests. Scoped review notes are recorded
in `sprint-04-review.md`; individual blocked infrastructure checks are separate.
These full application results precede this continuation; they were not rerun
for the documentation-only scanner-evidence update.

| Directory   | Command                                                                                                 | Observed result                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `backend/`  | `npm run lint`                                                                                          | passed                                                                                 |
| `backend/`  | `npm run typecheck`                                                                                     | passed                                                                                 |
| `backend/`  | `npm test`                                                                                              | 200 passed                                                                             |
| `backend/`  | `npm run build`                                                                                         | API/worker emitted                                                                     |
| `frontend/` | `npm run lint`                                                                                          | passed                                                                                 |
| `frontend/` | `npm run typecheck`                                                                                     | passed                                                                                 |
| `frontend/` | `npm test`                                                                                              | 40 passed                                                                              |
| `frontend/` | `npm run build:browser`                                                                                 | passed; same-origin browser configuration                                              |
| `frontend/` | `npm run build`                                                                                         | passed; normal production build                                                        |
| `backend/`  | `npm run test:browser:sprint4`                                                                          | E04/F05/F06 AR/EN; 40 + 16 layout/theme checks; caregiver/file-double workflows passed |
| `backend/`  | `npm run test:browser:sprint3`                                                                          | E03 AR/EN, I10/I11, eight layout checks passed                                         |
| `backend/`  | `npm run test:browser`                                                                                  | E01/E02 AR/EN, 56 prior route checks passed                                            |
| `backend/`  | `npm exec -- prisma validate`                                                                           | valid schema                                                                           |
| `backend/`  | `npm exec -- prisma migrate status`                                                                     | 10 migrations, up to date                                                              |
| `backend/`  | `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | no difference                                                                          |
| `backend/`  | `npm exec -- tsx scripts/check-private-storage.ts`                                                      | **failed privacy gate**; `STORAGE_PRIVACY_CHECK_FAILED` against cached LocalStack      |
| Root        | `docker inspect --format "{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}" raak-clamav-sprint4` | passed: `running healthy` |
| Root        | `docker logs --since 30m raak-clamav-sprint4` | signature initialization passed: daily 28172, main 63, bytecode 339; clamd started |
| `backend/`  | `npm exec -- tsx scripts/check-malware-scanner.ts` | passed (exit 0): synthetic control CLEAN, in-memory EICAR REJECTED against real engine |
| Root        | `git diff --check`                                                                                      | passed                                                                                 |

### Migrations and fixtures

Four additive Sprint 4 migrations; ten total. No applied history was edited.
Fresh disposable DB `raak_sprint4_verify_20261102`: `npm run migrate`,
`npm run seed`, then both again; migration status current and schema diff empty.
Stable seed counts: 2 tenants / 1 operator / 4 staff / 2 customers / 2 invitations /
4 patients / 3 grants / 1 caregiver. Additional counts: one qualification, one
service authorization, one weekly slot, one dated exception, **zero fabricated
CLEAN documents**. Disposable DB dropped; absence confirmed by count 0.

Seed is create-only and preserves edited existing fixtures/revocations. It uses
synthetic names and credentials only; no real patient/license/evidence files.

Exact disposable replay commands, working directory `backend/` (all exited 0):

```powershell
docker exec raak-postgres-1 createdb -U raak raak_sprint4_verify_20261102
$env:DATABASE_URL='postgresql://raak:raak-dev-only@localhost:5433/raak_sprint4_verify_20261102'; npm run migrate; if ($?) { npm run seed }; if ($?) { npm run migrate }; if ($?) { npm run seed }; if ($?) { npm exec -- prisma migrate status }; if ($?) { npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code }
docker exec raak-postgres-1 psql -U raak -d raak_sprint4_verify_20261102 -c "SELECT (SELECT count(*) FROM caregiver_qualifications) AS qualifications, (SELECT count(*) FROM caregiver_service_authorizations) AS service_authorizations, (SELECT count(*) FROM availability_slots) AS weekly_slots, (SELECT count(*) FROM availability_exceptions) AS dated_exceptions, (SELECT count(*) FROM documents WHERE scan_status='CLEAN') AS fabricated_clean_documents;"
docker exec raak-postgres-1 dropdb -U raak raak_sprint4_verify_20261102
docker exec raak-postgres-1 psql -U raak -d postgres -tAc "SELECT count(*) FROM pg_database WHERE datname='raak_sprint4_verify_20261102'"
```

DATABASE_URL was process-local for replay; the normal development DB was not reset.
The separate LocalStack check used `docker compose up -d --pull never localstack`,
`npm exec -- tsx scripts/check-private-storage.ts` (nonzero privacy failure), then
`docker compose stop localstack`, all from `backend/`. Probe cleanup ran in finally.

## Shared UI

Reused `components/ui/{button,field,select,feedback}.tsx`, existing theme/context
and `components/layout/portal-shell.tsx`, catalog Frame/WorkspaceNav. No new
shared primitive or visual variant was introduced, so no new board variant was
needed. `people.css` only adds long-content/fieldset layout resilience; locked
palette, fonts, shared treatments and design-preview implementations remain the
source of truth. Responsive review shortened overlong domain action copy rather
than creating competing button styles.

## Open gates and Sprint 5 handoff

1. **Blocking private storage:** provide an endpoint that denies anonymous reads
    and passes the privacy/immutable-write checks. The cached LocalStack is not
    accepted as private. No sensitive upload is enabled against that failed gate.
    Owner deferred provisioning/verification to their own server; no endpoint is
    available for further verification in this session.
2. **Real malware scanning local gate passed:** owner-provisioned ClamAV is healthy;
   the real adapter returned CLEAN for the synthetic control and REJECTED for EICAR.
   This does not establish end-to-end private S3 upload/scan/download acceptance
   or production engine operations/signature freshness monitoring.
3. **Live email:** provider/domain validation remains open; captured delivery and
    retry proof do not close it. General business-event delivery remains Sprint 7.
    Owner has no provider configured and deferred live verification to later.
4. **Owner approval received 2026-11-02:** ADR-0011 adopts F05/F06, E04, U12,
   I16 and patient/document I01 with caregiver foundations and denial/race coverage.
   The implementation plan is corrected; I12 remains Sprint 6 work.
5. Customer attachment writes/coordinator grant delegation have no approved
   positive scope; they remain denied. No new permission was invented.
6. Sprint 5 owns care-plan history, recurrence/DST, visit-specific area/candidate
   matching, travel buffers, transactional assignment and prospective impact
   scans. Reuse tenant→caregiver lock order, verified qualification rows, local
   hours/revisions and durable exception/qualification events. Foundation
   eligibility is not booking eligibility.

No care plans, scheduling, visit execution/change requests, payments,
subscriptions or deployment were added. No commits or pushes were made. No
agent-initiated package/image/browser download was performed; the owner ran the
delegated ClamAV setup. Cached LocalStack was started only with `--pull never`,
checked, cleaned of probe objects and stopped again.

## Follow-up — initial gate investigation (before owner scanner setup)

- Docker Desktop was stopped when work resumed; `docker desktop start` restored
  the installed daemon. Cached backing services were started with `--pull never`.
- LocalStack inspection found a private ACL and all four public-access-block
  flags already set, but no bucket policy. Its documented default disables IAM
  enforcement, so metadata alone cannot prove privacy. No existing policy/object
  was overwritten. LocalStack was stopped again after the inspection.
- Added `scripts/check-malware-scanner.ts`: real-engine clean-control/EICAR
  assertions, no fake scanner and no persistent test file. Running
  `npm exec -- tsx scripts/check-malware-scanner.ts` from `backend/` failed on the
  clean-control precondition with the fail-closed QUARANTINED result. No real
  engine scan was established in that attempt; the EICAR stage was not reached.
- The official scanner's inspected base image is ~43 MB compressed, but initial
  signature downloads are additional and cannot be bounded below 50 MB. Exact
  owner-run, digest-pinned setup commands and persistent-volume instructions are
  in `../SPRINT_4_LOCAL_CHECK.md`. No pull/start of that scanner was attempted;
  At that point, owner confirmation was still pending.

## Continuation — real scanner verification, 2026-11-02

- Owner confirmed execution of the delegated setup. Inspected the existing
  `raak-clamav-sprint4` container without pulling or recreating it: running/healthy,
  image `clamav/clamav@sha256:58168cd4f48a118c7d20b76da8ffce97e579b84ed7e6d1e977c6e22b1e989c5a`,
  port `127.0.0.1:3310`, volume `raak-clamav-signatures:/var/lib/clamav`.
- Logs confirmed successful database tests/updates for daily 28172, main 63 and
  bytecode 339, followed by clamd startup. The real checker exited 0 with
  `PASS real ClamAV engine: synthetic control CLEAN and in-memory EICAR REJECTED`.
  This supersedes the earlier QUARANTINED clean-control attempt; EICAR now ran.
- No production code changed in this continuation. Updated plan/status/review/
  local-check evidence; root `git diff --check` passed after those edits.
- **Failed (prior evidence):** LocalStack anonymous GET privacy assertion (200).
  **Blocked:** private S3 acceptance and live email delivery (owner-deferred).
  Owner mapping approval was subsequently received and recorded in ADR-0011.
  **Unrun in this continuation:** full application/browser/migration suites and
  end-to-end real S3-plus-scanner document journey. No new endpoint/provider was
  supplied, so the failed emulator was not restarted or treated as private.
