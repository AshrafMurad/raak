# SDD ledger — plan: docs/plans/sprint-01-control-plane-auth.md
BASE: 58f3ddc
Pre-flight: Tasks chain on shared interfaces: T2 crypto (hashToken/PasswordHash) -> T1 seed & T3/T6/T7 services; T3 session service (resolveSession/revokeAllSessionsForTenant) -> T5 guards, T8 suspend; T4 DTOs -> T6/T7/T8 controllers; T5 HostRealm/AuthenticatedRequest -> T6/T7/T8/T9 api client. Consistent per plan; no conflicts found.

Task 2: complete (commits 58f3ddc..218cbdc, tests: npm test -- auth/crypto -> 9 passed)
Task 2: Ruling: executed Task 2 before Task 1 because the Sprint 1 seed needs hashPassword; crypto.ts has no schema dependency. Cost if wrong: none (independent).

Task 1: complete (commits 218cbdc..55e9cf2, tests: npm test -> 53 passed incl. DB integration; migrate:dev applied 20261027181752_sprint1_identity; seed x2 idempotent {tenants:2,operators:1,staff:3,customers:1,invitations:2})
Task 1: Ruling: included minimal caregivers model in this migration (Task 7 needs it; avoids a second migration mid-sprint). Cost if wrong: an unused table until Sprint 4.
Task 1: Ruling: seed reuses Sprint 0 tenants afiya(ACTIVE)/alnadwa(PENDING) instead of new agency-a/b; shared.person@example.invalid exists in both tenants for I05. Cost if wrong: none (fixtures only).

Task 3: complete (commits 55e9cf2..d93f158, tests: npm test -> 63 passed; typecheck/lint clean)
Task 3: Ruling: createSession takes injectable now inside the input object; test-side narrowing via toMatchObject for the discriminated session union. Cost if wrong: none.

Task 3: verified after typecheck fix commit dd26929 (npm test 63 passed; typecheck/lint clean)

Task 4: complete (commits dd26929..3c70407, tests: npm test -> 80 passed; typecheck/lint clean)

Task 5: complete (commits 3c70407..8db7b2f, tests: npm test -> 93 passed; typecheck/lint clean)
Task 5: Ruling: parsed cookies manually instead of adding cookie-parser dep (base64url values are split-safe; avoids new dependency). Cost if wrong: exotic cookie values would need a real parser later.

Task 6: complete (commits 8db7b2f..3a31ad0, tests: npm test -> 109 passed; typecheck/lint/build clean)
Task 6: Ruling: public routes (register/verify/forgot/reset/invite-accept) sit behind the global host-realm gate and work on any ACCEPTED realm; tenant-scoped behavior derives from the resolved realm. Bare BASE_DOMAIN host is rejected. Cost if wrong: registration UI must live on platform host or an agency host.
Task 6: Ruling: token errors mapped TOKEN_EXPIRED->401, TOKEN_ALREADY_USED->409, unknown token->401 UNAUTHENTICATED; to be recorded in doc 07 at Task 10. Cost if wrong: contract doc mismatch until then.
Task 6: Ruling: CORS allowlist (API_CORS_ORIGINS env) added for browser SPA credentials; no wildcard+credentials combination. Cost if wrong: none security-wise; deployment must configure origins.

Task 7: complete (commits 3a31ad0..5f7d9d0, tests: npm test -> 116 passed; typecheck/lint/build clean)

Task 7: verified after type fix (npm test 116 passed; typecheck/lint/build clean)

Task 8: complete (commits 2471117..fc840b5, tests: npm test -> 124 passed; typecheck/lint/build clean; I15 covered)

Task 9: complete (commits fc840b5..279d287, frontend tests: 26 passed; typecheck/lint/build clean; routes AR/EN generated)
Task 9: Ruling: added reset-password page because Task 6 emits password-reset email links; omitting it would ship a dead recovery link. Cost if wrong: one small in-scope auth screen beyond the plan file list.

