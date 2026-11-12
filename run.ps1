# Build the web app and serve app + API together at http://127.0.0.1:8000
# Add -Lan to let phones on the same Wi-Fi open it at http://<this-PC's-IP>:8000
param([switch]$Lan)
$ErrorActionPreference = 'Stop'

Push-Location "$PSScriptRoot\frontend"
npm run build
Pop-Location

$hostAddr = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
Push-Location "$PSScriptRoot\backend"
uv run python -m uvicorn app.main:create_app --factory --host $hostAddr --port 8000
Pop-Location
