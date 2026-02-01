# =============================================================================
# Terraform Backend Configuration - Production
# =============================================================================
# This configures remote state storage in S3 with DynamoDB locking.
#
# TODO: Before using this backend:
# 1. Run the bootstrap in terraform/shared/backend-setup first
# 2. Ensure the S3 bucket and DynamoDB table exist
# =============================================================================

terraform {
  backend "s3" {
    bucket         = "dynasty-futures-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1" # TODO: Change if using a different region
    dynamodb_table = "dynasty-futures-terraform-locks"
    encrypt        = true
  }
}
