# =============================================================================
# Dynasty Futures - IAM Module
# =============================================================================
# This module manages IAM users, groups, and policies for the Dynasty Futures
# team. It creates a proper access structure with least-privilege principles.
#
# Groups:
# - admin: Full administrative access (for infrastructure management)
# - developer: Access to deploy and manage application resources
# - readonly: Read-only access for viewing resources
# =============================================================================

# -----------------------------------------------------------------------------
# Password Policy
# -----------------------------------------------------------------------------

resource "aws_iam_account_password_policy" "strict" {
  minimum_password_length        = 14
  require_lowercase_characters   = true
  require_uppercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
  max_password_age               = 90
  password_reuse_prevention      = 12
}

# -----------------------------------------------------------------------------
# IAM Groups
# -----------------------------------------------------------------------------

resource "aws_iam_group" "admin" {
  name = "${var.project_name}-admin"
  path = "/${var.project_name}/"
}

resource "aws_iam_group" "developer" {
  name = "${var.project_name}-developer"
  path = "/${var.project_name}/"
}

resource "aws_iam_group" "readonly" {
  name = "${var.project_name}-readonly"
  path = "/${var.project_name}/"
}

# -----------------------------------------------------------------------------
# Group Policy Attachments
# -----------------------------------------------------------------------------

# Admin group gets full admin access
resource "aws_iam_group_policy_attachment" "admin_full_access" {
  group      = aws_iam_group.admin.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Developer group gets power user access (everything except IAM)
resource "aws_iam_group_policy_attachment" "developer_power_user" {
  group      = aws_iam_group.developer.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# Readonly group gets read-only access
resource "aws_iam_group_policy_attachment" "readonly_access" {
  group      = aws_iam_group.readonly.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# -----------------------------------------------------------------------------
# Self-Management Policy (for all users)
# Allows users to manage their own credentials, MFA, etc.
# -----------------------------------------------------------------------------

resource "aws_iam_policy" "self_management" {
  name        = "${var.project_name}-self-management"
  description = "Allows users to manage their own credentials and MFA"
  path        = "/${var.project_name}/"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowViewAccountInfo"
        Effect = "Allow"
        Action = [
          "iam:GetAccountPasswordPolicy",
          "iam:ListVirtualMFADevices"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowManageOwnPasswords"
        Effect = "Allow"
        Action = [
          "iam:ChangePassword",
          "iam:GetUser"
        ]
        Resource = "arn:aws:iam::*:user/$${aws:username}"
      },
      {
        Sid    = "AllowManageOwnAccessKeys"
        Effect = "Allow"
        Action = [
          "iam:CreateAccessKey",
          "iam:DeleteAccessKey",
          "iam:ListAccessKeys",
          "iam:UpdateAccessKey",
          "iam:GetAccessKeyLastUsed"
        ]
        Resource = "arn:aws:iam::*:user/$${aws:username}"
      },
      {
        Sid    = "AllowManageOwnMFA"
        Effect = "Allow"
        Action = [
          "iam:CreateVirtualMFADevice",
          "iam:DeleteVirtualMFADevice",
          "iam:EnableMFADevice",
          "iam:ListMFADevices",
          "iam:ResyncMFADevice"
        ]
        Resource = [
          "arn:aws:iam::*:user/$${aws:username}",
          "arn:aws:iam::*:mfa/$${aws:username}"
        ]
      },
      {
        Sid    = "AllowDeactivateOwnMFAOnlyWhenUsingMFA"
        Effect = "Allow"
        Action = [
          "iam:DeactivateMFADevice"
        ]
        Resource = [
          "arn:aws:iam::*:user/$${aws:username}",
          "arn:aws:iam::*:mfa/$${aws:username}"
        ]
        Condition = {
          Bool = {
            "aws:MultiFactorAuthPresent" = "true"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-self-management"
  }
}

# Attach self-management policy to all groups
resource "aws_iam_group_policy_attachment" "admin_self_management" {
  group      = aws_iam_group.admin.name
  policy_arn = aws_iam_policy.self_management.arn
}

resource "aws_iam_group_policy_attachment" "developer_self_management" {
  group      = aws_iam_group.developer.name
  policy_arn = aws_iam_policy.self_management.arn
}

resource "aws_iam_group_policy_attachment" "readonly_self_management" {
  group      = aws_iam_group.readonly.name
  policy_arn = aws_iam_policy.self_management.arn
}

# -----------------------------------------------------------------------------
# IAM Users
# -----------------------------------------------------------------------------

resource "aws_iam_user" "users" {
  for_each = { for user in var.iam_users : user.username => user }

  name          = each.value.username
  path          = "/${var.project_name}/"
  force_destroy = false # Prevent accidental deletion

  tags = {
    Name  = each.value.username
    Email = each.value.email
    Role  = each.value.group
  }
}

# User-Group Memberships
resource "aws_iam_user_group_membership" "users" {
  for_each = { for user in var.iam_users : user.username => user }

  user = aws_iam_user.users[each.key].name

  groups = [
    each.value.group == "admin" ? aws_iam_group.admin.name : (
      each.value.group == "developer" ? aws_iam_group.developer.name : aws_iam_group.readonly.name
    )
  ]
}

# Console login profiles (with initial password)
resource "aws_iam_user_login_profile" "users" {
  for_each = {
    for user in var.iam_users : user.username => user
    if user.console_access
  }

  user                    = aws_iam_user.users[each.key].name
  password_reset_required = true

  lifecycle {
    ignore_changes = [password_length, password_reset_required]
  }
}

# -----------------------------------------------------------------------------
# Terraform Service Account (for CI/CD)
# This is a separate user specifically for automated deployments
# -----------------------------------------------------------------------------

resource "aws_iam_user" "terraform" {
  count = var.create_terraform_user ? 1 : 0

  name          = "${var.project_name}-terraform"
  path          = "/system/"
  force_destroy = false

  tags = {
    Name    = "${var.project_name}-terraform"
    Purpose = "terraform-automation"
  }
}

resource "aws_iam_user_policy_attachment" "terraform_admin" {
  count = var.create_terraform_user ? 1 : 0

  user       = aws_iam_user.terraform[0].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Access keys for Terraform user (store these securely!)
resource "aws_iam_access_key" "terraform" {
  count = var.create_terraform_user ? 1 : 0

  user = aws_iam_user.terraform[0].name
}
