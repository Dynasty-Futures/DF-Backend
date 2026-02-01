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
# Aurora (Uncomment when module is enabled)
# -----------------------------------------------------------------------------

# output "aurora_cluster_endpoint" {
#   description = "Aurora cluster writer endpoint"
#   value       = module.aurora.cluster_endpoint
#   sensitive   = true
# }

# output "aurora_reader_endpoint" {
#   description = "Aurora cluster reader endpoint"
#   value       = module.aurora.reader_endpoint
#   sensitive   = true
# }

# -----------------------------------------------------------------------------
# Redis (Uncomment when module is enabled)
# -----------------------------------------------------------------------------

# output "redis_endpoint" {
#   description = "Redis primary endpoint"
#   value       = module.redis.primary_endpoint
#   sensitive   = true
# }

# -----------------------------------------------------------------------------
# ALB (Uncomment when module is enabled)
# -----------------------------------------------------------------------------

# output "alb_dns_name" {
#   description = "DNS name of the Application Load Balancer"
#   value       = module.alb.dns_name
# }

# -----------------------------------------------------------------------------
# ECS (Uncomment when module is enabled)
# -----------------------------------------------------------------------------

# output "ecs_cluster_name" {
#   description = "Name of the ECS cluster"
#   value       = module.ecs.cluster_name
# }

# output "ecs_service_name" {
#   description = "Name of the ECS API service"
#   value       = module.ecs.api_service_name
# }
