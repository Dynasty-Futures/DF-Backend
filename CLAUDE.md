# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynasty Futures is a **proprietary futures trading firm** backend. Traders purchase evaluation challenges via Stripe, must meet profit targets while adhering to risk rules, and receive funded accounts upon success. The system integrates with **Volumetrica** (current trading platform) for trading data.

## Commands

```bash
# Development
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # TypeScript compile
npm run typecheck        # Type check without emit

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (70% threshold)

# Linting & Formatting
npm run lint             # ESLint
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Prettier write
npm run format:check     # Prettier check

# Database
npm run db:migrate       # Create and apply migration (dev)
npm run db:migrate:prod  # Apply migrations (production)
npm run db:generate      # Regenerate Prisma Client after schema changes
npm run db:studio        # Open Prisma Studio GUI
npm run db:seed          # Seed database
npm run db:reset         # Reset and re-migrate (destructive)

# Local infrastructure
npm run up               # Start PostgreSQL + Redis via Docker Compose
npm run down             # Stop Docker Compose services
```

### Running a Single Test

```bash
npx jest src/path/to/file.test.ts
npx jest --testNamePattern="test name here"
```

## Architecture

The app follows a strict layered architecture — never skip layers (e.g., routes should not call repositories directly).

```
Routes → Middleware → Services → Repositories → Prisma (DB)
                                     ↓
                               Providers (external APIs)
```

| Layer | Path | Responsibility |
|-------|------|----------------|
| Routes | `src/api/routes/v1/` | HTTP endpoint definitions, input validation |
| Middleware | `src/api/middleware/` | Auth (`authenticate`, `optionalAuthenticate`, `requireRole`), error handler, rate limiter, request ID |
| Services | `src/services/` | Business logic — auth, user, account, challenge, stripe, trading, sync, email |
| Repositories | `src/repositories/` | All Prisma DB access |
| Providers | `src/providers/` | External platform integrations (Volumetrica) |
| Config | `src/config/index.ts` | Zod-validated env config — all env vars go through here |
| Utils | `src/utils/` | Logger (Pino), DB client, Redis client, custom error classes |

### Entry Points

- `src/index.ts` — bootstraps DB/Redis, starts Express server, handles graceful shutdown
- `src/app.ts` — Express app factory: security middleware (Helmet, CORS, rate limiting), Stripe raw body, route mounting

### Authentication

JWT-based with access tokens (7d) + refresh tokens (30d). Middleware in `src/api/middleware/auth.ts`:
- `authenticate` — requires valid Bearer token
- `optionalAuthenticate` — continues if token missing/invalid
- `requireRole(...roles)` — RBAC (TRADER, SUPPORT, ADMIN)

Google OAuth 2.0 is also supported. Accounts lock after 5 failed login attempts (30-min lockout).

### Error Handling

Use the custom error classes from `src/utils/errors.ts`. Never throw plain `Error` objects in services. All errors are caught by the global error handler middleware and returned as:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### Database

- **ORM**: Prisma 6 with `@prisma/adapter-pg`
- **Local**: PostgreSQL 16 via Docker Compose
- **Production**: AWS Aurora PostgreSQL
- Use transactions for multi-step operations
- Use soft deletes (`deleted_at`) for user-facing data
- Never write raw SQL unless Prisma cannot express it

After any `schema.prisma` change: run `npm run db:migrate` then `npm run db:generate`.

## Coding Standards

- **TypeScript strict mode** — no `any`, use `unknown` for truly unknown types
- Prefer `interface` over `type` for object shapes
- Explicit return types on functions
- `async/await` over raw Promises
- **Files**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase (`UserService`)
- **Functions/Variables**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE
- **API routes**: `/v1` prefix, plural nouns, REST methods

## Implementation Status

Check `docs/dynasty-futures-backend-plan.md` for current phase status. The project is being built incrementally across 6 phases (Infrastructure → Auth → Challenges → Rules Engine → Payouts/Admin → Launch).

- Current trading platform integration: **Volumetrica** (`src/providers/`)
- Routes not yet mounted: `/v1/challenges`, `/v1/payouts`, `/v1/admin`

## Infrastructure

- **Compute**: ECS Fargate (main app), Lambda (one-off tasks)
- **Terraform**: `terraform/environments/prod/` — all infra as code
- **CI/CD**: GitHub Actions (`.github/workflows/`)
- **Secrets**: AWS Secrets Manager in production
- Terraform naming: `{project}-{resource}-{environment}` (e.g., `dynasty-futures-vpc-prod`)
- All Terraform resources must be tagged with `Project`, `Environment`, `ManagedBy`
