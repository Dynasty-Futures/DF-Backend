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

# -----------------------------------------------------------------------------
# Stripe
# -----------------------------------------------------------------------------

variable "stripe_secret_key" {
  description = "Stripe API secret key (sk_live_... or sk_test_...)"
  type        = string
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret (whsec_...)"
  type        = string
  sensitive   = true
}

variable "stripe_publishable_key" {
  description = "Stripe publishable key (pk_live_... or pk_test_...)"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Google OAuth
# -----------------------------------------------------------------------------

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
}
