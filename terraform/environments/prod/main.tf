# =============================================================================
# Dynasty Futures - Production Environment
# =============================================================================
# This is the main entry point for the production infrastructure.
# It composes all the modules together.
#
# Deployment order (handled automatically by Terraform dependencies):
# 1. Networking (VPC, subnets, security groups)
# 2. IAM (users, groups, service accounts)
# 3. Aurora (database cluster)
# 4. Secrets (application secrets in Secrets Manager)
# 5. ALB (load balancer)
# 6. ECS (cluster, service, task definition)
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Provider Configuration
# -----------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Project     = "DynastyFutures"
        Environment = var.environment
        ManagedBy   = "terraform"
      },
      var.additional_tags
    )
  }
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# -----------------------------------------------------------------------------
# IAM Module (Users, Groups, Policies)
# -----------------------------------------------------------------------------

module "iam" {
  source = "../../modules/iam"

  project_name          = var.project_name
  environment           = var.environment
  iam_users             = var.iam_users
  create_terraform_user = var.create_terraform_user
}

# -----------------------------------------------------------------------------
# Networking Module
# -----------------------------------------------------------------------------

module "networking" {
  source = "../../modules/networking"

  project_name          = var.project_name
  environment           = var.environment
  vpc_cidr              = var.vpc_cidr
  availability_zones    = var.availability_zones
  public_subnet_cidrs   = var.public_subnet_cidrs
  private_subnet_cidrs  = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
}

# -----------------------------------------------------------------------------
# Aurora PostgreSQL Module (Serverless v2)
# -----------------------------------------------------------------------------

module "aurora" {
  source = "../../modules/aurora"

  project_name               = var.project_name
  environment                = var.environment
  db_subnet_group_name       = module.networking.db_subnet_group_name
  database_security_group_id = module.networking.database_security_group_id
  database_name              = var.aurora_database_name
  engine_version             = var.aurora_engine_version
  min_capacity               = var.aurora_min_capacity
  max_capacity               = var.aurora_max_capacity
  backup_retention_period    = var.aurora_backup_retention_days
  skip_final_snapshot        = var.aurora_skip_final_snapshot
  deletion_protection        = var.aurora_deletion_protection
}

# -----------------------------------------------------------------------------
# Secrets Module (Application secrets in Secrets Manager)
# -----------------------------------------------------------------------------

module "secrets" {
  source = "../../modules/secrets"

  project_name = var.project_name
  environment  = var.environment
  database_url = module.aurora.connection_string
}

# -----------------------------------------------------------------------------
# ALB Module (Application Load Balancer)
# -----------------------------------------------------------------------------

module "alb" {
  source = "../../modules/alb"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  container_port        = 3000
  deletion_protection   = false
}

# -----------------------------------------------------------------------------
# ECS Module (Fargate cluster, service, ECR)
# -----------------------------------------------------------------------------

module "ecs" {
  source = "../../modules/ecs"

  project_name          = var.project_name
  environment           = var.environment
  private_subnet_ids    = module.networking.private_subnet_ids
  ecs_security_group_id = module.networking.ecs_security_group_id
  target_group_arn      = module.alb.target_group_arn

  # Secrets
  secret_arns             = module.secrets.all_secret_arns
  database_url_secret_arn = module.secrets.database_url_secret_arn
  jwt_secret_arn          = module.secrets.jwt_secret_arn

  # Task sizing
  cpu           = var.ecs_api_cpu
  memory        = var.ecs_api_memory
  desired_count = var.ecs_api_desired_count

  # Application config
  node_env    = "production"
  log_level   = "info"
  cors_origin = var.cors_origin
}

# -----------------------------------------------------------------------------
# Redis Module (Uncomment when ready)
# -----------------------------------------------------------------------------

# module "redis" {
#   source = "../../modules/redis"
#
#   project_name         = var.project_name
#   environment          = var.environment
#   vpc_id               = module.networking.vpc_id
#   private_subnet_ids   = module.networking.private_subnet_ids
#   private_subnet_cidrs = var.private_subnet_cidrs
#   node_type            = var.redis_node_type
#   num_cache_nodes      = var.redis_num_cache_nodes
# }

# -----------------------------------------------------------------------------
# S3 Module (Uncomment when ready)
# -----------------------------------------------------------------------------

# module "s3" {
#   source = "../../modules/s3"
#
#   project_name = var.project_name
#   environment  = var.environment
# }

# -----------------------------------------------------------------------------
# Monitoring Module (Uncomment when ready)
# -----------------------------------------------------------------------------

# module "monitoring" {
#   source = "../../modules/monitoring"
#
#   project_name = var.project_name
#   environment  = var.environment
#
#   ecs_cluster_name  = module.ecs.cluster_name
#   aurora_cluster_id = module.aurora.cluster_id
# }
