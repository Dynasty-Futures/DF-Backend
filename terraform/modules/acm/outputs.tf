# =============================================================================
# Outputs - ACM Module
# =============================================================================
# The dns_validation_records output provides the CNAME records you need to add
# in your external DNS provider (Microsoft DNS) to validate the certificate.

# -----------------------------------------------------------------------------
# Certificate
# -----------------------------------------------------------------------------

# output "certificate_arn" {
#   description = "ARN of the ACM certificate"
#   value       = aws_acm_certificate.api.arn
# }

# output "certificate_status" {
#   description = "Status of the ACM certificate (PENDING_VALIDATION, ISSUED, etc.)"
#   value       = aws_acm_certificate.api.status
# }

# # -----------------------------------------------------------------------------
# # DNS Validation Records
# # -----------------------------------------------------------------------------
# # Add these CNAME records to your DNS provider to validate the certificate.
# # Format: { name = "CNAME name", value = "CNAME value" }

# output "dns_validation_records" {
#   description = "CNAME records to add in your DNS provider for certificate validation"
#   value = [
#     for dvo in aws_acm_certificate.api.domain_validation_options : {
#       domain = dvo.domain_name
#       name   = dvo.resource_record_name
#       type   = dvo.resource_record_type
#       value  = dvo.resource_record_value
#     }
#   ]
# }
