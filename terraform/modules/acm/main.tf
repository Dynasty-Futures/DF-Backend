# =============================================================================
# ACM Module - SSL/TLS Certificate
# =============================================================================
# Creates an ACM certificate for the API domain with DNS validation.
#
# Since DNS is managed externally (Microsoft DNS, not Route 53), this module
# outputs the CNAME validation records that must be added manually.
#
# Steps:
# 1. terraform apply (creates the certificate in PENDING_VALIDATION state)
# 2. Add the CNAME records from the outputs to your DNS provider
# 3. Wait for AWS to validate (usually 5-30 minutes)
# 4. Once validated, the certificate ARN can be used by the ALB HTTPS listener
#
# Resources created:
# - ACM certificate with DNS validation
# =============================================================================

# resource "aws_acm_certificate" "api" {
#   domain_name       = var.domain_name
#   validation_method = "DNS"

#   # Include wildcard if requested
#   subject_alternative_names = var.subject_alternative_names

#   lifecycle {
#     create_before_destroy = true
#   }

#   tags = {
#     Name = "${var.project_name}-api-cert-${var.environment}"
#   }
# }
