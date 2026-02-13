# =============================================================================
# Variables - ALB Module
# =============================================================================

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the ALB"
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group ID for the ALB (from networking module)"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "deletion_protection" {
  description = "Enable deletion protection for the ALB"
  type        = bool
  default     = false
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS. When provided, an HTTPS listener is created and HTTP redirects to HTTPS."
  type        = string
  default     = ""
}
