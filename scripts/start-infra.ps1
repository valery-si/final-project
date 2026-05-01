$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

docker compose -f docker-compose.yml up -d db pgadmin
