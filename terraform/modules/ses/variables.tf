# =============================================================================
# SES Module - Variables
# =============================================================================

variable "project_name" {
  description = "Name of the project (used for naming/tagging)"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., prod, staging)"
  type        = string
}

variable "domain" {
  description = "Domain to verify in SES for sending emails"
  type        = string
  default     = "dynastyfuturesdyn.com"
}

variable "support_email" {
  description = "Support email address to verify as a recipient (needed while in SES sandbox)"
  type        = string
  default     = "support@dynastyfuturesdyn.com"
}
