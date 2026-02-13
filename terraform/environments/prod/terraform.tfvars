# =============================================================================
# Production Environment Variables
# =============================================================================
# This file contains the values for production environment.
#
# IMPORTANT: Do NOT commit sensitive values here. Use:
# - AWS Secrets Manager for database passwords, API keys
# - Environment variables for CI/CD
# - terraform.tfvars.local for local overrides (gitignored)
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

aws_region   = "us-east-1"
project_name = "dynasty-futures"
environment  = "prod"

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]

public_subnet_cidrs   = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs  = ["10.0.10.0/24", "10.0.11.0/24"]
database_subnet_cidrs = ["10.0.20.0/24", "10.0.21.0/24"]

# -----------------------------------------------------------------------------
# Database (Aurora PostgreSQL Serverless v2)
# -----------------------------------------------------------------------------
# Serverless v2 auto-scales between min and max ACU.
# 1 ACU = ~2 GB RAM. Cost is ~$0.12/ACU-hour in us-east-1.
#
# At 0.5 ACU min, idle cost is ~$43/month.
# At 4 ACU max, the cluster can handle significant load.
# Adjust max_capacity up if you see throttling in Performance Insights.

aurora_engine_version        = "16.4"
aurora_database_name         = "dynasty_futures"
aurora_min_capacity          = 0.5 # ~$43/month at idle
aurora_max_capacity          = 4   # Scales up under load
aurora_backup_retention_days = 7
aurora_skip_final_snapshot   = false
aurora_deletion_protection   = true

# -----------------------------------------------------------------------------
# Cache (ElastiCache Redis) - Skipped for now
# -----------------------------------------------------------------------------

# redis_node_type       = "cache.r6g.medium"
# redis_num_cache_nodes = 1

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------

ecs_api_cpu           = 512  # 0.5 vCPU
ecs_api_memory        = 1024 # 1 GB
ecs_api_desired_count = 2    # 2 tasks for high availability

cors_origin = "http://localhost:8080,http://localhost:3001,http://localhost:5173,https://www.dynastyfuturesdyn.com,https://dynastyfuturesdyn.com"

# -----------------------------------------------------------------------------
# Domain & HTTPS
# -----------------------------------------------------------------------------
# Step 1: Set domain_name and apply → creates ACM cert, outputs DNS validation records
# Step 2: Add the CNAME validation record in Vercel DNS
# Step 3: Wait for cert to be ISSUED (check in AWS Console > ACM)
# Step 4: Set enable_https = true and apply → ALB switches to HTTPS

domain_name  = "api.dynastyfuturesdyn.com"
enable_https = false # Set to true AFTER ACM certificate is validated

# -----------------------------------------------------------------------------
# Additional Tags
# -----------------------------------------------------------------------------

additional_tags = {
  CostCenter = "trading-platform"
  Team       = "backend"
}

# -----------------------------------------------------------------------------
# IAM Users
# -----------------------------------------------------------------------------

iam_users = [
  {
    username       = "BrockAdams"
    email          = "brockadams@dynastyfuturesdyn.com"
    group          = "admin"
    console_access = true
  },
  {
    username       = "ZacharyPerez"
    email          = "zacharyperez@dynastyfuturesdyn.com"
    group          = "admin"
    console_access = true
  },
  {
    username       = "JustinPerez"
    email          = "justinprz12@gmail.com"
    group          = "admin"
    console_access = true
  },
  {
    username       = "WilliamKelly"
    email          = "treypkelly@gmail.com"
    group          = "admin"
    console_access = true
  },
]

create_terraform_user = true
