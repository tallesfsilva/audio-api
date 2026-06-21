#!/bin/sh
set -e

echo "🐳  Whisper SaaS API starting..."

# ── Start the server ───────────────────────────────────────────────────────────
if [ "$NODE_ENV" = "production" ]; then
  echo "🚀  Starting production server..."
  exec node dist/server.js
else
  echo "🚀  Starting development server (hot reload)..."
  exec npx tsx watch src/server.ts
fi
