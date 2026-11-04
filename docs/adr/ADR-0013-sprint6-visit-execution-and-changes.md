# ADR-0013 — Sprint 6 visit execution and change-request details

Date: 2026-11-04. Status: implementation interpretations recorded for owner
review; no deviation from locked D01–D23 is proposed.

## Context

BR-VST/BR-CHG, F08/F09, E06/E07 and the API outline require execution,
immutable documentation, explicit patient grants, and approved single-occurrence
changes. Some transport and policy details were not specified.

## Interpretations

1. The existing canonical/persisted `NOT_DONE` outcome with a mandatory trimmed
   reason represents `NOT_DONE_WITH_REASON`; it is not a second unexplained
   outcome. Required PENDING tasks prevent completion. Optional tasks may remain
   PENDING. A required NOT_DONE outcome automatically flags NEEDS_REVIEW.
2. Drafts are saved with `PUT /caregiver/my/visits/:id/note` during IN_PROGRESS.
   Completion atomically records server time, task/note completion JSON, freezes
   tasks and finalizes notes. Database UPDATE guards protect completed execution
   and finalized notes. Coordinator review has its own row/status; corrections
   are new finalized addenda. Original execution, timestamps and snapshots are
   never overwritten by review/correction.
3. Additive caregiver detail, customer visit list/detail and agency note-read
   routes support the specified screens. Customer summaries require VIEW_VISITS;
   submit/withdraw require MANAGE_VISITS, and approval rechecks the requester's
   current verified active account and grant. Request ownership grants none of
   these rights. No customer notes or task-exception projection is introduced.
4. A request submitted **at** the cutoff instant is NORMAL; later is LATE.
   Defaults are 24 hours separately for cancel/reschedule, late review enabled.
   Administrators may configure integer hours 0–168 (recommended 6–48) and buffer
   0–120 minutes. Disabling late review refuses new late submissions; an existing
   LATE request cannot be approved while the current policy disables it. Rejection
   remains available. Classification/policy/original window are snapshotted.
5. Customer reschedule input uses agency-local date and clock. DST gaps and folds
   are rejected, never shifted silently. The original duration and current assigned
   caregiver are retained. Approval rejects timezone changes since submission and
   rechecks the original window, future SCHEDULED state, patient overlap and the
   existing caregiver hard filters under tenant → parent plan → visit → caregiver
   locks. Confirmed occurrences retained under a paused plan remain maintainable,
   consistent with ADR-0012's reassignment semantics. Recurrence and plan versions
   are untouched.
6. Completion and **both** agency decisions require Idempotency-Key. Keys bind
   tenant, current principal, action, target and semantic payload; only safe result
   summaries persist. Failed approval rolls back without consuming a key or
   changing the PENDING request/appointment. Repeated start/completion is stable
   without duplicate state events. Review/correction uses expectedVersion.
7. GET/PATCH agency settings in this slice covers scheduling policy only, with
   settingsVersion initially 0. Buffer changes run the existing prospective health
   scan transactionally; no appointment is automatically cancelled/reassigned.

## Consequences

Two additive migrations introduce notes/change requests, policy settings, immutable
completion snapshots, separate reviews and integrity guards. API/data-model docs,
feature translations and denial/race/browser tests change together. Durable events
remain for Sprint 7 delivery; neither live email nor private S3 gates are closed.

No new clinical interpretation, start-time override, timestamp correction,
plan-wide customer change, reporting or launch workflow is authorized by this ADR.
