#!/usr/bin/env bash
set -euo pipefail

force=0
if [ "${1:-}" = "--force" ]; then
  force=1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Skipping git hook setup (not a git repository)"
  exit 0
fi

if [ ! -f .githooks/pre-push ]; then
  echo "Skipping git hook setup (.githooks/pre-push was not found)"
  exit 0
fi

current_hooks_path="$(git config --get core.hooksPath || true)"
if [ -n "$current_hooks_path" ] && [ "$current_hooks_path" != ".githooks" ]; then
  if [ "$force" -ne 1 ]; then
    echo "Skipping git hook setup (core.hooksPath is already '$current_hooks_path')."
    echo "Run 'bun run setup:hooks:force' only if you agree to overwrite."
    exit 0
  fi
  echo "Overriding repository hooks path: '$current_hooks_path' -> '.githooks' (--force)"
elif [ "$force" -eq 1 ]; then
  echo "Reconfiguring repository hooks path to .githooks (--force)"
fi

git config core.hooksPath .githooks
chmod +x .githooks/pre-push

echo "Configured git hooks path to .githooks"
echo "pre-push hook is ready"
