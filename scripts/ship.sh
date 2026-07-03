#!/usr/bin/env bash
#
# ship — commit your current work, open a PR, and auto-merge it once CI is green.
#
# Solo-dev flow: make changes, then run one command. The script branches (if
# you're on main), commits, pushes, opens a PR with title/body filled from your
# commits, and turns on auto-merge (squash) so GitHub merges it the moment the
# lint/typecheck/test checks pass.
#
# Usage:
#   ./scripts/ship.sh "commit message"                # auto-names the branch
#   ./scripts/ship.sh "commit message" my-branch-name # explicit branch name
#   npm run ship -- "commit message"                  # via npm
#
# Requirements: the GitHub CLI (`gh`) installed and authenticated (`gh auth login`),
# and "Allow auto-merge" enabled on the repo (see CI-SETUP.md).

set -euo pipefail

msg="${1:-}"
if [[ -z "$msg" ]]; then
  echo "Usage: ./scripts/ship.sh \"commit message\" [branch-name]" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) is not installed. See CI-SETUP.md." >&2
  exit 1
fi

current="$(git rev-parse --abbrev-ref HEAD)"

# Guard: never reuse a feature branch whose PR is already merged or closed.
# Pushing more commits to such a branch will NOT open a new PR — you'd silently
# get nothing. Force a clean start off main instead.
if [[ "$current" != "main" ]]; then
  state="$(gh pr view "$current" --json state -q .state 2>/dev/null || echo NONE)"
  if [[ "$state" == "MERGED" || "$state" == "CLOSED" ]]; then
    echo "error: branch '$current' already has a $state pull request." >&2
    echo "Reusing it won't open a new PR. Move your work to a fresh branch:" >&2
    echo "  git checkout main && git pull" >&2
    echo "  git checkout -b <new-branch>" >&2
    echo "  git checkout $current -- .        # bring your changes across" >&2
    echo "  npm run ship -- \"$msg\"" >&2
    exit 1
  fi
fi

# Choose the branch: reuse the current feature branch, or cut a fresh one off an
# up-to-date main.
if [[ "$current" == "main" ]]; then
  git pull --ff-only 2>/dev/null || echo "note: couldn't fast-forward main; continuing."
  branch="${2:-}"
  if [[ -z "$branch" ]]; then
    # Slugify the commit message into a branch name, capped at 40 chars.
    slug="$(echo "$msg" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-40)"
    branch="feat/${slug}-$(date +%m%d)"
  fi
  git checkout -b "$branch"
else
  branch="$current"
fi

# Stage everything and commit (skip the commit if there's nothing staged).
git add -A
if git diff --cached --quiet; then
  echo "No changes to commit — pushing existing commits."
else
  git commit -m "$msg"
fi

git push -u origin "$branch"

# Open a PR only if there isn't already an OPEN one for this branch.
state="$(gh pr view "$branch" --json state -q .state 2>/dev/null || echo NONE)"
if [[ "$state" == "OPEN" ]]; then
  echo "Existing open PR updated with your new commits."
else
  gh pr create --fill --base main
fi

# Auto-merge (squash) once required checks pass. Runs asynchronously on GitHub.
gh pr merge --auto --squash

echo ""
echo "✅ PR is set to auto-merge (squash) once CI passes."
echo "   Track it:        gh pr view --web"
echo "   After it merges: git checkout main && git pull"
