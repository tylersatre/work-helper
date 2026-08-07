#!/usr/bin/env bash
# Print the next available 3-digit feature number (e.g. "006").
#
# Scans ALL places a feature number can be claimed, not just this checkout's
# specs/ directory — parallel worktrees each have their own specs/ view, so
# scanning only specs/ lets two in-flight features claim the same number:
#   - specs/NNN-* directories in this checkout
#   - local branches named NNN-*
#   - origin branches named NNN-* (after a best-effort fetch)
set -uo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "ERROR: not inside a git repository" >&2
  exit 1
}

# Best-effort: refresh remote refs so numbers claimed from other machines /
# already-pushed worktrees are seen. Offline is fine — we still scan local refs.
git fetch origin --prune --quiet 2>/dev/null || true

highest=0

consider() {
  local name="$1"
  if [[ "$name" =~ ^0*([0-9]{1,9})- ]]; then
    local n=$((10#${BASH_REMATCH[1]}))
    if ((n > highest)); then highest=$n; fi
  fi
}

# specs/ directories (skip timestamp-prefixed dirs, same rule as spec-kit)
if [ -d "$repo_root/specs" ]; then
  for dir in "$repo_root/specs"/*/; do
    [ -d "$dir" ] || continue
    base="$(basename "$dir")"
    [[ "$base" =~ ^[0-9]{8}-[0-9]{6}- ]] && continue
    consider "$base"
  done
fi

# Local + remote branch names (covers other worktrees' branches too, since
# every worktree's branch is a local ref in the shared repository)
while IFS= read -r ref; do
  consider "${ref#origin/}"
done < <(git for-each-ref refs/heads refs/remotes/origin --format='%(refname:short)' 2>/dev/null)

printf '%03d\n' $((highest + 1))
