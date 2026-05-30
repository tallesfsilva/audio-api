#!/bin/sh
set -e

echo "🐳  Whisper SaaS API starting..."

# ── Wait for PostgreSQL ────────────────────────────────────────────────────────
echo "⏳  Waiting for PostgreSQL at ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}..."
until nc -z "${POSTGRES_HOST:-postgres}" "${POSTGRES_PORT:-5432}"; do
  sleep 1
done
echo "✅  PostgreSQL is ready"

# ── Wait for Redis ─────────────────────────────────────────────────────────────
echo "⏳  Waiting for Redis at ${REDIS_HOST:-redis}:${REDIS_PORT:-6379}..."
until nc -z "${REDIS_HOST:-redis}" "${REDIS_PORT:-6379}"; do
  sleep 1
done
echo "✅  Redis is ready"

# ── Run Prisma migrations ──────────────────────────────────────────────────────
echo "🔄  Running database migrations..."
if [ "$NODE_ENV" = "production" ]; then
  npx prisma migrate deploy
else
  npx prisma migrate dev --name init --skip-seed 2>/dev/null || npx prisma migrate deploy
fi
echo "✅  Migrations complete"

# ── Start the server ───────────────────────────────────────────────────────────
if [ "$NODE_ENV" = "production" ]; then
  echo "🚀  Starting production server..."
  exec node dist/server.js
else
  echo "🚀  Starting development server (hot reload)..."
  exec npx tsx watch src/server.ts
fi
