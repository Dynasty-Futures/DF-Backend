# =============================================================================
# Variables - Secrets Module
# =============================================================================

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "database_url" {
  description = "Full PostgreSQL connection string (from Aurora module)"
  type        = string
  sensitive   = true
}
