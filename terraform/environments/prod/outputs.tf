# =============================================================================
# Outputs - Production Environment
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

output "aws_account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS Region"
  value       = data.aws_region.current.name
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.networking.private_subnet_ids
}

output "database_subnet_ids" {
  description = "IDs of the database subnets"
  value       = module.networking.database_subnet_ids
}

# -----------------------------------------------------------------------------
# Aurora
# -----------------------------------------------------------------------------

output "aurora_cluster_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = module.aurora.cluster_endpoint
  sensitive   = true
}

output "aurora_reader_endpoint" {
  description = "Aurora cluster reader endpoint"
  value       = module.aurora.cluster_reader_endpoint
  sensitive   = true
}

output "aurora_database_name" {
  description = "Aurora database name"
  value       = module.aurora.database_name
}

# -----------------------------------------------------------------------------
# ALB (Uncomment when ALB module is enabled)
# -----------------------------------------------------------------------------

# output "alb_dns_name" {
#   description = "DNS name of the Application Load Balancer (use this to access the API)"
#   value       = module.alb.alb_dns_name
# }

# -----------------------------------------------------------------------------
# ECS (Uncomment when ECS module is enabled)
# -----------------------------------------------------------------------------

# output "ecs_cluster_name" {
#   description = "Name of the ECS cluster"
#   value       = module.ecs.cluster_name
# }

# output "ecs_service_name" {
#   description = "Name of the ECS API service"
#   value       = module.ecs.service_name
# }

# output "ecr_repository_url" {
#   description = "URL of the ECR repository (for docker push)"
#   value       = module.ecs.ecr_repository_url
# }

# output "ecs_task_definition" {
#   description = "ECS task definition family"
#   value       = module.ecs.task_definition_family
# }

# -----------------------------------------------------------------------------
# IAM
# -----------------------------------------------------------------------------

output "console_signin_url" {
  description = "AWS Console sign-in URL for IAM users"
  value       = module.iam.console_signin_url
}

output "iam_groups" {
  description = "IAM group names"
  value = {
    admin     = module.iam.admin_group_name
    developer = module.iam.developer_group_name
    readonly  = module.iam.readonly_group_name
  }
}

output "iam_user_arns" {
  description = "Map of IAM username to ARN"
  value       = module.iam.user_arns
}

output "user_initial_passwords" {
  description = "Initial passwords for IAM users (must change on first login)"
  value       = module.iam.user_initial_passwords
  sensitive   = true
}

output "terraform_user_name" {
  description = "Name of the Terraform service account"
  value       = module.iam.terraform_user_name
}

output "terraform_access_key_id" {
  description = "Access key ID for Terraform service account (for GitHub Actions)"
  value       = module.iam.terraform_access_key_id
  sensitive   = true
}

output "terraform_secret_access_key" {
  description = "Secret access key for Terraform service account (STORE SECURELY!)"
  value       = module.iam.terraform_secret_access_key
  sensitive   = true
}
