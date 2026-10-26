# 09 — Security, Privacy and Sensitive Information Guardrails

## Scope and classification
Even a limited operational patient file can contain sensitive personal/health-related information. Treat patient profile, patient address, visit notes, care instructions, attachments, family relationships, appointment times, and qualification/license documents as protected information. The platform is not licensed to diagnose or provide clinical advice simply by providing software.

## Data protection requirements
| Area | Required engineering control |
|---|---|
| Transport | TLS on all public/private traffic; HSTS after certificate and subdomain assessment; secure cookies |
| Session | HttpOnly, Secure, audience/tenant bound; short lived, rotation and revocation; CSRF protection |
| Access | Deny by default; permission on every API and object; active tenant checks; patient grants |
| Storage | Encrypted database volumes/backups, private object storage; field-level encryption for particularly sensitive free text when operationally practical |
| Email | Minimal subject/body; generic statement, no diagnosis, patient identifiers/addresses or care notes; authenticated link to details |
| Logs | Redact tokens, headers, emails, addresses, notes, search query terms and documents; safe audit metadata only |
| Files | Restricted allowlist PDF/JPEG/PNG initially; validate magic bytes and size; randomized keys; malware scan/quarantine; private bucket, signed URL; parent resource auth |
| Guest flows | Rate limit, bot abuse controls, email token verification, no tracking-id-only access; generic acknowledgement prevents enumeration |
| Data access | Field projections for each role, tenant-only searches, paginated logs; no global browse of patients from platform admin |
| Recovery | Tested backups and restores, scoped secret permissions, incident response playbook, access review |

## Threat model and security acceptance
1. **Cross-tenant IDOR**: attacker changes URL ID to other agency. Expect 404/inaccessible, never patient data; all CRUD routes, reports and file access tested.
2. **Guest token misuse**: stolen/replayed/expired email link. Token hashed at rest, TTL, consumed atomically, bound to request + action + tenant, repeated use denied.
3. **Privilege escalation**: caregiver crafts role/tenantId or calls admin endpoint. Input stripped; permission guard + resource checks deny; audit attempts if safe.
4. **CSRF**: cross-site form posts to session-auth API. Require origin/CSRF validation and proper SameSite settings.
5. **Unsafe upload**: executable renamed `.pdf` or oversized payload. Content signature/size and allowlist check, scan, quarantine, deny direct serving.
6. **Token leakage**: password reset/magic-link URL forwarded/logged. Short TTL, one use, no PII in token, minimal logging and referrer policy.
7. **Email disclosure**: email delivered to wrong recipient. Re-check current customer/request association and verified address at enqueue/send, generic contents.
8. **Booking race**: parallel requests both see caregiver free. Transaction serialization and fresh overlap test prevents double assignment.
9. **Information inference**: duplicate-check or report count exposes patients across tenants. No public duplicate API, tenant scoped and filtered projections.
10. **Unsafe defaults**: suspended tenant remains active via cached JWT or worker. Every session/workflow checks tenant active state; invalidate sessions/cache; workers enforce policy.

## Consent, delegation, patient representation
- Guest form provides plain-language purpose, privacy link and explicit acceptance checkbox; store notice version + UTC timestamp, not broad medical consent.
- Customer authority to manage a beneficiary is a **distinct grant** recorded by agency. Claimed relationship alone does not grant rights.
- Consent to commercial quote is not consent to clinical treatment. Use separate processes when required by healthcare service context.
- Documents containing patient data are only accessible through explicit need-to-know; patient/customer grants restrict document access further.

## Privacy by design
- Prefer minimal beneficiary info before service is accepted; don't ask for medical history through anonymous form.
- Avoid medical terms in push/email previews and public activity feed.
- Separate admin operational notes, caregiver notes, patient-visible visit summaries and audit data; do not auto-share caregiver internal notes with family.
- Make record retention, access/deletion requests, legal basis, data residency, and third-party processing configurable **only after legal review** for actual jurisdiction. Do not implement irreversible deletion of care history without validated policy.
- Development/test: synthetic records only, never real patient data copied to staging/logs.

## Recommended implementation checks
- Central permission service with tenant+resource+scope; every test route asserts wrong-tenant actor cannot read/change/guess record.
- Re-run authorization at download/notification time, not only at upload or event creation.
- Security headers (CSP fit to Next app, frame rules, referrer policy), avoid untrusted HTML render in notes.
- Dependency checks, secret scan, audit migration and backup restoration before external launch.
- Operational admin break-glass access, if ever built, requires separate governance, justification, expiry and comprehensive audit; **out of V1**.

## Authoritative security reference links
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html (deny by default, per-request resource authorization)
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html (file allowlist, type validation, generated filenames, protected storage)
- PostgreSQL isolation: https://www.postgresql.org/docs/current/transaction-iso.html (transaction behaviour and serializable retries)

## Launch boundary
These technical practices are **not a compliance certification**. Before processing live patient data, obtain required jurisdiction-specific health/privacy legal and operational review, clinical governance, security assessment, provider agreements and data retention policy. If this is only a portfolio demo, keep all identities synthetic and prominently label demo data.
