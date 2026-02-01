# Terraform State Backend Bootstrap

This directory contains the Terraform configuration to create the S3 bucket and DynamoDB table required for remote state storage.

## Prerequisites

Before running this configuration, you must complete the following manual steps:

### TODO 1: Create AWS Account

1. Go to [AWS Console](https://aws.amazon.com/) and create a new account
2. Enable MFA on the root account
3. Set up a billing alarm to avoid unexpected charges

### TODO 2: Create IAM User for Terraform

1. Go to IAM in AWS Console
2. Create a new IAM user named `terraform-admin`
3. Attach the following policies:
   - For initial setup: `AdministratorAccess` (can be scoped down later)
4. Create access keys for programmatic access
5. Save the Access Key ID and Secret Access Key securely

### TODO 3: Configure AWS CLI

Install AWS CLI and configure it with your credentials:

```bash
# Install AWS CLI (if not already installed)
# Windows: Download from https://aws.amazon.com/cli/
# macOS: brew install awscli
# Linux: sudo apt install awscli

# Configure credentials
aws configure
# Enter your Access Key ID
# Enter your Secret Access Key
# Enter your default region (e.g., us-east-1)
# Enter default output format (json)
```

### TODO 4: Verify AWS Access

```bash
aws sts get-caller-identity
```

This should return your AWS account ID and user ARN.

## Running the Bootstrap

Once prerequisites are complete:

```bash
cd terraform/shared/backend-setup

# Initialize Terraform
terraform init

# Preview the changes
terraform plan

# Apply the configuration
terraform apply
```

## After Bootstrap

After successfully running this configuration, you'll see output similar to:

```
s3_bucket_name = "dynasty-futures-terraform-state"
dynamodb_table_name = "dynasty-futures-terraform-locks"
backend_config = "..."
```

The `backend_config` output shows exactly what to put in other Terraform configurations' `backend.tf` files.

## Important Notes

- This configuration uses **local state** intentionally (chicken-and-egg problem)
- The S3 bucket has `prevent_destroy = true` to prevent accidental deletion
- Keep the local `terraform.tfstate` file in this directory safe - it's the only record of these resources
- Consider committing `terraform.tfstate` for this bootstrap config only (it contains no secrets)

## GitHub Actions Setup

After bootstrapping, configure GitHub Actions:

### TODO 5: Add GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

| Secret Name | Description |
|-------------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key ID |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret access key |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |

## Troubleshooting

### "Access Denied" errors

- Verify your AWS credentials are configured correctly
- Check that the IAM user has sufficient permissions
- Ensure you're in the correct AWS region

### "Bucket already exists" error

S3 bucket names are globally unique. If the bucket name is taken:
1. Edit `main.tf` and change the bucket name
2. Run `terraform apply` again

### State file issues

If you lose the local state file:
1. Import the existing resources:
   ```bash
   terraform import aws_s3_bucket.terraform_state dynasty-futures-terraform-state
   terraform import aws_dynamodb_table.terraform_locks dynasty-futures-terraform-locks
   ```
