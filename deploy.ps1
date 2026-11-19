# Read Cloudflare credentials from WSL hermes environment and deploy Pages project.
$ErrorActionPreference = 'Stop'
$token = (wsl -d Ubuntu-24.04 -- bash -lc "grep -E '^CLOUDFLARE_API_TOKEN=' /home/fanweiya/.hermes/.env | head -1 | cut -d= -f2-").Trim()
$account = (wsl -d Ubuntu-24.04 -- bash -lc "grep -E '^CLOUDFLARE_ACCOUNT_ID=' /home/fanweiya/.hermes/.env | head -1 | cut -d= -f2-").Trim()
if (-not $token -or -not $account) {
    throw 'Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID in WSL ~/.hermes/.env'
}
$env:CLOUDFLARE_API_TOKEN = $token
$env:CLOUDFLARE_ACCOUNT_ID = $account
Set-Location $PSScriptRoot
npm run build
npx wrangler pages deploy dist --project-name gomoku-jev
