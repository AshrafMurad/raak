# ADR-0017 — Reports filters, timeliness and safe audit views

Date: 2026-11-04. Status: implementation interpretation of existing reporting
and audit scope (D19, docs 02/05/06/07/12); no locked decision deviation.

## Context

Session 4 requires reconciled tenant-scoped reports and safe audit screens.
The route table names report domains but does not define measurement windows,
late-start comparison, breakdown caps or pagination order. These need explicit
contracts so displayed counts have reproducible meaning (docs 01 success signals).

## Decision

- Agency-local inclusive dates select requests by submission instant and visits
  by scheduled start. All status/service filters affect all aggregates within
  their report. Status counts describe current state, not historical transitions.
- Start timeliness uses actualStartAt against scheduledStartUtc, no grace period:
  at/before is on time, after is late. Denominator is visits with a recorded start;
  no-start rows are counted separately. No clinical or presence judgment.
- Caregiver load uses current assignment and scheduled duration, excluding cancelled
  minutes while retaining cancelled counts. Whole-minute totals round once per
  caregiver; load rows cap 200, request service rows cap 100, explicitly flagged.
- Reports are Owner/Admin/Coordinator; agency audit is restricted Owner/Admin.
  Both HTTP and live transaction gates use central authorize and server tenancy.
  Strict tenant/service filter denial is covered by I02 tests.
- Agency audit selects only tenant-local rows and projects actor/entity/time/reason
  without metadata JSON or note bodies. Chronological at/id keyset pagination
  handles timestamp ties; opaque cursors never establish resource authority.
- Platform tenant detail exposes only all-time status counts; no patient rows
  or agency report authority. Existing operator audit remains separately scoped.

## Consequences

No schema/migration, retention change or history rewrite. New additive API
contracts and bilingual routes are recorded in docs 07. Integration tests cover
reconciliation, time windows, caps, role/tenant/filter denials and safe audit
pagination. E08 uses real browser/API/PostgreSQL synthetic fixtures in AR/EN.
Concurrency remains under existing tenant writer-lock protocol; reports add no
business writes. Performance budgets and wider accessibility/launch gates remain
the later Session 5/6 work orders.
