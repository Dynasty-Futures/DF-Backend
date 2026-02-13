# =============================================================================
# Variables - ECS Module
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for ECS tasks (from networking module)"
  type        = string
}

variable "target_group_arn" {
  description = "ARN of the ALB target group (from ALB module). Leave empty to run without a load balancer."
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Secrets
# -----------------------------------------------------------------------------

variable "secret_arns" {
  description = "List of Secrets Manager ARNs the task execution role can read"
  type        = list(string)
}

variable "database_url_secret_arn" {
  description = "ARN of the DATABASE_URL secret in Secrets Manager"
  type        = string
}

variable "jwt_secret_arn" {
  description = "ARN of the JWT_SECRET secret in Secrets Manager"
  type        = string
}

# -----------------------------------------------------------------------------
# Task Configuration
# -----------------------------------------------------------------------------

variable "cpu" {
  description = "CPU units for the API task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Memory (MB) for the API task"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 2
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

# -----------------------------------------------------------------------------
# Application Configuration
# -----------------------------------------------------------------------------

variable "node_env" {
  description = "Node.js environment"
  type        = string
  default     = "production"
}

variable "log_level" {
  description = "Application log level"
  type        = string
  default     = "info"
}

variable "cors_origin" {
  description = "Allowed CORS origins (comma-separated)"
  type        = string
  default     = "*"
}

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}
