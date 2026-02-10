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
