# =============================================================================
# Variables - ACM Module
# =============================================================================

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "domain_name" {
  description = "Primary domain name for the certificate (e.g., api.dynastyfuturesdyn.com)"
  type        = string
}

variable "subject_alternative_names" {
  description = "Additional domain names for the certificate (e.g., [\"*.dynastyfuturesdyn.com\"])"
  type        = list(string)
  default     = []
}
