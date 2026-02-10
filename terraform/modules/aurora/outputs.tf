# =============================================================================
# Outputs - Aurora Module
# =============================================================================

# -----------------------------------------------------------------------------
# Cluster
# -----------------------------------------------------------------------------

output "cluster_id" {
  description = "The Aurora cluster identifier"
  value       = aws_rds_cluster.main.id
}

output "cluster_arn" {
  description = "The Aurora cluster ARN"
  value       = aws_rds_cluster.main.arn
}

output "cluster_endpoint" {
  description = "The cluster writer endpoint"
  value       = aws_rds_cluster.main.endpoint
}

output "cluster_reader_endpoint" {
  description = "The cluster reader endpoint"
  value       = aws_rds_cluster.main.reader_endpoint
}

output "cluster_port" {
  description = "The port the cluster is listening on"
  value       = aws_rds_cluster.main.port
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

output "database_name" {
  description = "Name of the default database"
  value       = aws_rds_cluster.main.database_name
}

output "master_username" {
  description = "Master username"
  value       = aws_rds_cluster.main.master_username
  sensitive   = true
}

output "master_password" {
  description = "Master password"
  value       = random_password.master.result
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

output "credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret containing DB credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

# -----------------------------------------------------------------------------
# Connection String
# -----------------------------------------------------------------------------

output "connection_string" {
  description = "Full PostgreSQL connection string (DATABASE_URL for Prisma)"
  value       = "postgresql://${aws_rds_cluster.main.master_username}:${urlencode(random_password.master.result)}@${aws_rds_cluster.main.endpoint}:${aws_rds_cluster.main.port}/${aws_rds_cluster.main.database_name}?schema=public"
  sensitive   = true
}
