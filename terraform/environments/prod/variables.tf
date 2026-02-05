# =============================================================================
# Variables - Production Environment
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"

  # TODO: Change to your preferred region
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "dynasty-futures"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  # TODO: Update if using a different region
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (ALB, NAT Gateway)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (ECS, Lambda)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets (Aurora, Redis)"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24"]
}

# -----------------------------------------------------------------------------
# Database (Aurora PostgreSQL)
# -----------------------------------------------------------------------------

variable "aurora_instance_class_writer" {
  description = "Instance class for Aurora writer"
  type        = string
  default     = "db.r6g.large"
}

variable "aurora_instance_class_reader" {
  description = "Instance class for Aurora reader"
  type        = string
  default     = "db.r6g.medium"
}

variable "aurora_database_name" {
  description = "Name of the default database"
  type        = string
  default     = "dynasty_futures"
}

variable "aurora_backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

# -----------------------------------------------------------------------------
# Cache (ElastiCache Redis)
# -----------------------------------------------------------------------------

variable "redis_node_type" {
  description = "Node type for Redis cluster"
  type        = string
  default     = "cache.r6g.medium"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the Redis cluster"
  type        = number
  default     = 1
}

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------

variable "ecs_api_cpu" {
  description = "CPU units for the API service (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "ecs_api_memory" {
  description = "Memory (MB) for the API service"
  type        = number
  default     = 1024
}

variable "ecs_api_desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 2
}

# -----------------------------------------------------------------------------
# Domain (Optional)
# -----------------------------------------------------------------------------

variable "domain_name" {
  description = "Domain name for the API (e.g., api.dynastyfutures.com)"
  type        = string
  default     = ""

  # TODO: Set this when you have a domain
}

# -----------------------------------------------------------------------------
# Tags
# -----------------------------------------------------------------------------

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# IAM
# -----------------------------------------------------------------------------

variable "iam_users" {
  description = "List of IAM users to create"
  type = list(object({
    username       = string
    email          = string
    group          = string # admin, developer, or readonly
    console_access = bool
  }))
  default = []
}

variable "create_terraform_user" {
  description = "Whether to create a dedicated Terraform service account for CI/CD"
  type        = bool
  default     = true
}
