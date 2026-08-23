$ErrorActionPreference = "Stop"

$HOSTING_JSON = ".openai/hosting.json"
$HOSTING_JSON_BACKUP = ".openai/hosting.json.backup"

function Cleanup {
    if (Test-Path -LiteralPath $HOSTING_JSON_BACKUP) {
        Move-Item -LiteralPath $HOSTING_JSON_BACKUP -Destination $HOSTING_JSON -Force
        Write-Host "Restored $HOSTING_JSON"
    }
}

try {
    if (Test-Path -LiteralPath $HOSTING_JSON) {
        Write-Host "Temporarily hiding $HOSTING_JSON to avoid duplicate bindings..."
        Move-Item -LiteralPath $HOSTING_JSON -Destination $HOSTING_JSON_BACKUP -Force
    }

    Write-Host "Building for Cloudflare Workers..."
    $env:BUILD_TARGET = "cloudflare"
    & npx vinext build

    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }

    Write-Host "Build complete for Cloudflare Workers!"
    Write-Host "Entry point: dist/server/index.js (via dist/client/wrangler.json)"
}
finally {
    Cleanup
}
