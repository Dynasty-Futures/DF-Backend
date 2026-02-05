# AI Agent Guidelines - Dynasty Futures Backend

This document provides context and guidelines for AI agents working on the Dynasty Futures backend codebase.

## Project Overview

Dynasty Futures is a **proprietary futures trading firm** that offers traders funded accounts. The backend system handles:

- User authentication and KYC verification
- Challenge purchases (via Stripe) and account management
- Real-time trading rules enforcement
- Payout processing and admin workflows
- Integration with YourPropFirm API for trading data

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Runtime | Node.js |
| ORM | Prisma |
| Database | AWS Aurora PostgreSQL |
| Cache | ElastiCache Redis |
| Compute | ECS Fargate (main), Lambda (one-off tasks) |
| Infrastructure | Terraform |
| CI/CD | GitHub Actions |
| Payments | Stripe |
| Trading Data | YourPropFirm API |

## Project Structure

```
DF-Backend/
├── .github/workflows/     # CI/CD pipelines
├── prisma/                # Database schema and migrations
│   └── schema.prisma      # Prisma schema with all models
├── src/                   # Application source code
│   ├── api/               # REST API layer
│   │   ├── middleware/    # Express middleware
│   │   └── routes/        # Route handlers
│   ├── config/            # Configuration management
│   ├── services/          # Business logic (TODO)
│   ├── repositories/      # Data access layer (TODO)
│   ├── jobs/              # Background workers (TODO)
│   ├── rules-engine/      # Trading rules validation (TODO)
│   ├── utils/             # Shared utilities (logger, errors, db)
│   └── test/              # Test setup
├── terraform/             # Infrastructure as Code
│   ├── environments/      # Environment-specific configs
│   │   └── prod/          # Production environment
│   ├── modules/           # Reusable Terraform modules
│   │   └── iam/           # IAM users, groups, policies
│   └── shared/            # Shared resources (state backend)
├── docker/                # Container configurations
│   ├── Dockerfile         # Production multi-stage build
│   └── Dockerfile.dev     # Development with hot reload
├── scripts/               # Utility scripts
│   └── init-db.sql        # Database initialization
└── docs/                  # Documentation
    └── AWS-GETTING-STARTED.md
```

## Key Files

| File | Purpose |
|------|---------|
| `dynasty-futures-backend-plan.md` | Master implementation plan with status tracking |
| `dynasty-futures-backend-prompt.md` | Original requirements document |
| `terraform/README.md` | Terraform setup and deployment guide |
| `terraform/environments/prod/main.tf` | Production infrastructure entry point |
| `terraform/modules/networking/main.tf` | VPC, subnets, security groups |

## Implementation Status

Check `dynasty-futures-backend-plan.md` for current progress. The project is being built incrementally:

1. **Phase 1**: Infrastructure (Terraform, VPC, IAM) ✅
2. **Phase 2**: Application scaffold + Authentication system (in progress)
3. **Phase 3**: Challenges & Accounts
4. **Phase 4**: Rules Engine
5. **Phase 5**: Payouts & Admin
6. **Phase 6**: Polish & Launch

### Current State
- AWS account configured with IAM users/groups
- GitHub Actions CI/CD for Terraform
- Application scaffold complete (TypeScript, Prisma, Express, Docker)
- Local development environment ready (docker-compose)

## Coding Standards

### TypeScript

- Use strict mode (`"strict": true`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types on functions
- Avoid `any` - use `unknown` if type is truly unknown
- Use async/await over raw Promises

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase (`UserService`)
- **Functions/Variables**: camelCase (`getUserById`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRIES`)
- **Database Tables**: snake_case (`user_accounts`)
- **Terraform Resources**: kebab-case with project prefix (`dynasty-futures-vpc-prod`)

### API Design

- REST API with `/v1` prefix
- Use plural nouns for resources (`/users`, `/accounts`)
- HTTP methods: GET (read), POST (create), PATCH (update), DELETE (remove)
- Return appropriate status codes (200, 201, 400, 401, 403, 404, 500)
- Always return JSON with consistent error format

### Error Handling

```typescript
// Standard error response format
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {} // Optional additional context
  }
}
```

### Database

- Use Prisma for all database operations
- Never write raw SQL unless absolutely necessary
- Use transactions for multi-step operations
- Always include created_at/updated_at timestamps
- Use soft deletes (deleted_at) for user-facing data

## Security Guidelines

### Never Do

- Commit secrets, API keys, or credentials
- Log sensitive data (passwords, tokens, PII)
- Use `eval()` or dynamic code execution
- Trust user input without validation
- Expose internal error messages to clients

### Always Do

- Validate all input (use Zod or similar)
- Sanitize data before database operations
- Use parameterized queries (Prisma handles this)
- Hash passwords with bcrypt (cost factor 12)
- Use HTTPS for all external communication
- Store secrets in AWS Secrets Manager

## Terraform Guidelines

### Module Structure

Each module should have:
- `main.tf` - Resource definitions
- `variables.tf` - Input variables
- `outputs.tf` - Output values

### Naming Convention

```
{project}-{resource}-{environment}
dynasty-futures-vpc-prod
dynasty-futures-api-sg-prod
```

### Tags

All resources must have these tags:
```hcl
tags = {
  Project     = "DynastyFutures"
  Environment = "prod"
  ManagedBy   = "terraform"
}
```

### State Management

- Remote state in S3 with DynamoDB locking
- Never edit state files manually
- Use `terraform import` to bring existing resources under management

## Common Tasks

### Adding a New API Endpoint

1. Define route in `src/api/routes/`
2. Add validation schema
3. Implement service method in `src/services/`
4. Add repository method if database access needed
5. Write tests
6. Update API documentation

### Adding a New Terraform Module

1. Create directory in `terraform/modules/{name}/`
2. Add `main.tf`, `variables.tf`, `outputs.tf`
3. Reference module in `terraform/environments/prod/main.tf`
4. Run `terraform plan` to verify
5. Update `terraform/README.md`

### Database Schema Changes

1. Update `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name`
3. Test migration locally
4. Commit migration files
5. Migration runs automatically on deploy

## Environment Variables

Application expects these environment variables (stored in Secrets Manager in production):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `YOURPROPFIRM_API_KEY` | YourPropFirm API key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

## Testing Strategy

- **Unit Tests**: Jest for business logic
- **Integration Tests**: Supertest for API endpoints
- **E2E Tests**: (Future) Playwright for critical flows
- Run `npm test` before committing
- Minimum 80% coverage for new code

## Useful Commands

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run test             # Run tests
npm run lint             # Run ESLint
npm run format           # Run Prettier

# Database
npx prisma studio        # Open Prisma Studio
npx prisma migrate dev   # Run migrations
npx prisma generate      # Generate Prisma Client

# Terraform
terraform fmt -recursive # Format all files
terraform validate       # Validate configuration
terraform plan           # Preview changes
terraform apply          # Apply changes
```

## Getting Help

- Check `dynasty-futures-backend-plan.md` for implementation details
- Review `terraform/README.md` for infrastructure setup
- Original requirements are in `dynasty-futures-backend-prompt.md`

## Important Notes for AI Agents

1. **Read the plan first** - Always check `dynasty-futures-backend-plan.md` for current status
2. **Incremental changes** - This project is built step-by-step, don't try to implement everything at once
3. **Mark TODOs** - If something requires manual intervention (AWS console, secrets), mark with `TODO:`
4. **Security first** - This is a financial application; never compromise on security
5. **Test your code** - All new code should have tests
6. **Update documentation** - Keep README and plan files up to date