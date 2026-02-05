# =============================================================================
# Dynasty Futures - Production Environment
# =============================================================================
# This is the main entry point for the production infrastructure.
# It composes all the modules together.
#
# TODO: Modules are added incrementally. Uncomment as you progress:
# - Phase 1: networking (VPC, subnets, security groups)
# - Phase 2: aurora (database), redis (cache)
# - Phase 3: ecs (API services), alb (load balancer)
# - Phase 4: lambda (serverless functions)
# - Phase 5: monitoring, waf, s3
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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
# Aurora PostgreSQL Module (Uncomment when ready)
# -----------------------------------------------------------------------------

# module "aurora" {
#   source = "../../modules/aurora"
#
#   project_name              = var.project_name
#   environment               = var.environment
#   vpc_id                    = module.networking.vpc_id
#   database_subnet_ids       = module.networking.database_subnet_ids
#   private_subnet_cidrs      = var.private_subnet_cidrs
#   instance_class_writer     = var.aurora_instance_class_writer
#   instance_class_reader     = var.aurora_instance_class_reader
#   database_name             = var.aurora_database_name
#   backup_retention_period   = var.aurora_backup_retention_days
# }

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
# ALB Module (Uncomment when ready)
# -----------------------------------------------------------------------------

# module "alb" {
#   source = "../../modules/alb"
#
#   project_name       = var.project_name
#   environment        = var.environment
#   vpc_id             = module.networking.vpc_id
#   public_subnet_ids  = module.networking.public_subnet_ids
#   domain_name        = var.domain_name
# }

# -----------------------------------------------------------------------------
# ECS Module (Uncomment when ready)
# -----------------------------------------------------------------------------

# module "ecs" {
#   source = "../../modules/ecs"
#
#   project_name         = var.project_name
#   environment          = var.environment
#   vpc_id               = module.networking.vpc_id
#   private_subnet_ids   = module.networking.private_subnet_ids
#   alb_target_group_arn = module.alb.target_group_arn
#   alb_security_group_id = module.alb.security_group_id
#   
#   api_cpu           = var.ecs_api_cpu
#   api_memory        = var.ecs_api_memory
#   api_desired_count = var.ecs_api_desired_count
#   
#   database_url     = module.aurora.connection_string
#   redis_url        = module.redis.connection_string
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
# Secrets Module (Uncomment when ready)
# -----------------------------------------------------------------------------

# module "secrets" {
#   source = "../../modules/secrets"
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
#   redis_cluster_id  = module.redis.cluster_id
# }
