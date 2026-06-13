#!/bin/bash
# Stamps sw.js CACHE_VERSION with the current git short hash before deploying.
# Run once after all changes are staged:  ./bump-sw-version.sh
# Then commit everything including the updated sw.js.

set -e

HASH=$(git rev-parse --short HEAD 2>/dev/null)
if [[ -z "$HASH" ]]; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

sed -i "s/const CACHE_VERSION = \"[^\"]*\"/const CACHE_VERSION = \"${HASH}\"/" sw.js

echo "sw.js: CACHE_VERSION → \"${HASH}\""
