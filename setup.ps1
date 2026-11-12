# One-time setup on Windows. Run from D:\tasking:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = 'Stop'

Push-Location "$PSScriptRoot\backend"
if (-not (Test-Path .venv)) {
    # Create the venv with the signed python.org launcher: Smart App Control blocks the one uv makes.
    py -3 -m venv .venv
}
uv sync
Pop-Location

Push-Location "$PSScriptRoot\frontend"
npm install
Pop-Location

Write-Host "Setup done. Start the app with .\run.ps1, then open http://127.0.0.1:8000"
