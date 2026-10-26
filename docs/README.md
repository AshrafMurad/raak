# RAAK — Home Care Coordination SaaS

**Project specification pack — v1.0**<br>
**Product name:** رعاك / Raak<br>
**Status:** Planning baseline (implementation-ready proposals; not evidence of clinical or regulatory approval)<br>
**Audience:** Product owner, engineers, designer, QA, AI coding agents<br>
**Language:** English specifications; Arabic-first product UI<br>
**Reference date:** 2026-10-19

## What Raak is
Raak is a B2B multi-tenant SaaS for home-care agencies. Each agency operates its own workspace and branded customer portal. Customers/families can request services without an account, review offers after identity verification, optionally create an agency-specific account, and coordinate care for authorized dependents. Agency staff manage requests, quotes, patients, caregivers, care plans, scheduling, visits, communication, and operational reporting.

Raak is an **operations and coordination platform**, **not** an electronic medical record, medical decision system, clinical advice engine, employer marketplace, or emergency response service. Agency-licensed professionals remain responsible for clinical instructions and approvals.

## The authoritative document order
When specs conflict, use this precedence: (1) confirmed decisions in `01_PRODUCT_AND_DECISIONS.md`; (2) security and invariants in `04_BUSINESS_RULES.md`, `05_AUTH_AND_PERMISSIONS.md`, `09_SECURITY_AND_PRIVACY.md`; (3) schema and API contracts; (4) UX and implementation plan. Raise and record conflicts in an Architecture Decision Record before coding; never silently discard a locked decision.

| File | Purpose |
|---|---|
| `01_PRODUCT_AND_DECISIONS.md` | Vision, audiences, locked decisions and assumptions |
| `02_SCOPE_AND_ACCEPTANCE.md` | In/out scope, user stories, release gates |
| `03_USER_FLOWS.md` | End-to-end journeys and exceptional flows |
| `04_BUSINESS_RULES.md` | State machines, invariants, scheduling, commercial flows |
| `05_AUTH_AND_PERMISSIONS.md` | Roles, scoped access, onboarding, delegation |
| `06_DATA_MODEL.md` | Entities, relationships, constraints, indexes, lifecycle |
| `07_API_CONTRACT.md` | Routes, request/response conventions, validation and errors |
| `08_ARCHITECTURE.md` | System boundaries, jobs, tenant resolution, deployment |
| `09_SECURITY_AND_PRIVACY.md` | Threat controls, minimal data, access and operational policies |
| `10_UI_UX_DESIGN_SYSTEM.md` | Brand tokens, Arabic/English typography, screens, UX states |
| `11_NOTIFICATIONS.md` | Events, channel policy, templates and reliability |
| `12_TEST_PLAN.md` | Contract tests, concurrency, tenant isolation, E2E acceptance |
| `13_IMPLEMENTATION_PLAN.md` | Work phases, dependencies, scope control and DoD |
| `14_AGENT_SKILLS.md` | Installed agent skills, required task routing, precedence and verification |
| `GIT_STANDARDS.md` | Branches, atomic commits, pull requests, releases and agent push protocol |
| `AGENTS.md` | Execution instructions for coding agents |

## Terminology
- **Platform**: Raak provider/operator; **Tenant / Agency**: an independent home-care company; **Workspace**: agency's operational UI.
- **Customer**: login holder / service requester; **Patient**: beneficiary; **PatientAccess**: explicit customer-to-patient permission grant.
- **Caregiver**: service provider attached to one agency account in V1; **Coordinator**: agency employee who organizes visits; **Clinical reviewer**: appropriately qualified and authorized professional for clinical content (not a blanket admin privilege).
- **Service**: agency-published offering; **Request**: proposed engagement; **Quote**: versioned offer; **Care plan**: program of recurring care; **Visit**: one appointment/execution record.
- **Confirmed**: agency commits to a visit only when a qualified, available caregiver is assigned. A customer's preferred date is not a confirmed booking.

## Boundary decisions
1. Company subscriptions, card collection, invoicing, taxation, and automatic billing are **not part of V1**. Platform Super Admin activates/suspends tenant access manually.
2. Service pricing and customer acceptance of commercial quotes **are part of V1**; they do not create an online payment requirement.
3. Default agency branding uses a generated subdomain, e.g. `afiya.<RAAK_BASE_DOMAIN>`. Actual domain selection and ownership are **TBD**; no DNS name is assumed reserved.
4. No native mobile application in V1: a responsive caregiver web portal is required.
5. Use fictional/synthetic patients in development, demos, seed data, and tests. Handling live healthcare data requires additional organizational, legal, regulatory and security readiness review.
6. **Target** 12–16 focused working days is aspirational. Given the accepted features (quotes, recurring scheduling, agency portals, granular authorization) delivery may require more time; do not cut security or core invariants to reach a date.

## Definition of a specification change
Every decision adjustment requires: date, reason, affected files, schema/API impact, migration implications, QA impact, and approval from the product owner. See `13_IMPLEMENTATION_PLAN.md`.

## Repository structure (owner-approved, ADR-0007)
The workspace is one Git repository containing self-contained frontend and
backend npm projects plus the shared specification pack.
```text
raak/
  frontend/            # Next.js portals, fonts, design tokens, translations
  backend/             # Node.js + Express typed REST API and BullMQ worker entry
    src/contracts/     # Canonical Zod DTOs, domain enums, events
    src/modules/       # Domain modules
    src/worker/        # Separate background process
    prisma/            # Schema, migrations, synthetic seed
  docs/                # This specification pack
  AGENTS.md
```

## Reference security materials
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html

These are engineering references, not evidence of compliance with a particular jurisdiction's healthcare privacy requirements.
