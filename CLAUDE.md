# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynasty Futures is a **proprietary futures trading firm** backend. Traders purchase evaluation challenges via Stripe, must meet profit targets while adhering to risk rules, and receive funded accounts upon success. Three tiers: Standard (evaluation → funded), Advanced (instant activation), Dynasty (instant funding). Account sizes: $25K–$150K.

The system integrates with **Volumetrica** (current trading platform) for account provisioning, trade data, and live snapshots. The provider is swappable via `TRADING_PLATFORM` env var — all platform access goes through the `TradingPlatformProvider` interface in `src/providers/`.

## Commands

```bash
# Development
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # TypeScript compile (tsc)
npm run typecheck        # Type check without emit

# Testing
npm test                 # Run all tests (jest)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (70% threshold on branches/functions/lines/statements)

# Linting & Formatting
npm run lint             # ESLint
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Prettier write
npm run format:check     # Prettier check

# Database
npm run db:generate      # Regenerate Prisma Client (also runs on npm install via prepare)
npm run db:migrate       # Create and apply migration (dev)
npm run db:migrate:prod  # Apply migrations only (production — prisma migrate deploy)
npm run db:studio        # Open Prisma Studio GUI
npm run db:seed          # Seed account types + challenge rules
npm run db:reset         # Reset and re-migrate (destructive)

# Local infrastructure
npm run up               # Start PostgreSQL (port 5433) + Redis (port 6379) via Docker Compose
npm run down             # Stop Docker Compose services
```

### Running a Single Test

```bash
npx jest src/path/to/file.test.ts
npx jest --testNamePattern="test name here"
```

### Local Dev Setup

```bash
npm install
npm run up                  # Starts Postgres + Redis
npm run db:migrate          # Apply migrations
npm run db:seed             # Seed account types and challenge rules
npm run dev                 # Start server on port 3000
```

## Architecture

Strict layered architecture — never skip layers (routes must not call repositories directly).

```
Routes → Services → Repositories → Prisma (DB)
              ↓
         Providers (Volumetrica, Stripe)
```

| Layer | Path | Responsibility |
|-------|------|----------------|
| Routes | `src/api/routes/v1/` | HTTP endpoints, Zod request validation (inline schemas), response formatting |
| Middleware | `src/api/middleware/` | Auth, error handler, rate limiter, request ID |
| Services | `src/services/` | All business logic. Exported as namespace modules via `src/services/index.ts` |
| Repositories | `src/repositories/` | All Prisma DB access. Use `prisma.$transaction()` for multi-table ops |
| Providers | `src/providers/` | External platform integrations. Factory in `src/providers/index.ts` returns cached singleton |
| Config | `src/config/index.ts` | Zod-validated env config — every env var is declared and validated here |
| Utils | `src/utils/` | Logger (Pino), DB client, Redis client, custom error classes |

### Key Patterns

- **Services are plain modules**, not classes. Import via `import { authService } from '../services/index.js'`
- **All imports use `.js` extensions** (NodeNext module resolution)
- **Path aliases** in tsconfig: `@/*`, `@api/*`, `@services/*`, `@repositories/*`, `@utils/*`, `@config/*`, `@types/*` — but route/service files use relative imports with `.js` extensions
- **Async route handlers** use try/catch with `next(error)` to forward exceptions to the global error handler. An `asyncHandler()` wrapper exists in `src/api/middleware/error-handler.ts` but is not currently used
- **Zod validation schemas** are defined inline in route files, not in separate schema files

### Middleware Order (in `src/app.ts`)

Order matters — Stripe webhook route is mounted **before** `express.json()` so the raw body is preserved for signature verification:

1. Trust proxy (for ALB)
2. Helmet, CORS, rate limiter
3. Request ID
4. **Stripe webhook route** (`/webhooks/stripe`) with `express.raw()`
5. `express.json()` + `express.urlencoded()` (10mb limit)
6. Morgan request logging
7. Health routes, API v1 routes
8. 404 handler, global error handler

### Authentication

JWT-based with access tokens (7d) + refresh tokens (30d). Refresh tokens stored as `Session` records in DB. Middleware in `src/api/middleware/auth.ts`:

- `authenticate` — requires Bearer token with `type: 'access'`, attaches `req.user: { id, email, role }`
- `optionalAuthenticate` — same but doesn't throw if missing
- `requireRole(...roles)` — RBAC check (TRADER, SUPPORT, ADMIN)

Google OAuth 2.0 via `google-auth-library`. Account lockout: 5 failed attempts → 30-min lock.

### Error Handling

Custom error classes in `src/utils/errors.ts`. **Never throw plain `Error` in services** — use the specific types:

- HTTP errors: `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError` (422), `RateLimitError` (429), `InternalError`, `ServiceUnavailableError`
- Domain errors: `AuthenticationError`, `TokenExpiredError`, `InvalidTokenError`, `AccountNotFoundError`, `UserNotFoundError`, `AccountSuspendedError`, `RuleViolationError`, `InsufficientFundsError`, `PaymentError` (402), `PlatformError` (502)

The global error handler auto-converts `ZodError` into `ValidationError` with field-level details. Unknown errors are wrapped in `InternalError` (message hidden in production).

### Trading Service — Hybrid Live/Stored

`src/services/trading.service.ts` uses a hybrid data strategy:
- **STORED** endpoints read from Prisma (fast, cached)
- **LIVE** endpoints pass through to the Volumetrica provider (real-time)
- Many endpoints support `?live=true` to force a refresh from the platform before returning stored data
- `syncService` handles writing platform data back into Prisma

### Database

- **ORM**: Prisma 6 with `@prisma/adapter-pg`
- **Local**: PostgreSQL 16 on port **5433** (not 5432 — avoids conflict with local installs)
- **Production**: AWS Aurora PostgreSQL
- Soft deletes via `deletedAt` field on user-facing models
- After any `schema.prisma` change: `npm run db:migrate` then `npm run db:generate`

### Rate Limiting

- **Global**: 100 requests per 15 minutes
- **Auth endpoints**: 10 requests per 15 minutes (`authRateLimiter`)
- Skips `/health` and `/ready`

## Coding Standards

- **TypeScript strict mode** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` are all enabled
- No `any` — use `unknown` for truly unknown types
- Prefer `interface` over `type` for object shapes
- Explicit return types on functions
- `async/await` over raw Promises
- **Files**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase
- **Functions/Variables**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE
- **API routes**: `/v1` prefix, plural nouns, REST methods
- **Formatting**: Prettier with 100 char width, single quotes, trailing commas (es5), 2-space indent
- **ESLint**: `no-explicit-any` is an error, `no-console` (except warn/error) is a warning, `eqeqeq` always

## Implementation Status

Check `docs/dynasty-futures-backend-plan.md` for phase status. Built incrementally:
Infrastructure → Auth → Challenges → Rules Engine → Payouts/Admin → Launch

**Mounted routes**: `/v1/auth`, `/v1/users`, `/v1/accounts`, `/v1/checkout`, `/v1/trading`, `/v1/support`
**Not yet mounted**: `/v1/challenges`, `/v1/payouts`, `/v1/admin`

## CI/CD & Deployment

- **Deploy pipeline** (`.github/workflows/deploy.yml`): push to `main` → build Docker image → push to ECR → run Prisma migrations as ECS task → deploy to ECS Fargate
- Manual dispatch supports `run_migrations` and `run_seed` flags
- **Terraform** pipelines for infrastructure changes
- Secrets in **AWS Secrets Manager** (not env files in production)
- Terraform naming: `{project}-{resource}-{environment}` (e.g., `dynasty-futures-vpc-prod`)
- All Terraform resources must be tagged with `Project`, `Environment`, `ManagedBy`
