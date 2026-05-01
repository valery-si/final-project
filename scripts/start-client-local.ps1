$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$client = Join-Path $root "client"
Set-Location $client

$env:VITE_API_BASE_URL = "http://localhost:8000/api"

npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
