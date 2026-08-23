#!/usr/bin/env bash
set -euo pipefail

HOSTING_JSON=".openai/hosting.json"
HOSTING_JSON_BACKUP=".openai/hosting.json.backup"

cleanup() {
  if [[ -f "${HOSTING_JSON_BACKUP}" ]]; then
    mv "${HOSTING_JSON_BACKUP}" "${HOSTING_JSON}"
    echo "Restored ${HOSTING_JSON}"
  fi
}

trap cleanup EXIT

if [[ -f "${HOSTING_JSON}" ]]; then
  echo "Temporarily hiding ${HOSTING_JSON} to avoid duplicate bindings..."
  mv "${HOSTING_JSON}" "${HOSTING_JSON_BACKUP}"
fi

echo "Building for Cloudflare Workers..."
export BUILD_TARGET=cloudflare
vinext build

# vinext generates dist/client/wrangler.json with "main": "../server/index.js"
# This is correct - wrangler will use that file when deploying

echo "Build complete for Cloudflare Workers!"
echo "Entry point: dist/server/index.js (via dist/client/wrangler.json)"
