# Sprint 4 — Local People and Access check

Use synthetic data only. See `plans/sprint-04-status.md` for actual evidence and
`plans/sprint-04-review.md` for findings/gates. The installed LocalStack currently
fails anonymous-access privacy verification; do not enable it for patient files.

Owner direction (2026-11-02): private storage and live email are unavailable
locally and will be configured/verified later on the owner's server. Their gates
remain deferred/open. Retain the strict checks below for that verification;
the successful local ClamAV check does not close those separate gates.

## Prerequisites

- Installed Node 24.21.0/npm, existing backend/frontend dependencies, PostgreSQL
  and Redis, installed Chrome (`channel: chrome`). Do not install browser binaries.
- Backend `.env` points at the local DB/Redis with a >=32-character SESSION_SECRET,
  BASE_DOMAIN=localhost and trusted same-host frontend origins. This session used
  PostgreSQL port 5433; keep DATABASE_URL and compose port settings consistent.
- No install/pull is performed by the commands below. If dependencies/images are
  absent, estimate the complete download first; large/unknown transfers are
  owner-run under AGENTS.md.

## Automated complete local journey

Working directory: `E:\projects\MERN stack\raak\frontend`

```powershell
npm run build:browser
```

Working directory: `E:\projects\MERN stack\raak\backend`

```powershell
npm run migrate
npm run test:browser:sprint4
```

The harness starts its own real API/Next ingress on 3120/3121, creates isolated
synthetic tenants/accounts/requests, uses installed Chrome, and cleans its rows
and processes afterwards. It captures security email in memory and injects
explicit private-storage/scanner doubles. It proves no live provider or malware
scan. `--headed` can show the automated interactions:

```powershell
npm run test:browser:sprint4 -- --headed
```

Expected output: E04/F05/F06 in AR and EN; two independent grants and revocation;
40 route/theme/viewport checks; caregiver qualification/service authorization/
weekly-hours/eligibility and private-file-double flow; 16 populated caregiver/file
checks, including 360px long-content layout and quarantine state.

Run prior browser suites **sequentially**: both use 3110/3111.

```powershell
npm run test:browser:sprint3
npm run test:browser
```

## API/unit/build checks

From `backend/`, run separately and inspect each exit code:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm exec -- prisma validate
npm exec -- prisma migrate status
npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

A normal frontend build may use `.env.local`'s split-port API configuration;
re-run `build:browser` before the same-origin harness. Root `git diff --check`
checks whitespace, not workflow correctness.

## Optional manual synthetic fixture exploration

From `backend/`, `npm run seed` creates/replays synthetic fixtures without
overwriting edited existing records. Start API and frontend in separate terminals
using their existing `npm run dev` commands and normal split-port configuration
(`NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` in frontend local environment;
API_CORS_ORIGINS includes `http://afiya.localhost:3000`). These are existing local
processes, not deployment commands.

- Agency `http://afiya.localhost:3000/en/login`: owner
  `owner.afiya@example.invalid`, password `Synthetic-Dev-Only-1!`.
- Customer `http://afiya.localhost:3000/en/account`: use the customer sign-in form,
  `customer.afiya@example.invalid`, same synthetic password. `/my/patients` shows
  two independently granted summaries; the third/revoked patient stays invisible.
- Caregiver `caregiver.afiya@example.invalid`: existing tenant login, then
  `/caregiver/profile`. Own qualifications/hours only; no all-patient search.
- Agency `/workspace/patients`: inspect/edit a profile, review duplicates before
  creating, issue/revoke reviewed grants. From an APPROVED request, use its
  create/link navigation; no patient is created merely by approval.
- Agency `/workspace/caregivers`: inspect the seeded caregiver, qualifications,
  service checkboxes, Monday hours and leave. The synthetic eligibility service
  is an unpublished draft fixture. Monday 2026-12-07 09:00–10:00 is within seeded
  hours; 2026-12-14 is seeded full-day leave. No visit/conflict/buffer check occurs.
- Repeat `/ar/...`, light/dark and mobile, keyboard Tab/Select/Escape. The
  automated harness is the reproducible evidence for registration/claim emails
  when a real provider is not configured.

## Private storage gate — blocked; local real-scanner check passed

`backend/.env.example` documents OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_BUCKET,
access keys/region and CLAMAV_HOST/PORT. Production
requires HTTPS for storage. Credentials require create-only object writes/reads
and deletion of the `_raak_private_probe/` synthetic-probe prefix only; patient
object deletion is not an application workflow.

On startup, configured S3 storage writes a non-sensitive randomized probe,
requires anonymous GET to return 403 and removes that probe. Failure logs only
`STORAGE_PRIVACY_CHECK_FAILED` and leaves storage disabled: upload intent returns 503. Missing/error scanner produces QUARANTINED, never CLEAN. Do not bypass these
checks to make a demo appear successful.

Diagnostic command from `backend/`, **only when the cached local emulator is
already running**:

```powershell
npm exec -- tsx scripts/check-private-storage.ts
```

It currently exits nonzero because the installed emulator permits anonymous GET.
The strict script also checks signed write/read, immutable overwrite denial and
bounded reads when the privacy gate passes. It cleans its own synthetic objects.
No live private-bucket validation is claimed. The separate local real ClamAV
check passed below; supply genuinely private storage before closing the combined
document infrastructure acceptance gate.

### Owner-run scanner setup — completed and verified 2026-11-02

The owner executed the delegated setup below. Do not rerun the pull/run commands
for the existing container. Inspection observed `running healthy`, the exact
image digest below, `127.0.0.1:3310` and signature volume
`raak-clamav-signatures:/var/lib/clamav`. Logs confirmed successful initialization
of daily 28172, main 63 and bytecode 339 and clamd startup.

From `backend/`, `npm exec -- tsx scripts/check-malware-scanner.ts` exited 0:

```text
PASS real ClamAV engine: synthetic control CLEAN and in-memory EICAR REJECTED
```

The earlier initialization-time QUARANTINED result was not a successful scan.
Both real-engine stages now passed. This verifies the local scanner adapter and
engine only; it does not close private S3, live email or production operational
readiness gates. The setup commands are retained as the owner-run record.

The official `stable_base` manifest inspected on 2026-11-02 reports an amd64
compressed image size of **43,249,798 bytes (~43 MB)**. First startup additionally
downloads the ClamAV signature databases; this is typically hundreds of MB and
cannot be bounded below 50 MB. The complete setup is therefore **owner-run**.
No image or signature database was downloaded by the agent. A named volume keeps
signatures across restarts; the engine vendor recommends 4 GiB RAM.

Working directory: `E:\projects\MERN stack\raak\backend`. These commands download
and start the pinned official scanner; the first startup also downloads signatures:

```powershell
docker pull clamav/clamav@sha256:58168cd4f48a118c7d20b76da8ffce97e579b84ed7e6d1e977c6e22b1e989c5a
docker run -d --pull never --name raak-clamav-sprint4 --memory=4g -p 127.0.0.1:3310:3310 --mount type=volume,source=raak-clamav-signatures,target=/var/lib/clamav clamav/clamav@sha256:58168cd4f48a118c7d20b76da8ffce97e579b84ed7e6d1e977c6e22b1e989c5a
docker inspect --format "{{.State.Health.Status}}" raak-clamav-sprint4
```

For a future scanner check, inspect the existing container health first; wait for
signature initialization and `healthy` before running the checker from `backend/`:

```powershell
npm exec -- tsx scripts/check-malware-scanner.ts
```

The check submits a synthetic clean control and the harmless standardized EICAR
test marker to the real engine, in memory only. Both CLEAN and REJECTED outcomes
must be observed; an unavailable engine fails the check instead of faking success.

Sources: official [ClamAV Docker instructions](https://docs.clamav.net/manual/Installing/Docker.html)
and the [inspected image manifest](https://hub.docker.com/v2/repositories/clamav/clamav/tags/stable_base).

### Why private bucket metadata did not close the S3 gate

Follow-up inspection found a private bucket ACL and all four public-access-block
flags already enabled, but no bucket policy. The emulator still served anonymous
GET. LocalStack documents that authentication enforcement is disabled by default
and requires its IAM-enforcement capability. Merely labelling the bucket private
does not establish a security boundary, so the failed gate remains open. No
existing bucket policy or user object was overwritten during this investigation.

Reference: [LocalStack IAM enforcement](https://docs.localstack.cloud/aws/capabilities/security-testing/iam-policy-enforcement/).

## Acceptance approval

On 2026-11-02 the owner approved ADR-0011's correction of Sprint 4's accidental
I12 exit reference to F05/F06, E04 AR/EN, U12, I16 and patient/document I01,
with caregiver foundations and denial/race evidence. I12 still means pending
visit-change requests preserve the original visit and remains Sprint 6 work.
Private S3 and live email gates remain owner-deferred/open.
