# =============================================================================
# IAM Module Outputs
# =============================================================================

output "admin_group_name" {
  description = "Name of the admin IAM group"
  value       = aws_iam_group.admin.name
}

output "admin_group_arn" {
  description = "ARN of the admin IAM group"
  value       = aws_iam_group.admin.arn
}

output "developer_group_name" {
  description = "Name of the developer IAM group"
  value       = aws_iam_group.developer.name
}

output "developer_group_arn" {
  description = "ARN of the developer IAM group"
  value       = aws_iam_group.developer.arn
}

output "readonly_group_name" {
  description = "Name of the readonly IAM group"
  value       = aws_iam_group.readonly.name
}

output "readonly_group_arn" {
  description = "ARN of the readonly IAM group"
  value       = aws_iam_group.readonly.arn
}

output "user_arns" {
  description = "Map of username to user ARN"
  value       = { for k, v in aws_iam_user.users : k => v.arn }
}

output "user_initial_passwords" {
  description = "Map of username to initial password (sensitive)"
  value       = { for k, v in aws_iam_user_login_profile.users : k => v.password }
  sensitive   = true
}

output "terraform_user_name" {
  description = "Name of the Terraform service account"
  value       = var.create_terraform_user ? aws_iam_user.terraform[0].name : null
}

output "terraform_user_arn" {
  description = "ARN of the Terraform service account"
  value       = var.create_terraform_user ? aws_iam_user.terraform[0].arn : null
}

output "terraform_access_key_id" {
  description = "Access key ID for the Terraform service account"
  value       = var.create_terraform_user ? aws_iam_access_key.terraform[0].id : null
  sensitive   = true
}

output "terraform_secret_access_key" {
  description = "Secret access key for the Terraform service account (STORE SECURELY!)"
  value       = var.create_terraform_user ? aws_iam_access_key.terraform[0].secret : null
  sensitive   = true
}

output "console_signin_url" {
  description = "AWS Console sign-in URL for IAM users"
  value       = "https://${data.aws_caller_identity.current.account_id}.signin.aws.amazon.com/console"
}

# Data source for account ID
data "aws_caller_identity" "current" {}
