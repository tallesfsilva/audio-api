# Whisper SaaS API

A scalable Node.js/TypeScript API for audio transcription using Whisper Faster. Files are uploaded via the API, queued with **BullMQ + Redis**, and processed by a Python worker. All services run in Docker.

---

## Architecture

```
┌─────────────┐     upload      ┌─────────────────────────────────────────┐
│   Frontend  │ ──────────────► │              Node API (Express)          │
│  (React)    │ ◄────────────── │   Auth · Upload · Jobs · Billing · Users │
└─────────────┘   JWT + polling └──────────────┬──────────────────────────┘
                                               │ BullMQ enqueue
                                               ▼
                                       ┌──────────────┐
                                       │    Redis      │
                                       │  (BullMQ)     │
                                       └──────┬───────┘
                                              │ dequeue
                                              ▼
                                    ┌──────────────────┐
                                    │  Python Worker   │
                                    │ (Whisper Faster) │
                                    └──────┬───────────┘
                                           │ POST /internal/jobs/:id/callback
                                           ▼
                                    ┌──────────────┐
                                    │  PostgreSQL   │
                                    └──────────────┘
```

---

## Quick Start

### Development (hot reload)

```bash
# 1. Clone & enter project
git clone <repo> && cd whisper-saas-api

# 2. Start all services with hot reload
docker compose -f docker-compose.dev.yml up --build

# API available at:  http://localhost:3000/api/v1
# Health check:      http://localhost:3000/health
```

Source code is bind-mounted — saving any `.ts` file restarts the server automatically.

### Production

```bash
# 1. Create your env file from the template
cp .env.docker .env

# 2. Fill in secrets (at minimum these three):
#    POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#
#    Generate JWT secrets:
openssl rand -hex 32   # run twice, use each output for one secret

# 3. Build and start
docker compose up --build -d

# 4. Check everything is healthy
docker compose ps
docker compose logs -f api
```

---

## Services

| Service    | Container             | Default port | Notes                          |
|------------|-----------------------|-------------|--------------------------------|
| `api`      | `whisper_api`         | `3000`      | Node.js Express API            |
| `postgres` | `whisper_postgres`    | `5432`      | PostgreSQL 16                  |
| `redis`    | `whisper_redis`       | `6379`      | Redis 7 with persistence       |

All services communicate on the **`whisper_net`** Docker bridge network.

---

## API Endpoints

### Auth  `/api/v1/auth`
| Method | Path           | Auth | Description             |
|--------|----------------|------|-------------------------|
| POST   | `/signup`      | —    | Create account          |
| POST   | `/login`       | —    | Login, get JWT tokens   |
| POST   | `/refresh`     | —    | Refresh access token    |
| POST   | `/logout`      | —    | Revoke refresh token    |
| POST   | `/logout-all`  | ✓    | Revoke all tokens       |
| GET    | `/me`          | ✓    | Current user info       |

### Upload  `/api/v1/upload`
| Method | Path | Auth | Description                        |
|--------|------|------|------------------------------------|
| POST   | `/`  | ✓    | Upload file, returns job ID        |

Body: `multipart/form-data` with fields:

| Field               | Type    | Default  | Options                                        |
|---------------------|---------|----------|------------------------------------------------|
| `file`              | File    | required | mp3, mp4, wav, m4a, ogg, flac, webm, mkv...    |
| `language`          | string  | `auto`   | auto, en, es, fr, de, it, pt, ru, ja, ko, zh  |
| `modelSize`         | string  | `base`   | tiny, base, small, medium, large, large-v3     |
| `outputFormat`      | string  | `json`   | json, srt, vtt, txt, tsv                       |
| `enableDiarization` | boolean | `false`  | Speaker detection                              |
| `enableTimestamps`  | boolean | `true`   | Word-level timestamps                          |

### Jobs  `/api/v1/jobs`
| Method | Path              | Auth | Description           |
|--------|-------------------|------|-----------------------|
| GET    | `/`               | ✓    | List jobs (paginated) |
| GET    | `/:id`            | ✓    | Get job details       |
| POST   | `/:id/cancel`     | ✓    | Cancel queued job     |
| DELETE | `/:id`            | ✓    | Delete completed job  |
| GET    | `/metrics`        | ✓    | Queue health stats    |

### Billing  `/api/v1/billing`
| Method | Path            | Auth | Description             |
|--------|-----------------|------|-------------------------|
| GET    | `/plans`        | —    | List all plans          |
| GET    | `/overview`     | ✓    | Usage + current plan    |
| POST   | `/select-plan`  | ✓    | Switch plan (mocked)    |

### Users  `/api/v1/users`
| Method | Path               | Auth | Description        |
|--------|--------------------|------|--------------------|
| GET    | `/profile`         | ✓    | Get profile        |
| PATCH  | `/profile`         | ✓    | Update name        |
| POST   | `/change-password` | ✓    | Change password    |
| DELETE | `/account`         | ✓    | Delete account     |

---

## Useful Docker Commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f postgres
docker compose logs -f redis

# Run a one-off Prisma migration
docker compose exec api npx prisma migrate deploy

# Open Prisma Studio (dev only)
docker compose -f docker-compose.dev.yml exec api npx prisma studio

# Connect to Postgres directly
docker compose exec postgres psql -U whisper -d whisper_saas

# Connect to Redis CLI
docker compose exec redis redis-cli -a redis_secret

# Rebuild only the API after code changes (prod)
docker compose up --build -d api

# Stop everything
docker compose down

# Stop and remove volumes (⚠️ deletes all data)
docker compose down -v
```

---

## Environment Variables

See `.env.docker` for the full list with descriptions. At minimum, set:

```bash
POSTGRES_PASSWORD=<strong password>
REDIS_PASSWORD=<strong password>
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
```

---

## Python Worker

The Python worker connects to the same Redis instance and reads from the `transcription` BullMQ queue. It receives `TranscriptionJobData` payloads (see `src/shared/types/queue.ts`) and POSTs results back to:

```
POST /api/v1/internal/jobs/:id/callback
POST /api/v1/internal/jobs/:id/progress
```

Both routes require an `X-Callback-Signature` HMAC header. Add the Python worker service to `docker-compose.yml` on the same `whisper_net` network so it can reach `http://api:3000`.

---

## Plans

| Plan       | Minutes/month | Max file | Models          | Price     |
|------------|--------------|----------|-----------------|-----------|
| Free       | 60           | 50 MB    | tiny, base      | Free      |
| Starter    | 600          | 200 MB   | up to medium    | $9.99/mo  |
| Pro        | 3 000        | 500 MB   | all + large-v3  | $29.99/mo |
| Enterprise | Unlimited    | 2 GB     | all + dedicated | Custom    |
