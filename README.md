# Dynasty Futures Backend

Backend system for Dynasty Futures, a proprietary futures trading firm offering funded accounts to traders.

## Overview

Dynasty Futures provides:
- **Evaluation/Challenge Programs** - Traders purchase challenges and must meet profit targets while adhering to risk rules
- **Funded Accounts** - Successful traders receive funded accounts and earn profit splits (70-90%)
- **Multiple Account Tiers** - $5K, $10K, $25K, $50K, $100K, $200K accounts

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript |
| Runtime | Node.js |
| Database | AWS Aurora PostgreSQL |
| ORM | Prisma |
| Cache | ElastiCache Redis |
| Compute | ECS Fargate + Lambda |
| Infrastructure | Terraform |
| CI/CD | GitHub Actions |
| Payments | Stripe |
| Trading Data | YourPropFirm API |

## Project Structure

```
DF-Backend/
├── .github/
│   └── workflows/           # CI/CD pipelines
│       ├── terraform.yml    # Infrastructure deployment
│       └── terraform-bootstrap.yml
├── prisma/                  # Database schema (TODO)
├── src/                     # Application code (TODO)
├── terraform/               # Infrastructure as Code
│   ├── environments/prod/   # Production config
│   ├── modules/             # Reusable modules
│   └── shared/              # State backend setup
├── docker/                  # Container configs (TODO)
├── AGENTS.md                # AI agent guidelines
├── dynasty-futures-backend-plan.md    # Implementation plan
└── dynasty-futures-backend-prompt.md  # Requirements doc
```

## Quick Start

### Prerequisites

- Node.js 18+
- AWS CLI configured
- Terraform 1.5+
- Docker (for local development)

### Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

### Infrastructure Deployment

See [terraform/README.md](terraform/README.md) for detailed setup instructions.

**Quick overview:**

1. **Bootstrap state backend** (one-time):
   ```bash
   cd terraform/shared/backend-setup
   terraform init && terraform apply
   ```

2. **Deploy infrastructure**:
   ```bash
   cd terraform/environments/prod
   terraform init
   terraform plan
   terraform apply
   ```

Or use GitHub Actions:
- Go to Actions → Terraform Bootstrap (run once)
- Go to Actions → Terraform → Run with "apply"

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CloudFront + WAF                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Application Load Balancer                      │
│                      (Public Subnet)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ECS Fargate Cluster                          │
│                     (Private Subnet)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  API Service │  │   Worker    │  │ Rules Engine│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
│                    (Database Subnet)                             │
│        ┌──────────────────┐    ┌──────────────────┐             │
│        │ Aurora PostgreSQL │    │  ElastiCache     │             │
│        │ (Writer + Reader) │    │  (Redis)         │             │
│        └──────────────────┘    └──────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Core Features

### User Management
- Email/password and Google OAuth authentication
- Multi-factor authentication (TOTP)
- KYC/Identity verification workflow
- Role-based access control (Trader, Support, Admin)

### Challenge & Account System
- Challenge purchase via Stripe
- Multiple account types with configurable rules:
  - Profit targets (e.g., 8% Phase 1, 5% Phase 2)
  - Maximum drawdown limits
  - Minimum trading days
  - Consistency rules
- Account status tracking (Evaluation → Funded → Payout)

### Trading Rules Engine
- Real-time rule validation from YourPropFirm data
- Daily loss limit monitoring
- Trailing and static drawdown calculations
- Automated account suspension on violations

### Payout System
- Payout request and approval workflow
- Stripe Connect integration
- Scheduled payouts (bi-weekly, on-demand)
- Tax documentation (1099 generation)

### Admin Portal
- User and account management
- Payout approval/rejection
- Rule violation review
- Revenue and analytics dashboard

## API Endpoints

### Authentication
```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/google
POST   /v1/auth/mfa/enable
POST   /v1/auth/mfa/verify
```

### Accounts & Challenges
```
GET    /v1/accounts
GET    /v1/accounts/:id
POST   /v1/challenges/purchase
GET    /v1/challenges/:id
```

### Payouts
```
GET    /v1/payouts
POST   /v1/payouts/request
```

### Admin
```
GET    /v1/admin/users
GET    /v1/admin/accounts
POST   /v1/admin/payouts/:id/approve
GET    /v1/admin/dashboard
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Aurora PostgreSQL connection string |
| `REDIS_URL` | ElastiCache Redis connection string |
| `JWT_SECRET` | Secret for JWT token signing |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `YOURPROPFIRM_API_KEY` | YourPropFirm API integration |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |

## Development

### Commands

```bash
npm run dev        # Start dev server with hot reload
npm run build      # Build for production
npm run start      # Start production server
npm run test       # Run tests
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Database

```bash
npx prisma studio       # Open database GUI
npx prisma migrate dev  # Create and run migrations
npx prisma generate     # Regenerate Prisma Client
npx prisma db seed      # Seed the database
```

### Terraform

```bash
terraform fmt -recursive  # Format all Terraform files
terraform validate        # Validate configuration
terraform plan            # Preview changes
terraform apply           # Apply changes
```

## Deployment

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `terraform-bootstrap.yml` | Manual | One-time setup of state backend |
| `terraform.yml` | PR/Push/Manual | Infrastructure deployment |
| `ci.yml` | PR | Lint, test, build (TODO) |
| `deploy-prod.yml` | Push to main | Application deployment (TODO) |

### Manual Deployment

1. Build the Docker image
2. Push to ECR
3. Update ECS service

```bash
# Build and push
docker build -t dynasty-api -f docker/Dockerfile.api .
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REPO
docker tag dynasty-api:latest $ECR_REPO:latest
docker push $ECR_REPO:latest

# Update ECS service
aws ecs update-service --cluster dynasty-futures-prod --service api --force-new-deployment
```

## Security

- All data encrypted at rest (Aurora, S3) and in transit (TLS 1.2+)
- Secrets stored in AWS Secrets Manager
- VPC with private subnets for compute and database
- WAF protection against OWASP Top 10
- Comprehensive audit logging (CloudTrail, application logs)
- PCI DSS compliance through Stripe

## Monitoring

- **Logs**: CloudWatch Logs
- **Metrics**: CloudWatch Metrics + custom dashboards
- **Tracing**: AWS X-Ray
- **Errors**: Sentry
- **Database**: Aurora Performance Insights

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| ECS Fargate | $80-120 |
| Aurora PostgreSQL | $350-450 |
| ElastiCache Redis | $90-120 |
| Load Balancer | $30-50 |
| NAT Gateway | $70-100 |
| Other (S3, Lambda, etc.) | $95-170 |
| **Total** | **$715-1,010** |

## Documentation

- [Implementation Plan](dynasty-futures-backend-plan.md) - Detailed roadmap with status
- [Requirements](dynasty-futures-backend-prompt.md) - Original requirements document
- [Terraform Guide](terraform/README.md) - Infrastructure setup
- [AI Agent Guidelines](AGENTS.md) - Guidelines for AI assistants

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run tests and linting
4. Create a Pull Request
5. Wait for review and CI checks

## License

Proprietary - All rights reserved

---

**Current Status**: Phase 1 - Infrastructure Setup

See [dynasty-futures-backend-plan.md](dynasty-futures-backend-plan.md) for detailed progress.
