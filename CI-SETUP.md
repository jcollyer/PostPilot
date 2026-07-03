# CI/CD Setup

This project runs unit tests with [Vitest](https://vitest.dev). Tests live next
to the code they cover as `*.test.ts` and are executed by a single root config
(`vitest.config.ts`).

## Running tests locally

```bash
npm install          # first time — pulls vitest + generates the Prisma client
npm test             # run the whole suite once
npm run test:watch   # re-run on change while developing
npm run test:coverage # suite + a coverage report (also written to ./coverage)
```

Current smoke coverage: queue positions/slots/ordering/embeddings, publishing
error classification, and the shared zod schemas (`@postpilot/types`).

## What's already wired

`.github/workflows/ci.yml` runs on every pull request into `main` and on pushes
to `main`. It runs three parallel jobs — `lint`, `typecheck`, and `test` — each
installing dependencies with `npm ci`. Each job reports its own status check
(named `lint`, `typecheck`, `test`), so they show up separately on the PR and can
be required individually in branch protection.

## Next steps to finish hooking up GitHub Actions

1. **Commit and push the new files.** Do this on a branch so you can watch CI
   run on the PR itself:

   ```bash
   git checkout -b ci/add-unit-tests
   git add .github/workflows/ci.yml vitest.config.ts package.json package-lock.json \
           packages/**/src/**/*.test.ts CI-SETUP.md
   git commit -m "ci: add Vitest suite and GitHub Actions workflow"
   git push -u origin ci/add-unit-tests
   ```

   > Run `npm install` locally first so `package-lock.json` records vitest —
   > `npm ci` in the workflow fails if the lockfile is out of sync.

2. **Open the PR.** On GitHub, open a PR from `ci/add-unit-tests` into `main`
   (or `gh pr create --fill` if you install the GitHub CLI). The **CI** workflow
   starts automatically — this is the "trigger on PR creation" piece. Watch it
   under the PR's **Checks** tab.

3. **Make the check required (branch protection).** So a red build actually
   blocks merges: GitHub repo **Settings → Branches → Add branch ruleset** (or
   classic **Branch protection rules**) for `main` →
   - Require a pull request before merging
   - Require status checks to pass → add the `lint`, `typecheck`, and `test` checks (Source: **Any source**)
   - (optional) Require branches to be up to date before merging

4. **Confirm green, then merge.** Once the check passes, merge the PR. From now
   on every PR runs the same gate.

## One-command PRs (solo-dev flow)

`scripts/ship.sh` collapses "branch → commit → push → open PR → merge" into a
single command. It opens a PR (title/body filled from your commits) and enables
**auto-merge (squash)**, so GitHub merges the PR the moment `lint`, `typecheck`,
and `test` pass — no second step, but the CI gate still protects `main`.

### One-time setup

1. **Install the GitHub CLI** and sign in:

   ```bash
   brew install gh        # macOS
   gh auth login          # pick GitHub.com + your account
   ```

2. **Enable auto-merge on the repo** (required for `--auto`). Either flip the
   checkbox at **Settings → General → Pull Requests → Allow auto-merge**, or run:

   ```bash
   gh api -X PATCH "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)" \
     -F allow_auto_merge=true
   ```

   Auto-merge only works because `main` already requires the three status checks
   (set up above) — that's the condition GitHub waits on before merging.

### Everyday use

```bash
# ...make your changes on main (or a feature branch)...
npm run ship -- "add caption editor"      # or: ./scripts/ship.sh "add caption editor"
```

That branches (if you're on `main`), commits everything, pushes, opens the PR,
and arms auto-merge. When CI goes green the PR merges itself. Afterwards:

```bash
git checkout main && git pull             # sync your local main
```

Track a PR anytime with `gh pr view --web`. If CI fails, the PR just stays open —
fix, commit, and push again (re-running `npm run ship` from the same branch works).

**One branch per PR.** After a PR merges, always go back to `main` and pull before
starting new work — don't keep committing on the old branch. Pushing new commits
to a branch whose PR is already merged does **not** open a new PR; you'd get
nothing. The script guards against this (it aborts if the current branch has a
merged/closed PR), but the habit is: `git checkout main && git pull` first.

To make this automatic, enable **Settings → General → Pull Requests → Automatically
delete head branches** so merged branches disappear and can't be reused by accident.

## Where to go after this

- **Grow coverage:** the current tests are smoke tests over pure logic. Good next
  targets are the publish adapters (`packages/publishing/src/adapters/*`) and the
  queue scheduler/service — those benefit from mocking `fetch` and the Prisma
  client (Vitest's `vi.mock` / `vi.fn`).
- **Coverage gates:** add a `thresholds` block to `vitest.config.ts` (e.g. 60%
  lines) so coverage can't regress, and upload the report as a CI artifact.
- **CD (deploys):** you already have `DEPLOY.md` and `railway.json`. A follow-on
  `deploy` workflow can run on push to `main` after CI passes, gated on the test
  job — say the word and I'll wire it up.

## Note on auto-creating PRs

If by "trigger PR creation" you meant having automation *open* PRs for you (e.g.
dependency bumps or release PRs), that's a separate add-on — Dependabot for
dependency PRs, or a release-please/changesets workflow for version/release PRs.
Let me know and I'll set the one you want.
