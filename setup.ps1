# One-time setup on Windows. Run from D:\tasking:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = 'Stop'

Push-Location "$PSScriptRoot\backend"
if (-not (Test-Path .venv)) {
    # Create the venv with the signed python.org launcher: Smart App Control blocks the one uv makes.
    py -3 -m venv .venv
}
uv sync
# Smart App Control blocks SQLAlchemy's compiled speed-ups (*_cy*.pyd) at random. SQLAlchemy ships a pure-Python
# copy of each one, which Python only uses when the compiled file is absent. Linux hosts are unaffected.
Get-ChildItem .venv\Lib\site-packages\sqlalchemy -Recurse -Filter '*_cy*.pyd' | Remove-Item -Force
Pop-Location

Push-Location "$PSScriptRoot\frontend"
npm install
Pop-Location

Write-Host "Setup done. Start the app with .\run.ps1, then open http://127.0.0.1:8000"
