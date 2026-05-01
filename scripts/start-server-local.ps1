$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server"
Set-Location $server

if (-not (Test-Path ".\.venv\Scripts\Activate.ps1")) {
  throw "Missing server virtualenv at server\.venv. Create it first with: py -3.12 -m venv .venv"
}

.\.venv\Scripts\Activate.ps1

$env:DATABASE_URL = "postgresql+psycopg2://safebrowse:safebrowse@localhost:5432/safebrowse"
$env:CLIENT_BASE_URL = "http://localhost:5173"
$env:OPENAI_MODEL = "gpt-4o-mini"
$env:TLDR_NEURAL_MODEL = "facebook/bart-large-cnn" #"sshleifer/distilbart-cnn-12-6"
$env:PRELOAD_ROBERTA = if ($env:PRELOAD_ROBERTA) { $env:PRELOAD_ROBERTA } else { "true" }
$env:PRELOAD_TLDR = if ($env:PRELOAD_TLDR) { $env:PRELOAD_TLDR } else { "true" }
$env:HF_HOME = Join-Path $env:USERPROFILE ".cache\huggingface"
$env:WEIGHT_EMOTIONAL = if ($env:WEIGHT_EMOTIONAL) { $env:WEIGHT_EMOTIONAL } else { "0.52" }
$env:WEIGHT_SOURCE_INVERSE = if ($env:WEIGHT_SOURCE_INVERSE) { $env:WEIGHT_SOURCE_INVERSE } else { "0.33" }
$env:WEIGHT_STRUCTURE = if ($env:WEIGHT_STRUCTURE) { $env:WEIGHT_STRUCTURE } else { "0.15" }
$env:THRESHOLD_CAUTION = if ($env:THRESHOLD_CAUTION) { $env:THRESHOLD_CAUTION } else { "0.28" }
$env:THRESHOLD_NO_GO = if ($env:THRESHOLD_NO_GO) { $env:THRESHOLD_NO_GO } else { "0.45" }
$env:THRESHOLD_HARD_NO_GO = if ($env:THRESHOLD_HARD_NO_GO) { $env:THRESHOLD_HARD_NO_GO } else { "0.65" }
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
