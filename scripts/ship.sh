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

# On main? Create a fresh branch. Otherwise stay on the current feature branch.
if [[ "$current" == "main" ]]; then
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

# Open the PR if one doesn't already exist for this branch.
if ! gh pr view >/dev/null 2>&1; then
  gh pr create --fill --base main
fi

# Auto-merge (squash) once required checks pass. Runs asynchronously on GitHub.
gh pr merge --auto --squash

echo ""
echo "✅ PR opened and set to auto-merge (squash) once CI is green."
echo "   Track it with:  gh pr view --web"
echo "   After it merges: git checkout main && git pull"
