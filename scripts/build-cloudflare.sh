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

# Ensure the generated wrangler.json has the main field
GENERATED_WRANGLER="dist/client/wrangler.json"
if [[ -f "${GENERATED_WRANGLER}" ]]; then
  echo "Ensuring main field in ${GENERATED_WRANGLER}..."
  if command -v jq &> /dev/null; then
    jq '. + {"main": "../server/index.js"}' "${GENERATED_WRANGLER}" > "${GENERATED_WRANGLER}.tmp"
    mv "${GENERATED_WRANGLER}.tmp" "${GENERATED_WRANGLER}"
  else
    # Fallback: use node to add main field
    node -e "const fs=require('fs'); const p='${GENERATED_WRANGLER}'; const c=JSON.parse(fs.readFileSync(p,'utf8')); c.main='../server/index.js'; fs.writeFileSync(p,JSON.stringify(c));"
  fi
  echo "Wrangler config after adding main field:"
  cat "${GENERATED_WRANGLER}" | head -5
fi

echo "Build complete for Cloudflare Workers!"
echo "Entry point: dist/server/index.js (via dist/client/wrangler.json)"
