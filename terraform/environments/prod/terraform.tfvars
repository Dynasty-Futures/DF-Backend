# =============================================================================
# Production Environment Variables
# =============================================================================
# This file contains the values for production environment.
#
# TODO: Review and update these values before deployment
#
# IMPORTANT: Do NOT commit sensitive values here. Use:
# - AWS Secrets Manager for database passwords, API keys
# - Environment variables for CI/CD
# - terraform.tfvars.local for local overrides (gitignored)
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

aws_region   = "us-east-1" # TODO: Change if needed
project_name = "dynasty-futures"
environment  = "prod"

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"] # TODO: Update for your region

public_subnet_cidrs   = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs  = ["10.0.10.0/24", "10.0.11.0/24"]
database_subnet_cidrs = ["10.0.20.0/24", "10.0.21.0/24"]

# -----------------------------------------------------------------------------
# Database (Aurora PostgreSQL)
# -----------------------------------------------------------------------------

aurora_instance_class_writer = "db.r6g.large"  # 2 vCPU, 16 GB RAM - $350+/month
aurora_instance_class_reader = "db.r6g.medium" # 1 vCPU, 8 GB RAM - $175+/month
aurora_database_name         = "dynasty_futures"
aurora_backup_retention_days = 7

# -----------------------------------------------------------------------------
# Cache (ElastiCache Redis)
# -----------------------------------------------------------------------------

redis_node_type       = "cache.r6g.medium" # ~$90/month
redis_num_cache_nodes = 1

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------

ecs_api_cpu           = 512  # 0.5 vCPU
ecs_api_memory        = 1024 # 1 GB
ecs_api_desired_count = 2    # 2 tasks for high availability

# -----------------------------------------------------------------------------
# Domain
# -----------------------------------------------------------------------------

domain_name = "" # TODO: Set when you have a domain (e.g., "api.dynastyfutures.com")

# -----------------------------------------------------------------------------
# Additional Tags
# -----------------------------------------------------------------------------

additional_tags = {
  CostCenter = "trading-platform"
  Team       = "backend"
}
