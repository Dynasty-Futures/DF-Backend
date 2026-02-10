# =============================================================================
# Outputs - ECS Module
# =============================================================================

# -----------------------------------------------------------------------------
# ECR
# -----------------------------------------------------------------------------

output "ecr_repository_url" {
  description = "URL of the ECR repository (use for docker push)"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_repository_name" {
  description = "Name of the ECR repository"
  value       = aws_ecr_repository.api.name
}

# -----------------------------------------------------------------------------
# Cluster
# -----------------------------------------------------------------------------

output "cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

# -----------------------------------------------------------------------------
# Service
# -----------------------------------------------------------------------------

output "service_name" {
  description = "Name of the ECS API service"
  value       = aws_ecs_service.api.name
}

output "service_id" {
  description = "ID of the ECS API service"
  value       = aws_ecs_service.api.id
}

# -----------------------------------------------------------------------------
# Task
# -----------------------------------------------------------------------------

output "task_definition_arn" {
  description = "ARN of the API task definition"
  value       = aws_ecs_task_definition.api.arn
}

output "task_definition_family" {
  description = "Family of the API task definition"
  value       = aws_ecs_task_definition.api.family
}

output "task_execution_role_arn" {
  description = "ARN of the task execution IAM role"
  value       = aws_iam_role.task_execution.arn
}

output "task_role_arn" {
  description = "ARN of the task IAM role"
  value       = aws_iam_role.task.arn
}

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.api.name
}
