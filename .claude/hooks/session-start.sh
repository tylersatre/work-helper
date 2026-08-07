#!/usr/bin/env bash
# SessionStart hook — bootstrap a fresh worktree so it's ready to build.
# Native Claude worktrees (.claude/worktrees/) start as bare checkouts with no
# node_modules; install dependencies once so lint/test/build and the dev
# server work immediately. No-op in an already-installed checkout.
# The SQLite db needs no setup: the server migrates ./data/ on boot.
set -uo pipefail

if [ -f package.json ] && [ ! -d node_modules ]; then
  echo "[session-start] node_modules missing — running npm install..." >&2
  npm install --no-audit --no-fund >&2 || {
    echo "[session-start] npm install FAILED — run it manually before building." >&2
    exit 0
  }
fi

exit 0
