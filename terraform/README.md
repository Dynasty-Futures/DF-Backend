# Dynasty Futures - Terraform Infrastructure

This directory contains all Terraform configurations for the Dynasty Futures backend infrastructure.

> **First time?** See the complete **[AWS Getting Started Guide](../docs/AWS-GETTING-STARTED.md)** for step-by-step instructions.

## Directory Structure

```
terraform/
├── environments/
│   └── prod/                 # Production environment
│       ├── main.tf           # Main configuration (composes modules)
│       ├── variables.tf      # Variable definitions
│       ├── outputs.tf        # Output definitions
│       ├── terraform.tfvars  # Variable values
│       └── backend.tf        # Remote state configuration
├── modules/
│   ├── iam/                  # IAM users, groups, policies
│   ├── networking/           # VPC, subnets, security groups
│   ├── aurora/               # Aurora PostgreSQL (TODO)
│   ├── redis/                # ElastiCache Redis (TODO)
│   ├── ecs/                  # ECS Fargate cluster (TODO)
│   ├── alb/                  # Application Load Balancer (TODO)
│   ├── lambda/               # Lambda functions (TODO)
│   ├── s3/                   # S3 buckets (TODO)
│   ├── secrets/              # Secrets Manager (TODO)
│   ├── waf/                  # Web Application Firewall (TODO)
│   └── monitoring/           # CloudWatch, alarms (TODO)
└── shared/
    └── backend-setup/        # S3 + DynamoDB for Terraform state
```

## Quick Start

### Prerequisites

- [Terraform](https://www.terraform.io/downloads) >= 1.5.0
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- An AWS account with appropriate permissions

### Initial Setup Checklist

> **Detailed Guide**: See [AWS Getting Started Guide](../docs/AWS-GETTING-STARTED.md) for comprehensive instructions.

Complete these steps in order:

- [ ] **Step 1**: Secure AWS Account
  - Sign up at https://aws.amazon.com/
  - Enable MFA on root account
  - Set up billing alerts

- [ ] **Step 2**: Create Bootstrap IAM User (Manual)
  - Create user named `terraform-bootstrap` in IAM console
  - Attach `AdministratorAccess` policy
  - Create and save access keys

- [ ] **Step 3**: Configure AWS CLI
  ```bash
  aws configure
  # Enter Access Key ID, Secret Access Key, region (us-east-1), output format (json)
  ```

- [ ] **Step 4**: Bootstrap Terraform State
  ```bash
  cd terraform/shared/backend-setup
  terraform init
  terraform apply
  ```

- [ ] **Step 5**: Configure Team Members
  Edit `terraform/environments/prod/terraform.tfvars` and add your team to `iam_users`

- [ ] **Step 6**: Deploy Infrastructure + IAM
  ```bash
  cd terraform/environments/prod
  terraform init
  terraform plan
  terraform apply
  ```

- [ ] **Step 7**: Get Credentials
  ```bash
  # Console sign-in URL for team members
  terraform output console_signin_url
  
  # Initial passwords for users
  terraform output -json user_initial_passwords
  
  # Terraform service account for GitHub Actions
  terraform output terraform_access_key_id
  terraform output terraform_secret_access_key
  ```

- [ ] **Step 8**: Add GitHub Secrets
  Go to: Repository → Settings → Secrets and variables → Actions
  
  | Secret Name | Value |
  |-------------|-------|
  | `AWS_ACCESS_KEY_ID` | Output from `terraform output terraform_access_key_id` |
  | `AWS_SECRET_ACCESS_KEY` | Output from `terraform output terraform_secret_access_key` |

- [ ] **Step 9**: Create GitHub Environment
  Go to: Repository → Settings → Environments
  
  Create `production` environment with:
  - Required reviewers (yourself or team members)
  - Deployment branch: `main` only

- [ ] **Step 10**: Onboard Team Members
  - Send console URL and initial passwords
  - Users must change password on first login
  - Users should enable MFA immediately

## GitHub Actions Workflows

### Terraform Bootstrap (`terraform-bootstrap.yml`)

One-time workflow to create the S3 bucket and DynamoDB table for Terraform state.

**Trigger**: Manual only (workflow_dispatch)

### Terraform (`terraform.yml`)

Main workflow for infrastructure changes.

**Triggers**:
- On PR: Runs format, validate, plan (posts plan to PR)
- On push to main: Runs plan
- Manual: Can run plan, apply, or destroy

**Jobs**:
1. `terraform-fmt` - Checks code formatting
2. `terraform-validate` - Validates configuration
3. `terraform-plan` - Creates execution plan
4. `terraform-apply` - Applies changes (manual trigger only)
5. `terraform-destroy` - Destroys infrastructure (manual trigger only)

## Local Development

### Format Code

```bash
terraform fmt -recursive
```

### Validate Configuration

```bash
cd terraform/environments/prod
terraform init -backend=false
terraform validate
```

### Plan Changes

```bash
cd terraform/environments/prod
terraform init
terraform plan
```

### Apply Changes

```bash
cd terraform/environments/prod
terraform apply
```

## Module Usage

Modules are enabled/disabled in `environments/prod/main.tf`. To enable a module:

1. Uncomment the module block
2. Run `terraform plan` to see changes
3. Run `terraform apply` to create resources

Example:

```hcl
# Uncomment to enable Aurora
module "aurora" {
  source = "../../modules/aurora"
  # ... configuration
}
```

## Cost Considerations

Estimated monthly costs (us-east-1):

| Resource | Configuration | Est. Cost |
|----------|--------------|-----------|
| NAT Gateway | 2x (one per AZ) | $70-100 |
| VPC Flow Logs | 30 day retention | $5-10 |
| **Networking Total** | | **$75-110** |

Full infrastructure costs are documented in `dynasty-futures-backend-plan.md`.

## Security Notes

- All resources are tagged for cost tracking and compliance
- VPC Flow Logs are enabled for network monitoring
- Security groups follow principle of least privilege
- Database subnets have no direct internet access
- Sensitive values should be stored in AWS Secrets Manager

## Troubleshooting

### "Access Denied" errors

1. Verify AWS credentials: `aws sts get-caller-identity`
2. Check IAM permissions
3. Ensure you're in the correct region

### State lock errors

If Terraform state is locked:
```bash
terraform force-unlock LOCK_ID
```

### Backend initialization errors

If the S3 bucket doesn't exist yet:
1. Run the bootstrap first: `cd shared/backend-setup && terraform apply`
2. Then initialize the environment: `cd environments/prod && terraform init`
