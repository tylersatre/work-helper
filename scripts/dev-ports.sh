#!/usr/bin/env bash
# Derive per-feature dev ports from the current branch's NNN- prefix so
# parallel worktrees never collide: feature 006 -> API 3006, Vite 5106.
# main / unnumbered branches keep the defaults (3000 / 5173).
# Explicitly-set PORT / VITE_PORT always win over the derived values.
set -euo pipefail

branch="$(git branch --show-current 2>/dev/null || true)"

if [[ "$branch" =~ ^0*([0-9]{1,3})- ]]; then
  n=$((10#${BASH_REMATCH[1]}))
  export PORT="${PORT:-$((3000 + n))}"
  export VITE_PORT="${VITE_PORT:-$((5100 + n))}"
else
  export PORT="${PORT:-3000}"
  export VITE_PORT="${VITE_PORT:-5173}"
fi

echo "[dev-ports] branch '${branch:-<none>}' -> API http://localhost:${PORT}  UI http://localhost:${VITE_PORT}" >&2

exec "$@"
