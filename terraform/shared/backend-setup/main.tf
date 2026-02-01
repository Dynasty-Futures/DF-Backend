# =============================================================================
# Terraform State Backend Bootstrap
# =============================================================================
# This configuration creates the S3 bucket and DynamoDB table required for
# storing Terraform state remotely. This must be run BEFORE any other
# Terraform configurations.
#
# TODO: Before running this:
# 1. Create an AWS account
# 2. Create an IAM user with AdministratorAccess (or scoped permissions)
# 3. Configure AWS CLI with: aws configure
# 4. Run: terraform init && terraform apply
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # NOTE: This backend-setup uses LOCAL state intentionally.
  # After creating the S3 bucket, all other configurations will use remote state.
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region for the state backend"
  type        = string
  default     = "us-east-1"

  # TODO: Change this to your preferred region
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "dynasty-futures"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "shared"
}

# -----------------------------------------------------------------------------
# Provider Configuration
# -----------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "DynastyFutures"
      Environment = var.environment
      ManagedBy   = "terraform"
      Purpose     = "terraform-state"
    }
  }
}

# -----------------------------------------------------------------------------
# S3 Bucket for Terraform State
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "terraform_state" {
  bucket = "${var.project_name}-terraform-state"

  # Prevent accidental deletion of this S3 bucket
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# DynamoDB Table for State Locking
# -----------------------------------------------------------------------------

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "${var.project_name}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-terraform-locks"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "s3_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.arn
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "backend_config" {
  description = "Backend configuration to use in other Terraform configs"
  value       = <<-EOT
    # Add this to your backend.tf files:
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.terraform_state.id}"
        key            = "ENV_NAME/terraform.tfstate"  # Replace ENV_NAME with: prod, staging, etc.
        region         = "${var.aws_region}"
        dynamodb_table = "${aws_dynamodb_table.terraform_locks.name}"
        encrypt        = true
      }
    }
  EOT
}
