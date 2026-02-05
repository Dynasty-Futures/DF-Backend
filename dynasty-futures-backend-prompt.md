# BACKEND PLANNING PROMPT FOR DYNASTY FUTURES

I'm designing a backend system for **Dynasty Futures**, a proprietary futures trading firm, and need help creating a comprehensive technical plan.

## Business Model Overview

Dynasty Futures is a prop trading firm that offers traders funded accounts to trade futures markets. We provide:

- **Evaluation/Challenge Programs**: Traders purchase challenges and must meet profit targets while adhering to risk rules
- **Funded Accounts**: Successful traders receive funded accounts and earn profit splits (typically 70-90%)
- **Account Types**: Multiple tiers (e.g., $5K, $10K, $25K, $50K, $100K, $200K accounts)

## Tech Stack Requirements

- **Backend**: TypeScript
- **ORM**: Prisma
- **Database**: AWS Aurora (PostgreSQL-compatible)
- **Infrastructure as Code**: Terraform
- **Cloud**: AWS (full infrastructure)
- **Payments**: Stripe (for challenge purchases, subscriptions, payouts)
- **Trading Data**: YourPropFirm API integration (for charts, performance metrics, trade data)
- **Frontend**: Currently on Vercel (plan to migrate to AWS later)

## Core System Requirements

### 1. User Management & Authentication

- User registration, login (email/password, OAuth)
- KYC/Identity verification workflow
- Role-based access (Trader, Admin, Support)
- Multi-factor authentication
- Account suspension/termination handling

### 2. Account & Challenge Management

- Challenge purchase flow (Stripe integration)
- Multiple account types with different rules:
  - Profit targets (e.g., 8% Phase 1, 5% Phase 2)
  - Maximum drawdown limits (e.g., 8% max, 4% daily)
  - Minimum trading days requirements
  - Consistency rules (e.g., no single day > 40% of profits)
  - Position sizing limits
  - Restricted trading times (news events, weekends)
- Account status tracking (Evaluation, Passed, Failed, Funded, Suspended)
- Reset/retry purchases
- Account scaling logic

### 3. Trading Rules Engine

- Real-time rule validation from YourPropFirm data
- Daily loss limit monitoring
- Maximum drawdown calculations (trailing vs static)
- Profit target tracking
- Minimum trading day counter
- News trading restrictions
- Weekend/overnight hold violations
- Automated account suspension on rule breach

### 4. Payout System

- Payout request submissions
- Payout approval workflow (admin review)
- Payout scheduling (bi-weekly, 5-day, on-demand based on account type)
- Stripe Connect or direct bank transfer integration
- Payout history and tracking
- Tax documentation (1099 generation for US traders)

### 5. Data & Analytics

- Integration with YourPropFirm API for:
  - Real-time trade data
  - P&L calculations
  - Performance charts and metrics
  - Trading statistics
- Dashboard metrics (trader performance, active accounts, revenue)
- Audit logging for compliance
- Trade history storage

### 6. Admin Portal

- User management (view/edit/suspend accounts)
- Challenge and funded account oversight
- Payout approval/rejection
- Rule violation review
- Revenue and analytics dashboard
- Support ticket system

## Non-Functional Requirements

### Security

- SOC 2 compliance considerations
- PCI DSS compliance (Stripe handles most, but need secure handling)
- Encryption at rest and in transit
- Audit logging for all financial transactions
- IP address tracking/restriction
- Rate limiting and DDoS protection
- Secrets management (API keys, database credentials)

### Scalability

- Support for 10,000+ concurrent users
- Handle 100,000+ challenge accounts
- Process real-time trade data feeds
- Scale during high-traffic periods (promotional launches)

### Performance

- < 200ms API response times for dashboard
- Real-time rule monitoring (< 5 second latency)
- Fast payout processing
- Efficient database queries for reporting
- Aurora's high-performance capabilities for complex queries and high throughput

### Reliability

- 99.9% uptime SLA
- Automated backups (Aurora automated backups)
- Disaster recovery plan
- Aurora multi-AZ deployment for high availability

## What I Need Help Planning

### 1. Database Schema Design (Aurora PostgreSQL)

- Tables for users, accounts, challenges, payouts, trades, audit logs
- Relationships and foreign keys
- Indexing strategy optimized for Aurora
- Data retention policies
- Aurora-specific optimizations (read replicas, clustering)
- Prisma schema design and migration strategy

### 2. AWS Architecture

- **Compute**: ECS/Fargate vs Lambda vs EC2 (recommendation needed)
- **Database**: Aurora PostgreSQL cluster configuration
  - Writer and reader instances
  - Auto-scaling policies
  - Backup retention
- **Caching**: ElastiCache Redis for session management and frequently accessed data
- **File Storage**: S3 (for documents, KYC, reports, tax forms)
- **Networking**: VPC design, subnets (public/private), security groups, NACLs
- **CDN**: CloudFront (for future AWS frontend migration)
- **Load Balancing**: ALB/NLB configuration

### 3. Terraform Infrastructure

- **Production Environment Only** (for now)
- Terraform module structure and organization
- State management (S3 backend with DynamoDB locking)
- Resource naming conventions
- Terraform workspace strategy for future environments
- Variables and secrets management
- How to structure for easy addition of staging/dev later

### 4. API Design

- REST vs GraphQL (recommendation needed)
- API Gateway setup with Terraform
- Rate limiting strategy
- Webhook handling (Stripe, YourPropFirm)
- WebSocket for real-time updates (account status, rule violations)
- API versioning strategy

### 5. Security Architecture

- IAM roles and policies (principle of least privilege)
- AWS Secrets Manager for API keys, database credentials
- KMS for encryption keys
- WAF configuration with Terraform
- VPC security (security groups, NACLs)
- Compliance and audit logging (CloudTrail, CloudWatch)
- DDoS protection (AWS Shield)

### 6. Deployment & CI/CD

- **Infrastructure as Code**: Terraform-based deployment
- CI/CD pipeline (GitHub Actions recommended)
- Database migration strategy with Prisma
- Docker containerization strategy
- Deployment workflow (build → test → deploy)
- Rollback strategy
- Zero-downtime deployment approach

### 7. Monitoring & Observability

- CloudWatch for logs, metrics, and alarms
- Aurora Performance Insights
- Error tracking (Sentry or similar)
- APM (Application Performance Monitoring)
- Alerting strategy (critical alerts for rule engine failures, payout issues)
- Cost monitoring and optimization
- Dashboard for system health

## Integration Requirements

- **YourPropFirm API**: Real-time trading data, account metrics, webhooks
- **Stripe**: Payment processing, subscriptions, Stripe Connect for payouts, webhooks
- **Email**: AWS SES for transactional emails (verification, notifications, payout confirmations)
- **SMS**: (Optional) SNS for 2FA

## Deployment Constraints

- **Environment**: Production only initially
- **Budget**: Startup phase, cost-conscious but prioritizing performance and reliability
- **Timeline**: MVP in 3-4 months, iterative releases
- **Team**: 2 backend developers, 1 frontend developer (all mid-level, learning AWS/Terraform)
- **Compliance**: Must handle financial data securely, maintain comprehensive audit trails

## Success Criteria

- Traders can purchase challenges and receive account access within minutes
- Real-time rule violations are detected and enforced automatically
- Payouts are processed reliably and on schedule
- Aurora database handles complex queries efficiently (< 200ms for dashboard)
- System handles traffic spikes during promotions without degradation
- Admin team can efficiently manage accounts and support requests
- Infrastructure is fully defined in Terraform and reproducible
- Clear separation of concerns for future scaling to dev/staging environments

---

## Please Create a Comprehensive Plan Covering:

1. **Database schema design** optimized for Aurora PostgreSQL with Prisma
2. **AWS service selection and configuration** for compute, networking, and supporting services
3. **Terraform infrastructure code structure** for production environment
4. **System architecture diagram** showing how components interact
5. **Deployment strategy** with CI/CD pipeline recommendations
6. **Security best practices** specific to financial/trading applications
7. **Monitoring and alerting setup**
8. **Estimated AWS cost breakdown** for initial production environment

