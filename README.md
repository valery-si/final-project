# TrustLens

TrustLens is a local-first misleading-content and AI-style analysis system built from four parts:

- a Chrome extension for quick analysis of selected text
- a FastAPI backend that scores text and stores reports
- a React dashboard for history, statistics, and report details
- a PostgreSQL database for persistent storage

## Current Architecture

```text
Chrome Extension
  -> POST /api/analyze
  -> POST /api/tldr
  -> GET /api/history

FastAPI Backend
  -> local signal scoring
  -> local TL;DR generation
  -> optional OpenAI AI-audit
  -> optional OpenAI TL;DR generation
  -> PostgreSQL persistence

React Dashboard
  -> /history style dashboard
  -> /report/:id detailed report
  -> /statistics domain history graph
  -> /settings API key management
  -> TL;DR local model status display
```

## Main Features

- Analyze highlighted text directly from the browser
- Summarize highlighted text directly from the browser with TL;DR
- Save every analysis as a report with signal breakdown
- Run optional AI audit using a user-provided OpenAI API key
- Generate TL;DR summaries with either a local model or OpenAI
- View historical reports and per-domain signal trends

## TL;DR Workflow

TrustLens has a separate TL;DR flow in addition to credibility analysis.

- The extension popup lets the user choose TL;DR mode:
  - `Local Model`
  - `ChatGPT`
- After selecting text on a webpage, the inline action menu offers:
  - `Analyze Text`
  - `TL;DR`
- TL;DR output is displayed inside the extension in a modal on the current page.
- The backend exposes `GET /api/tldr-status` so the dashboard can show whether the local summarization model is loading, ready, or failed.

## Evaluation Signals

TrustLens currently uses three evaluation signals in the main scoring flow:

- `Emotional Intensity`
- `Source Weakness`
- `Generic AI-like Style`

It also stores:

- `Label Confidence`

`Label Confidence` is metadata about model certainty. It is not one of the three main risk signals.

## Risk Labels

Default thresholds in the backend:

- `0.00-0.27` -> `Mostly Credible Tone`
- `0.28-0.44` -> `Mixed Signals`
- `0.45-0.64` -> `Attention Required`
- `0.65-1.00` -> `High Risk`

## Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL
- Local NLP: `roberta-large-mnli`
- Local TL;DR model: `facebook/bart-large-cnn`
- Extension: Chrome Manifest V3

## Project Structure

```text
final-project/
  client/                  React dashboard
  extension/               Chrome extension
  server/                  FastAPI backend
  scripts/                 local startup scripts
  demo-news.html           local demo page for testing
  README.md
```

## Important Endpoints

- `POST /api/analyze`
- `POST /api/check-ai`
- `POST /api/tldr`
- `GET /api/tldr-status`
- `GET /api/history`
- `GET /api/report/{id}`
- `GET /api/domain-history`
- `DELETE /api/report/{id}`
- `DELETE /api/history`
- `GET /api/settings`
- `PUT /api/settings/api-key`
- `DELETE /api/settings/api-key`

## Local Run

This is the recommended way to run the project for development and demo.

### 1. Start infrastructure

You need PostgreSQL running locally. The project includes a helper script for the database stack:

```powershell
.\scripts\start-infra.ps1
```

That starts:

- PostgreSQL on `localhost:5432`
- pgAdmin on `http://localhost:5050`

Default pgAdmin credentials from `docker-compose.yml`:

- email: `admin@mail.com`
- password: `admin`

### 2. Start backend

Create the backend virtual environment once:

```powershell
cd server
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Then run the backend with the local script:

```powershell
cd ..
.\scripts\start-server-local.ps1
```

Backend URL:

- `http://localhost:8000`

### 3. Start frontend

Install frontend dependencies once:

```powershell
cd client
npm install
cd ..
```

Then run the frontend with the local script:

```powershell
.\scripts\start-client-local.ps1
```

Frontend URL:

- `http://localhost:5173`

### 4. Load the extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select `final-project/extension`

## Script Summary

- `scripts/start-infra.ps1`
  Starts PostgreSQL and pgAdmin with Docker Compose.

- `scripts/start-server-local.ps1`
  Starts the FastAPI backend locally with environment variables configured in PowerShell.

- `scripts/start-client-local.ps1`
  Starts the React dashboard locally on port `5173`.

## Configuration Notes

The backend startup script currently sets:

- `DATABASE_URL`
  PostgreSQL connection string used by FastAPI and SQLAlchemy.
- `CLIENT_BASE_URL`
  Allowed frontend origin for CORS and dashboard links.
- `OPENAI_MODEL`
  OpenAI model used for optional AI audit and OpenAI TL;DR mode.
- `TLDR_NEURAL_MODEL`
  Local Hugging Face summarization model used in `local-neural` TL;DR mode.
- `PRELOAD_ROBERTA`
  If `true`, loads the credibility-analysis model on backend startup instead of waiting for the first request.
- `PRELOAD_TLDR`
  If `true`, loads the local TL;DR model on backend startup instead of waiting for the first TL;DR request.
- `WEIGHT_EMOTIONAL`
  Weight of the `Emotional Intensity` signal in the final risk score.
- `WEIGHT_SOURCE_INVERSE`
  Weight of the `Source Weakness` contribution in the final risk score.
- `WEIGHT_STRUCTURE`
  Weight of the `Generic AI-like Style` contribution in the final risk score.
- `THRESHOLD_CAUTION`
  Minimum score for moving from `Mostly Credible Tone` to `Mixed Signals`.
- `THRESHOLD_NO_GO`
  Minimum score for moving from `Mixed Signals` to `Attention Required`.
- `THRESHOLD_HARD_NO_GO`
  Minimum score for moving from `Attention Required` to `High Risk`.

The current local TL;DR model in `scripts/start-server-local.ps1` is:

- `facebook/bart-large-cnn`

## Notes About Identity and API Keys

- This project currently uses a local single-user profile model on the backend.
- The extension and dashboard both talk to the same local backend.
- The OpenAI API key is stored through the dashboard settings flow and used only for optional AI audit and OpenAI TL;DR mode.

## Extension Flow

- Highlight text on a webpage
- Click `Analyze Text` for credibility scoring
- Click `TL;DR` for summarization
- Use the extension popup to switch TL;DR mode between local summarization and ChatGPT
- Use the dashboard for detailed reports, domain statistics, and API key management

## Demo Page

For quick testing, open:

- [demo-news.html](<demo-news.html>)

It contains example texts designed to produce different signal profiles.

## Optional Utilities

The `server/scripts/` folder contains calibration utilities for tuning scoring weights and thresholds. These are optional developer tools and are not required to run the application.

