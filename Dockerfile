# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# ─── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN npm run build

# ─── Stage 3: runner (production image) ───────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 appuser

# Copy entrypoint as root before switching user
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy only what's needed at runtime
COPY --from=deps    /app/node_modules         ./node_modules
COPY --from=builder /app/dist                 ./dist
COPY --from=builder /app/prisma               ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Storage & logs directories
RUN mkdir -p /app/storage/uploads /app/storage/results /app/logs \
 && chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
