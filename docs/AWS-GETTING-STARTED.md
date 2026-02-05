# AWS Getting Started Guide - Dynasty Futures

This guide walks you through setting up your AWS account from scratch, including IAM users, and running your first Terraform deployment.

## Overview

The setup process involves these steps:

1. **Secure root account** - Enable MFA, set up billing alerts
2. **Create bootstrap IAM user** - Manual user for initial Terraform run
3. **Bootstrap Terraform state** - Create S3 bucket and DynamoDB table
4. **Deploy IAM infrastructure** - Create managed users and groups via Terraform
5. **Configure GitHub Actions** - Set up CI/CD with Terraform-managed credentials
6. **Clean up bootstrap user** - Remove manual user (optional)

---

## Step 1: Secure Your AWS Root Account

The root account has unlimited access. Secure it immediately.

### 1.1 Enable MFA on Root Account

1. Sign in to AWS Console as root user
2. Go to **IAM** → **Security credentials** (top-right, click your account name)
3. Under **Multi-factor authentication (MFA)**, click **Assign MFA device**
4. Choose **Authenticator app** and follow the prompts
5. Use Google Authenticator, Authy, or 1Password to scan the QR code

### 1.2 Set Up Billing Alerts

1. Go to **Billing and Cost Management** → **Budgets**
2. Click **Create budget**
3. Choose **Cost budget - Recommended**
4. Set monthly budget (e.g., $100 to start)
5. Add email alert at 80% and 100% thresholds

### 1.3 Enable IAM Access to Billing

1. Go to **Account** settings (top-right, click account name → Account)
2. Scroll to **IAM user and role access to Billing information**
3. Click **Edit** and enable **Activate IAM Access**

---

## Step 2: Create Bootstrap IAM User (Manual)

You need an IAM user to run Terraform initially. This user creates the proper IAM structure.

### 2.1 Create the User

1. Go to **IAM** → **Users** → **Create user**
2. User name: `terraform-bootstrap`
3. Check **Provide user access to the AWS Management Console**
4. Select **I want to create an IAM user**
5. Choose **Custom password** and set a strong password
6. Uncheck **Users must create a new password at next sign-in** (for now)
7. Click **Next**

### 2.2 Attach Permissions

1. Select **Attach policies directly**
2. Search for and check `AdministratorAccess`
3. Click **Next** → **Create user**

### 2.3 Create Access Keys

1. Click on the user `terraform-bootstrap`
2. Go to **Security credentials** tab
3. Under **Access keys**, click **Create access key**
4. Select **Command Line Interface (CLI)**
5. Check the acknowledgment and click **Next**
6. Click **Create access key**
7. **IMPORTANT**: Download the CSV or copy both keys. You won't see the secret again!

```
Access Key ID:     AKIA...
Secret Access Key: ...
```

### 2.4 Configure AWS CLI

Install AWS CLI if you haven't already:
- **Windows**: Download from https://aws.amazon.com/cli/
- **macOS**: `brew install awscli`
- **Linux**: `sudo apt install awscli` or `pip install awscli`

Configure your credentials:

```powershell
aws configure
```

Enter:
- AWS Access Key ID: `[your access key]`
- AWS Secret Access Key: `[your secret key]`
- Default region name: `us-east-1`
- Default output format: `json`

Verify it works:

```powershell
aws sts get-caller-identity
```

You should see your account ID and user ARN.

---

## Step 3: Bootstrap Terraform State Backend

The Terraform state needs to be stored remotely for team collaboration.

### 3.1 Run Bootstrap Locally

```powershell
cd terraform/shared/backend-setup

# Initialize Terraform
terraform init

# Preview what will be created
terraform plan

# Create the S3 bucket and DynamoDB table
terraform apply
```

Type `yes` when prompted.

### 3.2 Save the Outputs

After successful apply, you'll see:

```
s3_bucket_name = "dynasty-futures-terraform-state"
dynamodb_table_name = "dynasty-futures-terraform-locks"
```

Keep the `terraform.tfstate` file in this directory safe - it's the only record of these resources.

---

## Step 4: Add Your Team Members

Before deploying, configure which IAM users to create.

### 4.1 Edit terraform.tfvars

Open `terraform/environments/prod/terraform.tfvars` and update the `iam_users` section:

```hcl
iam_users = [
  {
    username       = "justin"
    email          = "justin@dynastyfutures.com"
    group          = "admin"
    console_access = true
  },
  {
    username       = "developer1"
    email          = "dev1@dynastyfutures.com"
    group          = "developer"
    console_access = true
  },
  {
    username       = "viewer1"
    email          = "viewer1@dynastyfutures.com"
    group          = "readonly"
    console_access = true
  },
]

create_terraform_user = true
```

### Group Permissions

| Group | Access Level | Use Case |
|-------|-------------|----------|
| `admin` | AdministratorAccess | Infrastructure management, full access |
| `developer` | PowerUserAccess | Application deployment, no IAM changes |
| `readonly` | ReadOnlyAccess | Viewing resources, dashboards |

---

## Step 5: Deploy Infrastructure (Including IAM)

### 5.1 Initialize and Plan

```powershell
cd terraform/environments/prod

# Initialize with remote backend
terraform init

# Preview all changes
terraform plan
```

Review the plan carefully. It will create:
- IAM groups (admin, developer, readonly)
- IAM users (as configured in tfvars)
- IAM policies (self-management, password policy)
- Terraform service account (for GitHub Actions)
- VPC and networking resources

### 5.2 Apply Changes

```powershell
terraform apply
```

Type `yes` when prompted.

### 5.3 Get User Credentials

After apply completes, get the initial passwords and credentials:

```powershell
# Get the console sign-in URL
terraform output console_signin_url

# Get initial passwords (sensitive)
terraform output -json user_initial_passwords

# Get Terraform service account credentials (for GitHub Actions)
terraform output terraform_access_key_id
terraform output terraform_secret_access_key
```

**IMPORTANT**: 
- Initial passwords must be changed on first login
- Store the Terraform credentials securely for GitHub Actions
- All users should enable MFA immediately

---

## Step 6: Configure GitHub Actions

Now use the Terraform-managed service account for CI/CD.

### 6.1 Add Repository Secrets

Go to: **GitHub Repository** → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `AWS_ACCESS_KEY_ID` | Output from `terraform output terraform_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | Output from `terraform output terraform_secret_access_key` |

### 6.2 Create Production Environment

Go to: **Settings** → **Environments** → **New environment**

1. Name: `production`
2. Add required reviewers (your admin users)
3. Restrict to `main` branch only

### 6.3 Test the Pipeline

Create a small change and push to a branch:

```powershell
git checkout -b test-terraform
# Make a minor change (e.g., add a comment)
git add -A
git commit -m "test: verify terraform pipeline"
git push -u origin test-terraform
```

Open a PR and verify the Terraform plan runs successfully.

---

## Step 7: Onboard Team Members

Send each team member their credentials:

### Email Template

```
Subject: Dynasty Futures AWS Access

Hi [Name],

Your AWS account has been created:

Console URL: [output from terraform output console_signin_url]
Username: [their username]
Initial Password: [from terraform output -json user_initial_passwords]

On your first login:
1. Change your password (required)
2. Enable MFA immediately (Security credentials → MFA)
3. Review your permissions

You're in the [admin/developer/readonly] group.

Let me know if you have questions!
```

---

## Step 8: Clean Up Bootstrap User (Optional)

Once everything is working with the Terraform-managed service account, you can delete the manual bootstrap user.

1. Go to **IAM** → **Users**
2. Select `terraform-bootstrap`
3. Click **Delete**
4. Confirm by typing the username

Keep at least one admin user with console access as a backup.

---

## Daily Operations

### Adding New Users

1. Add user to `terraform.tfvars`:
   ```hcl
   iam_users = [
     # ... existing users ...
     {
       username       = "newuser"
       email          = "newuser@dynastyfutures.com"
       group          = "developer"
       console_access = true
     },
   ]
   ```
2. Run `terraform apply`
3. Get their password: `terraform output -json user_initial_passwords`
4. Send them the onboarding email

### Removing Users

1. Remove from `terraform.tfvars`
2. Run `terraform apply`

### Changing User Groups

1. Update the `group` field in `terraform.tfvars`
2. Run `terraform apply`

---

## Security Best Practices

### For All Users

- [ ] Enable MFA immediately after first login
- [ ] Use strong, unique passwords
- [ ] Never share credentials
- [ ] Rotate access keys every 90 days (if using programmatic access)

### For Admins

- [ ] Review IAM access quarterly
- [ ] Remove unused users promptly
- [ ] Use CloudTrail to monitor activity
- [ ] Set up alerts for root account usage

### For Service Accounts

- [ ] Use IAM roles where possible (instead of long-term credentials)
- [ ] Scope permissions to minimum required
- [ ] Rotate credentials when team members leave

---

## Troubleshooting

### "Access Denied" on Terraform Apply

1. Verify credentials: `aws sts get-caller-identity`
2. Check IAM permissions in console
3. Ensure correct region: `aws configure get region`

### "Bucket already exists" on Bootstrap

S3 bucket names are globally unique. Edit `terraform/shared/backend-setup/main.tf` to change the bucket name:

```hcl
resource "aws_s3_bucket" "terraform_state" {
  bucket = "dynasty-futures-terraform-state-unique123"
  # ...
}
```

### Can't Get Sensitive Outputs

Use `-json` flag:
```powershell
terraform output -json user_initial_passwords
terraform output -raw terraform_secret_access_key
```

### MFA Issues

If a user is locked out:
1. Admin goes to **IAM** → **Users** → Select user
2. **Security credentials** → **MFA device** → **Remove**
3. User can re-enable MFA after signing in

---

## Next Steps

After completing this setup:

1. **Deploy networking** - VPC is already enabled in main.tf
2. **Enable Aurora** - Uncomment in main.tf, configure variables
3. **Enable Redis** - Uncomment in main.tf
4. **Set up application** - ECS, ALB, etc.

See `dynasty-futures-backend-plan.md` for the full implementation roadmap.
