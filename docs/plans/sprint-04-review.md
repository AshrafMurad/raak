# Sprint 4 — scoped security and maintainability review

Date: 2026-11-02. Baseline: clean `main` HEAD `749efe3`.
Scope: new People/customer/file workflows and changes to central policy, live
session rechecks, email delivery, schema, shared transport and frontend consumers.
This is a scoped source/test review, not an independent external audit.

## Findings and disposition

| Finding                                                                                                       | Disposition / evidence                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff-first generic login can select a different audience for a shared staff/customer email                   | Added explicit `/portal/accounts/login`; AUTO login unchanged. Same-email staff/customer and cross-tenant tests prove independent principal types; staff cannot claim requests as customer                                                               |
| Scan finalizers could run provider calls concurrently, and a state read before the tenant lock could be stale | Reserve `scanStartedAt` only after tenant lock + fresh document load; concurrent finalization 409; abandoned/late scan quarantines. Barrier-based integration test and additive migration                                                                |
| File authorization alone after external I/O did not recheck a newly quarantined scan state                    | Recheck CLEAN, checksum, current capability expiry and live authority after read. Regression changes the synthetic document to QUARANTINED inside the storage adapter and observes 404/no bytes                                                          |
| Shared staff service guard needed current session-row revocation/expiry, not only account version             | `common/agency-action.ts` now checks current session and account under tenant lock; prior Sprint 2/3 suites and new denial tests pass                                                                                                                    |
| New modules depended on catalog-located infrastructure / patient-located audit helper                         | Shared gates and record-change helper now live in `modules/common/`; compatibility re-export preserves existing callers; no duplicate policy registry                                                                                                    |
| Email recipient resolution fetched unnecessary full account/request rows                                      | Narrowed to recipient/status/verification/ownership fields; no password hash, intake notes or patient details needed by delivery                                                                                                                         |
| New profile/editor transitions could reset drafts during asynchronous loading; duplicate patient-editor IDs   | Wait for request context, show only one patient editor, keep availability revision local and await caregiver refresh. Real browser regressions exercise those transitions                                                                                |
| Long qualification action copy overflowed dense 360px layouts                                                 | Shortened localized domain labels; shared Button unchanged. Added populated/long-code AR/EN light/dark matrix, 16 checks                                                                                                                                 |
| Cached LocalStack allows anonymous object GET despite the expected private bucket                             | **UNRESOLVED INFRASTRUCTURE BLOCKER.** Strict check observed 200 instead of 403. Production storage startup now uses a non-sensitive privacy probe and remains disabled on failure; no bypass/relaxed assertion. Probe objects cleaned; emulator stopped |

No unresolved application-level tenant/claim/grant/history invariant was found in
the inspected paths. The concrete storage privacy failure remains blocking and
must not be described as passing I16 live infrastructure acceptance.

## Trust boundaries and adversarial cases inspected

- Public registration/token endpoints versus current customer sessions; wrong
  tenant/host/realm, expired/replayed/borrowed proofs, claim races and CSRF.
- Agency patient search/duplicate candidates versus customer summaries and own
  caregiver projection. Platform audit uses its existing action allowlist, so new
  patient/grant reasons are not exposed by the operator audit endpoint.
- One approved request → one patient link, never automatic merge, candidate
  review rechecked at commit, one active grant association and explicit scopes.
- Qualification review cannot be self-asserted; date expiry and withdrawal exclude
  qualification from foundation checks. Titles and the legacy aggregate flag do
  not create clinical authority.
- Polymorphic document parents/classifications rechecked under tenant lock;
  evidence references must be same-parent CLEAN documents. Customer document-read
  grant never becomes upload/evidence authority.
- Immutable randomized object keys, bounded content checks, real-scanner adapter,
  quarantine on errors, scan reservation, short session-bound capabilities and
  revocation/quarantine during external read. No external call in DB transaction.

## Differential scope and call sites

History inspected for permission and delivery changes includes `06deb52`
(service-boundary central policy), `1993591` (catalog actions), `9fdec1e`
(catalog), `4041ff8` (durable request mail), and `2726515` (quotes).
Existing permission rules were extended, not replaced with role-only controllers.
Catalog gate code moved intact plus live-session checks; its old path re-exports
the single implementation. Existing guest delivery semantics and commercial
agreement logic are preserved by the regression suites.

Direct production entry points: one central permission registry; auth login now
has generic and explicit-customer entry points; one request-email worker handles
three security-email event kinds; four new router factories (customer, patient,
caregiver, document) are mounted once each. The shared staff gate affects existing
catalog, request and commercial services as well as new agency workflows;
therefore all corresponding integration and browser suites were rerun.

Counted source call sites: **45** direct `agencyAction()` calls across **8**
production files (46 matches including its definition); three document-policy
calls in the document orchestrator; two direct grant-helper calls, with the
bounded authorized-patient list also applying the equivalent scoped relational
filter. Baseline blame confirms the moved staff gate originated in `9fdec1e`;
tenant/principal/policy checks were retained and live-session checks added.
Critical review anchors: `auth/auth.service.ts:123` (explicit audience),
`documents/document.service.ts:148` (scan reservation), `:258` (post-I/O checks),
`documents/s3-storage.ts:78` (privacy probe).

New production files remain focused: caregiver service approximately 360 lines,
document orchestrator approximately 280, patient operations approximately 240,
with policy/repository, availability, interval math, storage/scanner and transport
split into cohesive files. Frontend separates grants, duplicate editing,
availability, files, service options and feature copy. No generic CRUD framework,
cross-backend frontend import or duplicate visual primitive was introduced.
Sprint 5 should extract/reuse eligibility queries before adding scheduling joins,
not turn the current foundation result into an assignment decision.

Existing larger commercial orchestrators were reviewed for the shared-gate and
approved-request navigation effects; this slice adds no quote workflow logic to
them, so an unrelated split was not introduced. The existing CatalogFrame/
WorkspaceNav composition is reused above PortalShell. Its catalog-local location
is an inherited organization concern to revisit if the common agency header grows;
the new People forms do not copy its appearance or preview primitives.

## Verification and limits

Exact application commands/results and fresh migration/seed replay are in
`sprint-04-status.md`. Final demonstrated local runs: 200 backend tests, 40 frontend
tests, E04/F05/F06 AR/EN and 56 Sprint 4 theme/viewport checks; prior E01/E02/E03
browser suites pass. Real storage privacy checker fails and is explicitly
excluded from passing application tests. Live email remains unverified. The local
real ClamAV check subsequently passed as recorded below. No human screen-reader or independent penetration-test signoff
is claimed.

The final API evidence case also exercises scanned authorization evidence →
reviewed grant and qualification evidence → agency verification, rejects
wrong-parent/classification references, and confirms that a customer's document
scope does not expose authorization evidence. Its scanner remains an explicit
test double; this does not close the live infrastructure gate.

An early attempt to run Sprint 2 and Sprint 3 browser harnesses concurrently hit
EADDRINUSE because both own ports 3110/3111. They were rerun sequentially and
passed; the local guide requires that ordering. A PostgreSQL driver concurrent
query deprecation warning appeared without failing assertions; no pg upgrade is
included in this sprint. The previously documented invitation timing-test
observation remains a separate inherited reliability note.

The owner approved the I12 mapping correction on 2026-11-02; the implementation
plan is updated and I12 retains Sprint 6 ownership. No independent reviewer/subagent result, live email delivery,
deployment or production-readiness certification is claimed.

### Real-engine continuation — 2026-11-02

The owner-provisioned `raak-clamav-sprint4` container was inspected as healthy,
using the requested digest-pinned image, loopback-only port 3310 and persistent
signature volume. Logs confirm successful daily/main/bytecode initialization.
From `backend/`, `npm exec -- tsx scripts/check-malware-scanner.ts` exited 0:
the synthetic control was CLEAN and the in-memory EICAR marker REJECTED through
the real application scanner adapter. The prior startup-time QUARANTINED result
is superseded by this successful run; no mock or persisted EICAR file was used.

This continuation changes documentation only, so no new production responsibility,
workflow duplication or cross-domain dependency was introduced. Root
`git diff --check` passed. Application/build/browser/migration suites were not
rerun; their preceding evidence remains in the status ledger. Real private-S3
interoperability and the combined storage/scanning document journey remain blocked
on an IAM-enforcing endpoint; live email also remains open. ADR-0011's mapping
correction was subsequently owner-approved and recorded.

Owner subsequently confirmed (2026-11-02) that neither private S3-compatible
storage nor an email provider is available, and deferred their verification to
their own server later. These gates remain open by explicit owner direction;
no privacy assertion, scanner requirement or acceptance mapping was relaxed.
