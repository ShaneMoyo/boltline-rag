#!/bin/sh
# Run once per clone: enables .githooks so Made-with: Cursor is stripped on every commit.
cd "$(dirname "$0")/.."
chmod +x .githooks/commit-msg 2>/dev/null || true
git config core.hooksPath .githooks
echo "core.hooksPath set to .githooks (commit-msg strips Made-with: Cursor)"
