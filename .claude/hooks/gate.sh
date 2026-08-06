#!/usr/bin/env bash
# Verification gate — Stop hook. Blocks ending the turn (exit 2) if this
# project has a package.json and any of its lint/typecheck/test/build
# scripts fail. See docs/setup/environment-audit.md and the constitution
# (Principle III: Definition of Done) for why this exists.
set -uo pipefail

input="$(cat)"

# Loop guard: never re-run when this Stop event is itself a hook continuation.
if echo "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Pre-code phase: nothing to verify yet.
if [ ! -f package.json ]; then
  exit 0
fi

failures=""

for script in lint typecheck test build; do
  output="$(npm run "$script" --if-present 2>&1)"
  status=$?
  if [ $status -ne 0 ]; then
    trimmed="$(printf '%s\n' "$output" | tail -n 40)"
    failures="${failures}--- npm run ${script} failed (exit ${status}) ---
${trimmed}

"
  fi
done

if [ -n "$failures" ]; then
  printf '%s' "$failures" >&2
  echo "Verification gate FAILED. Fix the issues above (lint/typecheck/test/build) before stopping." >&2
  exit 2
fi

exit 0
