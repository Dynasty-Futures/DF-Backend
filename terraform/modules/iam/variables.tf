# =============================================================================
# IAM Module Variables
# =============================================================================

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
}

variable "iam_users" {
  description = "List of IAM users to create"
  type = list(object({
    username       = string
    email          = string
    group          = string # admin, developer, or readonly
    console_access = bool
  }))
  default = []

  validation {
    condition = alltrue([
      for user in var.iam_users : contains(["admin", "developer", "readonly"], user.group)
    ])
    error_message = "User group must be one of: admin, developer, readonly."
  }
}

variable "create_terraform_user" {
  description = "Whether to create a dedicated Terraform service account"
  type        = bool
  default     = true
}
