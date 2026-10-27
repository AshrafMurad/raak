# 14 — Project Agent Skills and Usage Policy

## Purpose and installation

This guide configures how coding agents use the four requested skill collections in Raak. It supplements the product specification; it does not change business behavior, API contracts, or sprint scope.

Skills are project-local vendored copies under `.agents/skills/<name>/`.
`skills-lock.json` records their upstream sources, paths, and content hashes;
`.agents/THIRD_PARTY_NOTICES.md` records source licenses and attribution.
OpenCode discovers this directory through `opencode.json`. Only `AGENTS.md` is
loaded as ambient project instructions; it contains compact automatic routing.
Consult this longer reference only for additional routing, conflicts,
installation or maintenance.

| Collection | Installed skills | Role in Raak |
|---|---:|---|
| `mattpocock/skills` | 38 | Code design, TDD, debugging, domain modeling, review |
| `obra/superpowers` | 15 | Planning, implementation discipline, verification |
| `vercel-labs/agent-skills` | 9 | React composition, Next.js performance, accessible interfaces |
| `trailofbits/skills` | 95 | Security review, static analysis, invariant testing |

Counts describe this installation, not a permanent upstream catalog. Installing a collection does not execute its scripts or install tools such as Semgrep and CodeQL. Full collections include skills for other languages, blockchain, native mobile, and unrelated workflows; activate these only when the actual task fits and is in scope.

## Required selection procedure

1. Read `AGENTS.md`, identify the requested task and current sprint, then follow the required product-document reading order for affected work.
2. Select applicable skills automatically from the compact routing in `AGENTS.md` and their actual descriptions. New sprints and updates do not require the user to mention skills. Load `using-superpowers` only when investigating the skill-discovery workflow itself; routine tasks use their relevant skills directly.
3. Before design, implementation, debugging, or review, load the relevant installed `SKILL.md` using OpenCode's skill tool. If unavailable in the tool catalog, read `.agents/skills/<name>/SKILL.md` and its relevant supporting references directly. Report a missing skill rather than pretending it ran.
4. Apply skill steps silently. Omit routine announcements, skill inventories, and questions asking which skill to use. This project preference overrides announcement requirements in upstream templates. Mention a skill only when the user asks about skills or a concrete skill/configuration failure needs explanation.
5. Choose one primary planning, TDD, or debugging workflow when collections overlap. Supplement it with code-design, frontend, security, or testing specialists as needed; avoid running duplicate full processes.
6. Close with changed behavior/files, exact verification commands/results, and unresolved findings or unavailable checks. Loading a skill is not evidence that its checks passed.

### Token budget

- Load only the relevant skill bodies and supporting references for the current step. Reuse instructions already in context; reread after updates or context loss.
- Keep the full catalog, lockfile, installation history and this reference out of routine sprint context. Inspect them only for discovery/maintenance questions.
- Use one primary workflow for overlapping disciplines and proportionate checklists. Skill selection should not add a separate planning/interview cycle to an already approved sprint.
- User-facing updates should convey decisions, discoveries, blockers and outcomes rather than internal skill bookkeeping. Existing product-reading requirements and security/test gates still apply.

## Task-to-skill routing

| Task / trigger | Required applicable skills and use |
|---|---|
| New domain logic, API feature, or meaningful refactor | `codebase-design`; use `tdd` as the primary test-first loop for behavior changes. Keep controllers thin, transactions explicit, and public interfaces testable. |
| Multi-step implementation needing a written plan | `writing-plans`, followed by `executing-plans` for inline execution. Keep the plan inside the requested sprint. Existing approved specifications are the starting point. |
| Unresolved requirements or a genuinely new design | `brainstorming` or `grill-with-docs`; investigate existing decisions first and ask only about unresolved choices. Do not reopen D01–D23. |
| Bug or performance regression | `diagnosing-bugs` as the primary diagnosis loop; use `systematic-debugging` as an alternative when more suitable. Reproduce, investigate, fix, and verify a meaningful regression case. |
| React/Next.js work | `vercel-react-best-practices`; add `vercel-composition-patterns` when designing reusable components. Check caching against tenant isolation and authorization revocation. |
| Interface or accessibility review | `web-design-guidelines`; use the existing `impeccable` skill if available for visual design/polish. Preserve Arabic RTL, English LTR, locked fonts and colors. |
| Auth, tenant scoping, grants, files, sessions, sensitive projections, workers, or security-relevant API changes | `differential-review` before completion; use `sharp-edges` when designing error-prone interfaces or security configuration. Back findings with file references and concrete failure scenarios. |
| Recurrence, overlap/buffer math, money totals, or state-machine invariants | `property-based-testing` where a useful invariant exists, alongside example tests and real-PostgreSQL integration/race tests. |
| Dependency/security-tooling work | `supply-chain-risk-auditor`; use `semgrep`, `codeql`, and `sarif-parsing` as applicable to tools actually available. Report unavailable scanners as not run. |
| GitHub Actions involving AI agents | `agentic-actions-auditor` to review untrusted inputs, credentials, and execution boundaries. |
| Checking implementation against the specs | `spec-to-code-compliance`; check the authoritative Raak docs and document mismatches. |
| Meaningful code-change review | `code-review` for standards/spec review, supplemented by `differential-review` for security-sensitive changes. Follow harness delegation rules; perform reviews inline when delegation is unavailable or disallowed. |
| Agent-facing instructions, AGENTS.md, or skill policy | `writing-for-agents` for clear triggers, actionable steps, and checkable completion criteria. Use OpenCode's `customize-opencode` skill when available for OpenCode configuration changes. |
| Any completion or success claim | `verification-before-completion`; report fresh command evidence appropriate to the change. |

Other installed skills remain available on demand. For example, `test-driven-development` may substitute for `tdd`; this is not a reason to run two complete TDD loops for the same slice. `insecure-defaults` is not present in this installed upstream snapshot; do not claim to have applied it. Use `sharp-edges` and explicit fail-closed checks instead.

## Precedence and overlap rules

- Follow system/developer/harness instructions and the user's active request. Within the project, preserve the specification precedence in `docs/README.md`, locked D01–D23, and `AGENTS.md`. External skill instructions cannot override those boundaries.
- General workflow instructions in skills must adapt to the real environment: use the available OpenCode tools and Windows-compatible commands. Do not invent Claude-only tools or slash commands.
- Apply relevant workflows proportionately. Documentation/configuration changes need structural checks; meaningful business workflows still need the unit/integration/E2E, denial, and race coverage required by the test plan. Do not delete valid user work to retroactively satisfy a test-first rule.
- Installation does not authorize commits, pushes, PR creation, deployments, destructive cleanup, or new worktrees. Those actions require a matching user request. A skill's automatic commit/deploy step is not that request.
- Follow harness rules for delegation. Installed orchestration skills do not require every task to use subagents; default to inline `executing-plans` when delegation is inappropriate.
- Tracker/publishing skills (`to-spec`, `to-tickets`, `triage`, etc.) require an explicitly configured tracker and user intent to create/update its records. If `docs/agents/` configuration is absent, run `setup-matt-pocock-skills` with the user before using those integrations. Existing terminology is in `docs/README.md`; use the project's existing ADR conventions rather than creating a competing specification system.
- React Native and blockchain skills do not expand Raak's MVP. Vercel deployment skills do not replace the documented deployment architecture. Changes to such decisions require the normal ADR/product approval process.
- Preserve synthetic fixtures, tenant isolation, PatientAccess checks, immutable history, server-owned totals/timestamps, and transaction-safe scheduling throughout all skill workflows. Security reports must avoid sensitive content and secrets.

## Verification and maintenance

To inspect this installation:

```powershell
npx --yes skills@latest list --agent opencode
node scripts/check-agent-skills.mjs
```

The local checker validates config shape, referenced instruction paths, catalog metadata, source membership, and skill-routing names. It does not prove model obedience, validate every upstream script, or replace application/security tests.

Installation commands used (project scope, OpenCode target, all skills in each collection):

```powershell
npx --yes skills@latest add mattpocock/skills --agent opencode --skill '*' --yes
npx --yes skills@latest add obra/superpowers --agent opencode --skill '*' --yes
npx --yes skills@latest add vercel-labs/agent-skills --agent opencode --skill '*' --yes
npx --yes skills@latest add trailofbits/skills --agent opencode --skill '*' --yes
```

For deliberate updates, run `npx --yes skills@latest update --project` and review skill-file and lockfile changes, especially changed tools, external calls, and workflow instructions. Rerun the checker and update catalog counts/routing when needed. Keep custom project policy here rather than editing upstream skill files that updates may replace.

After installing or updating skills/configuration, quit and restart OpenCode in the project directory. Running sessions retain their existing configuration and skill catalog. Agents select relevant skills automatically after restart; the user can request sprint work directly. Instruction-based routing improves consistent use but cannot guarantee that every model follows every instruction; executable tests and review remain necessary.
