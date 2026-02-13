# =============================================================================
# Aurora Serverless v2 Module
# =============================================================================
# Creates an Aurora PostgreSQL Serverless v2 cluster for the Dynasty Futures
# backend. Uses auto-scaling to keep costs low during idle periods while
# scaling up under load.
#
# Resources created:
# - Aurora PostgreSQL cluster (Serverless v2)
# - Writer instance
# - Cluster parameter group
# - Random master password
# - Secrets Manager secret for DB credentials
# =============================================================================

# -----------------------------------------------------------------------------
# Random Password for Master User
# -----------------------------------------------------------------------------

resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# -----------------------------------------------------------------------------
# Cluster Parameter Group
# -----------------------------------------------------------------------------

resource "aws_rds_cluster_parameter_group" "main" {
  name        = "${var.project_name}-aurora-pg16-${var.environment}"
  family      = "aurora-postgresql16"
  description = "Aurora PostgreSQL 16 parameter group for ${var.project_name}"

  # Logging
  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries taking > 1 second
  }

  tags = {
    Name = "${var.project_name}-aurora-pg16-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Aurora Cluster
# -----------------------------------------------------------------------------

resource "aws_rds_cluster" "main" {
  cluster_identifier = "${var.project_name}-aurora-${var.environment}"

  engine         = "aurora-postgresql"
  engine_mode    = "provisioned" # Required for Serverless v2
  engine_version = var.engine_version

  database_name   = var.database_name
  master_username = var.master_username
  master_password = random_password.master.result
  port            = 5432

  # Networking
  db_subnet_group_name            = var.db_subnet_group_name
  vpc_security_group_ids          = [var.database_security_group_id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name

  # Serverless v2 scaling
  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }

  # Encryption
  storage_encrypted = true

  # Backups
  backup_retention_period      = var.backup_retention_period
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "mon:04:00-mon:05:00"
  copy_tags_to_snapshot        = true

  # Snapshot behavior
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.project_name}-aurora-final-${var.environment}"

  # Deletion protection
  deletion_protection = var.deletion_protection

  # Enable Data API (required for RDS Query Editor)
  enable_http_endpoint = true

  # Apply changes immediately (safe for serverless)
  apply_immediately = true

  tags = {
    Name = "${var.project_name}-aurora-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Aurora Writer Instance (Serverless v2)
# -----------------------------------------------------------------------------

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${var.project_name}-aurora-writer-${var.environment}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  # Performance Insights (free tier: 7 days retention)
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # Monitoring
  monitoring_interval = 0 # Disable enhanced monitoring to save costs

  tags = {
    Name = "${var.project_name}-aurora-writer-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Store Credentials in Secrets Manager
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.project_name}/${var.environment}/aurora/credentials"
  description = "Aurora PostgreSQL master credentials for ${var.project_name}"

  tags = {
    Name = "${var.project_name}-aurora-credentials-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_rds_cluster.main.master_username
    password = random_password.master.result
    host     = aws_rds_cluster.main.endpoint
    port     = aws_rds_cluster.main.port
    dbname   = aws_rds_cluster.main.database_name
    engine   = "aurora-postgresql"
  })
}
