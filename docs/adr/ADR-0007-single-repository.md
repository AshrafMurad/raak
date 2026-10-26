# ADR-0007 — Single repository for the Raak workspace

Date: 2026-10-27
Status: Accepted (product owner instruction; supersedes ADR-0006 repository topology)

## Context

ADR-0006 placed `backend/` and `frontend/` in independent Git repositories while
shared specifications remained at the workspace root. The product owner chose a
single GitHub repository so cross-stack changes, documentation, CI, and product
decisions can be reviewed and versioned together.

## Decision

- The workspace root is the only Git repository and uses `main` as its default
  branch.
- The canonical remote is `https://github.com/AshrafMurad/raak.git`.
- `backend/` and `frontend/` remain self-contained npm projects with separate
  `package.json` and `package-lock.json` files. This is a Git monorepo, not an npm
  workspace, and no new workspace build tool is introduced.
- Backend-owned canonical contracts remain in `backend/src/contracts`.
  Frontend code does not import backend source; generated OpenAPI types may be
  introduced later through a separate decision.
- CI workflows live in the root `.github/workflows/` directory and execute each
  project's commands from its own directory.
- Git workflow, commit curation, branch naming, pull requests, and releases are
  governed by `docs/GIT_STANDARDS.md`.

## Consequences

- A single pull request can atomically update backend, frontend, specifications,
  and migrations when they form one contract change.
- Root-level branch protection and review policy apply to the whole project.
- Both project workflows run for each pull request so required checks are never
  left pending because a path-filtered workflow was skipped.
- Each application keeps independent dependency installation, scripts, and
  deployment boundaries.
