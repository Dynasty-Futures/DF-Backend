# =============================================================================
# Variables - Aurora Module
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., prod, staging)"
  type        = string
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

variable "db_subnet_group_name" {
  description = "Name of the DB subnet group (from networking module)"
  type        = string
}

variable "database_security_group_id" {
  description = "Security group ID for the database (from networking module)"
  type        = string
}

# -----------------------------------------------------------------------------
# Engine
# -----------------------------------------------------------------------------

variable "engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "16.4"
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

variable "database_name" {
  description = "Name of the default database"
  type        = string
  default     = "dynasty_futures"
}

variable "master_username" {
  description = "Master username for the database"
  type        = string
  default     = "dynasty_admin"
}

# -----------------------------------------------------------------------------
# Serverless v2 Scaling
# -----------------------------------------------------------------------------

variable "min_capacity" {
  description = "Minimum ACU capacity for Serverless v2 (0.5 - 128)"
  type        = number
  default     = 0.5
}

variable "max_capacity" {
  description = "Maximum ACU capacity for Serverless v2 (0.5 - 128)"
  type        = number
  default     = 4
}

# -----------------------------------------------------------------------------
# Backups & Protection
# -----------------------------------------------------------------------------

variable "backup_retention_period" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot when destroying cluster"
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}
