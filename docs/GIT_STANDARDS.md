# Git Standards

This document defines the Git workflow for the Raak monorepo and is mandatory
for maintainers and coding agents. The goal is a reviewable, reversible history
without slowing down a small team.

## Repository model

- The workspace root is the only Git repository.
- `backend/`, `frontend/`, shared documentation, and root configuration are
  versioned together.
- The canonical remote is `https://github.com/AshrafMurad/raak.git`.
- `main` is the default branch and must remain releasable.
- Cross-stack changes may be committed atomically when the frontend and backend
  must change together to preserve a contract.

## Workflow

Use GitHub Flow: create a short-lived branch from current `main`, make atomic
commits, open a pull request, pass required checks, and squash-merge. Do not use
a permanent `develop` branch.

Direct pushes to `main` are not part of the normal workflow. The only bootstrap
exception is the initial curated commit stack needed to establish an empty
remote repository; protect `main` immediately afterward.

### Start work

```bash
git switch main
git pull --ff-only
git switch -c feat/tenant-registration
```

Use lowercase kebab-case after one of these prefixes:

| Prefix      | Use                                              |
| ----------- | ------------------------------------------------ |
| `feat/`     | User-visible capability                          |
| `fix/`      | Defect correction                                |
| `hotfix/`   | Urgent production correction                     |
| `security/` | Security hardening or vulnerability fix          |
| `refactor/` | Internal change with no intended behavior change |
| `test/`     | Test-only change                                 |
| `docs/`     | Documentation-only change                        |
| `ci/`       | CI/CD change                                     |
| `chore/`    | Maintenance, tooling, or dependency work         |

Keep one concern per branch. If discovered work is independently reviewable,
move it to another branch instead of expanding the current pull request.

## Commit standard

Use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

Examples:

```text
feat(auth): add tenant-scoped sessions
fix(quotes): reject expired quote acceptance
test(auth): cover cross-tenant access denial
docs(git): document the pull request workflow
chore(deps): update Prisma
```

Allowed types are `feat`, `fix`, `hotfix`, `security`, `refactor`, `test`,
`docs`, `ci`, `build`, `perf`, `style`, `chore`, and `revert`.

- Write the summary in the imperative mood, without a trailing period.
- Keep the subject concise; explain motivation and consequences in the body.
- Add `BREAKING CHANGE:` in the footer only for an intentional incompatible
  contract change approved through the project's decision process.
- Reference an issue in the footer when one exists, for example `Refs: #42` or
  `Closes: #42`.
- Never include secrets, credentials, tokens, real patient information, or
  other sensitive data in commits, messages, fixtures, or Git history.

## Atomic commit rules

Each commit must represent one logical, independently reviewable change and
should leave the repository in a working state.

Separate commits when changes are independently revertible, including:

- unrelated fixes or features;
- behavior changes and optional cleanup refactors;
- dependency upgrades and unrelated application changes;
- standalone documentation, CI, or tooling changes;
- separate concerns discovered while implementing the requested work.

Keep changes together when separating them would create a broken or misleading
intermediate commit, including:

- a bug fix and its regression test;
- a schema change and its required migration;
- an API contract and the implementation that makes it true;
- a rename and all references needed for the rename to compile;
- coordinated frontend/backend changes required to preserve one contract.

Do not split commits mechanically by file type or directory. Do not create tiny
commits with no independent review or rollback value. Before committing, inspect
the staged diff with `git diff --cached` and stage explicit paths rather than the
entire worktree when unrelated changes are present.

## Agent commit-curation protocol

An explicit request to **push** authorizes the agent to create an appropriate
branch, curate the requested changes into commits, verify them, and push the
branch. It does not authorize merging, force-pushing, releasing, or including
unrelated worktree changes.

When asked to commit, push, open a pull request, merge, or release, an agent must
read this document and follow this sequence:

1. Inspect `git status`, the complete unstaged and staged diffs, recent history,
   the current branch, and configured remotes.
2. Identify changes outside the requested scope and preserve them unstaged.
3. Scan intended changes for secrets, generated artifacts, sensitive data, and
   accidental large files. Stop and report any exposure before creating history.
4. If currently on `main`, create a correctly named branch before committing,
   unless performing the documented empty-repository bootstrap.
5. Group changes by behavior and rollback boundary. Produce multiple commits
   when there are multiple logical changes; keep coupled changes atomic.
6. Present the planned branch and ordered commit stack in the progress report.
   An explicit `push` request authorizes execution without a second approval.
7. Stage only explicit intended paths, inspect each staged diff, and write a
   Conventional Commit message that accurately describes it.
8. Run the checks appropriate to each commit group. Before pushing, run the full
   verification required by the affected projects.
9. Review the complete branch diff against `main`, then push the branch with
   upstream tracking. Never push the feature branch to the `main` ref.
10. Report the branch, commit hashes and subjects, exact verification results,
    remote destination, and pull-request URL or creation command.

The agent must stop and ask before proceeding when commit ownership is unclear,
changes conflict with concurrent user work, required verification fails, the
remote has diverged, or the operation would rewrite published history.

## Verification before push

Run checks only for affected projects during development, then run every
required affected-project check before push.

Backend:

```bash
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend run test
npm --prefix backend run build
```

Frontend:

```bash
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```

Documentation-only work does not require application builds unless it changes a
runtime contract or executable example. Always inspect whitespace errors with:

```bash
git diff --check
```

## Pull requests

- Use a clear title following the Conventional Commit subject format.
- Explain the problem, solution, security/privacy impact, verification, and
  intentionally deferred work.
- Keep the pull request focused and small enough to review reliably.
- Require passing CI and resolved review comments before merge.
- Require review for security boundaries, authorization, tenant isolation,
  migrations, state transitions, and production configuration.
- Prefer squash merge so `main` contains one coherent commit per pull request.
- Delete the remote feature branch after merge.

Recommended `main` protection:

- require a pull request;
- require at least one approval when another maintainer is available;
- dismiss stale approvals after new changes;
- require backend and frontend checks applicable to changed paths;
- require conversations to be resolved;
- require linear history;
- block force pushes and branch deletion.

## Syncing and conflicts

Keep a local-only branch current with rebase:

```bash
git fetch --prune origin
git rebase origin/main
```

Rebase only commits that have not been shared, or coordinate explicitly before
rewriting a shared branch. Use `git push --force-with-lease` only when the branch
owner explicitly approves rewriting that branch. Never use a plain force push.

Resolve conflicts by understanding both changes, rerun affected verification,
and inspect the resulting diff. Do not accept one side wholesale merely to make
the conflict disappear.

## Releases and hotfixes

Use Semantic Versioning tags (`vMAJOR.MINOR.PATCH`) on verified commits from
`main`. Tags are annotated and are pushed only as part of an explicit release:

```bash
git tag -a v0.1.0 -m "release: v0.1.0"
git push origin v0.1.0
```

Create urgent production fixes from current production `main` using a
`hotfix/<description>` branch. Add a regression test, run the full affected
verification, merge through an expedited pull request, and publish a patch
release. Urgency does not bypass tenant-isolation, authorization, migration, or
privacy checks.

## Prohibited history practices

- Do not commit directly to `main` outside the one-time empty-repository
  bootstrap exception.
- Do not use `git add .` when unrelated changes are present.
- Do not combine all dirty worktree changes into one catch-all commit.
- Do not amend, reset, rebase, or force-push history owned by someone else.
- Do not bypass hooks or required CI checks.
- Do not commit generated build output, local environment files, databases,
  logs, editor state, credentials, or production data.
- Do not create merge commits on `main`; use squash merge through a pull request.

## Useful inspection commands

```bash
git status --short --branch
git diff
git diff --cached
git log --oneline --decorate -10
git fetch --prune origin
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```
