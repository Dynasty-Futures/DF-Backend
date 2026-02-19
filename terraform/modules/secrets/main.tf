# =============================================================================
# Secrets Manager Module
# =============================================================================
# Creates application-level secrets in AWS Secrets Manager for the Dynasty
# Futures backend. These are referenced by ECS task definitions to inject
# sensitive configuration at runtime.
#
# Resources created:
# - DATABASE_URL secret (constructed from Aurora outputs)
# - JWT_SECRET (auto-generated)
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
# - STRIPE_PUBLISHABLE_KEY
# =============================================================================

# -----------------------------------------------------------------------------
# DATABASE_URL (Constructed from Aurora outputs)
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${var.project_name}/${var.environment}/app/database-url"
  description = "PostgreSQL connection string for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-database-url-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

# -----------------------------------------------------------------------------
# JWT Secret (Auto-generated)
# -----------------------------------------------------------------------------

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.project_name}/${var.environment}/app/jwt-secret"
  description = "JWT signing secret for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-jwt-secret-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

# -----------------------------------------------------------------------------
# Stripe Secrets
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "stripe_secret_key" {
  name        = "${var.project_name}/${var.environment}/app/stripe-secret-key"
  description = "Stripe API secret key for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-stripe-secret-key-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "stripe_secret_key" {
  secret_id     = aws_secretsmanager_secret.stripe_secret_key.id
  secret_string = var.stripe_secret_key
}

resource "aws_secretsmanager_secret" "stripe_webhook_secret" {
  name        = "${var.project_name}/${var.environment}/app/stripe-webhook-secret"
  description = "Stripe webhook signing secret for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-stripe-webhook-secret-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "stripe_webhook_secret" {
  secret_id     = aws_secretsmanager_secret.stripe_webhook_secret.id
  secret_string = var.stripe_webhook_secret
}

resource "aws_secretsmanager_secret" "stripe_publishable_key" {
  name        = "${var.project_name}/${var.environment}/app/stripe-publishable-key"
  description = "Stripe publishable key for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-stripe-publishable-key-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "stripe_publishable_key" {
  secret_id     = aws_secretsmanager_secret.stripe_publishable_key.id
  secret_string = var.stripe_publishable_key
}

# -----------------------------------------------------------------------------
# Google OAuth
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "google_client_id" {
  name        = "${var.project_name}/${var.environment}/app/google-client-id"
  description = "Google OAuth client ID for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-google-client-id-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "google_client_id" {
  secret_id     = aws_secretsmanager_secret.google_client_id.id
  secret_string = var.google_client_id
}

resource "aws_secretsmanager_secret" "google_client_secret" {
  name        = "${var.project_name}/${var.environment}/app/google-client-secret"
  description = "Google OAuth client secret for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-google-client-secret-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "google_client_secret" {
  secret_id     = aws_secretsmanager_secret.google_client_secret.id
  secret_string = var.google_client_secret
}
