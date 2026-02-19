# =============================================================================
# Outputs - Secrets Module
# =============================================================================

output "database_url_secret_arn" {
  description = "ARN of the DATABASE_URL secret"
  value       = aws_secretsmanager_secret.database_url.arn
}

output "jwt_secret_arn" {
  description = "ARN of the JWT_SECRET secret"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "stripe_secret_key_arn" {
  description = "ARN of the STRIPE_SECRET_KEY secret"
  value       = aws_secretsmanager_secret.stripe_secret_key.arn
}

output "stripe_webhook_secret_arn" {
  description = "ARN of the STRIPE_WEBHOOK_SECRET secret"
  value       = aws_secretsmanager_secret.stripe_webhook_secret.arn
}

output "stripe_publishable_key_arn" {
  description = "ARN of the STRIPE_PUBLISHABLE_KEY secret"
  value       = aws_secretsmanager_secret.stripe_publishable_key.arn
}

output "google_client_id_arn" {
  description = "ARN of the GOOGLE_CLIENT_ID secret"
  value       = aws_secretsmanager_secret.google_client_id.arn
}

output "google_client_secret_arn" {
  description = "ARN of the GOOGLE_CLIENT_SECRET secret"
  value       = aws_secretsmanager_secret.google_client_secret.arn
}

output "all_secret_arns" {
  description = "List of all secret ARNs (for IAM policies)"
  value = [
    aws_secretsmanager_secret.database_url.arn,
    aws_secretsmanager_secret.jwt_secret.arn,
    aws_secretsmanager_secret.stripe_secret_key.arn,
    aws_secretsmanager_secret.stripe_webhook_secret.arn,
    aws_secretsmanager_secret.stripe_publishable_key.arn,
    aws_secretsmanager_secret.google_client_id.arn,
    aws_secretsmanager_secret.google_client_secret.arn,
  ]
}
