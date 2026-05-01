# syntax=docker/dockerfile:1.7
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt \
    && pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0

COPY app ./app
COPY scripts ./scripts
COPY .env.example ./.env

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
