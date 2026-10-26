# 01 — Product Definition and Decision Register

## One-sentence promise
**Raak helps home-care agencies coordinate service requests, patients, qualified caregivers, recurring care plans, and home visits in one clear, tenant-isolated workspace.**

## Personas / jobs to be done
| Persona | Primary outcome | Surface |
|---|---|---|
| Platform operator | Onboard, activate, suspend agencies, view aggregate operational counts without opening patient content | Super Admin |
| Agency owner | Control agency settings, branding, users, service catalogue and high-level performance | Agency admin |
| Agency admin | Invite/manage staff, permissions, configuration, governance | Agency admin |
| Care coordinator | Review incoming requests, produce quotes, create patient records, schedule visits, resolve conflicts | Agency workspace |
| Qualified clinical reviewer | Review clinical instructions when required by the service and local operating procedures | Permissioned agency workflow |
| Caregiver | Access only assigned visit details, start/end visit, check tasks, document exceptions | Responsive caregiver web portal |
| Customer / family representative | Submit without registration, verify email, review quote, request revisions and schedule changes, optionally manage authorized patients | Branded customer portal |
| Patient | Beneficiary of care; may or may not have their own customer account | Patient record (agency); customer portal by grant |

## Confirmed decisions from product discovery — LOCKED
| ID | Decision |
|---|---|
| D01 | B2B multi-tenant SaaS; every agency isolated |
| D02 | Independent white-label-lite branded portal per agency, **not** a marketplace |
| D03 | Tenant-scoped customer accounts; no shared login across tenants |
| D04 | Guest service requests without creating an account; account can be created later and linked to verified prior requests |
| D05 | Customer may manage several patients **only with valid grants / authorization** |
| D06 | Hybrid service catalog: platform templates + agency editable offerings + custom offerings |
| D07 | Flexible service pricing: fixed, starting-from, custom quote; V1 includes quotes and revisions, not payment processing |
| D08 | Customer can securely accept/reject a quote; can request revisions; agency issues a new immutable version |
| D09 | Patient operational profile, limited necessary attachments, duplicate suggestion and manual resolution; create manually or from accepted request |
| D10 | Care plans separate from visits; recurring schedules generate full visit set upfront on activation (cap 60 days in V1) |
| D11 | Care plan has primary caregiver preference and substitute caregiver options |
| D12 | Hybrid rule-based matching; coordinator decides final assignment; direct assignment without caregiver acceptance |
| D13 | Weekly fixed availability with dated exceptions, leave, and no rotating shift system in V1 |
| D14 | Agency-configurable fixed travel buffer between distinct visits; no routing/GPS estimate |
| D15 | Caregiver starts and ends visits manually; server time recorded; completed directly; review can be flagged later |
| D16 | Customer's cancellation/rescheduling requests require coordinator approval; agency-configurable cutoff; late requests can be specially reviewed |
| D17 | In-app + email notifications; agency-configurable optional notifications; essential events protected |
| D18 | Agency creates and invites caregivers; caregivers scoped to an agency account in V1 |
| D19 | Basic tenant dashboard and operational reports; simple Super Admin dashboard |
| D20 | SaaS subscriptions/billing/invoices/payments deferred; agency activation and suspension manual |
| D21 | Brand name **رعاك | Raak**; Arabic-first UI |
| D22 | Brand colors: Primary `#243B70`, Accent `#7485CF`, Background `#F8F9FD`, Text `#202A40` (Blue + Lavender) |
| D23 | Fonts: IBM Plex Sans Arabic and IBM Plex Sans; light-first interface |

## Implementation defaults — PROPOSED, changeable by ADR (not user-confirmed)
| ID | Default and rationale |
|---|---|
| A01 | Next.js + TypeScript web app, Express + TypeScript API, PostgreSQL/Prisma, Redis/BullMQ, private S3-compatible object storage; familiar, maintainable stack |
| A02 | Customer and staff authentication: verified email + password, secure server-side session; guest tracking: short-lived email magic-link / OTP verification. No SMS in V1 |
| A03 | Each agency has one IANA timezone and one base currency, configurable by authorized agency admin |
| A04 | Agency self-signup allowed; new agency status PENDING_APPROVAL until manually activated by Super Admin |
| A05 | All sensitive data stored server-side; no patient data in emails, public URLs, analytics payloads, or logs |
| A06 | Mandatory clinical approval of clinical instructions enforced by capability `care_plan.clinical_approve`, granted only after agency-verified qualification; platform does not assess clinical adequacy |
| A07 | No pricing discounts, tax computation, electronic signature framework, or automated payment collection in V1 |
| A08 | No custom agency domains in MVP; subdomain-only portal, configurable branding |
| A09 | Recurrence rule accepts selected weekdays, local clock start time, visit duration, and bounded date range up to 60 days |
| A10 | At first release, single working interval per weekday in UI; underlying model supports multiple intervals/day |
| A11 | English technical status codes are canonical; Arabic labels for UI; email copy localized by recipient language |

## Product success signals (no fabricated benchmarks)
- % of requests that reach an agency decision; quote response time; scheduled visits; completed visits; % starts on time; reassignment count; failed notification jobs.
- Each measure must specify numerator, denominator, excluded states, timezone and filter period before implementation.

## Design principles
1. Care coordination, not diagnosis.
2. Patient confidentiality and agency isolation override convenience.
3. Prefer predictable state machines and clear ownership over magical automation.
4. Display proposed vs confirmed times visibly.
5. Human decision authority for clinical review, scheduling, and commercial commitments.
6. Keep customer portal empathetic and simple; agency dashboard efficient and data dense.
7. Never permit a platform administrator to browse patient content by default.

## Still to validate before any production launch with real users
- Countries of operation, regulator-specific privacy duties, licensing checks, consent/legal representative rules, record retention & deletion schedules, email provider and data residency, accessibility/localization acceptance, backup/recovery goals, incident escalation.
- These are operational launch gates, not questions that block creating a technical MVP with synthetic records.
