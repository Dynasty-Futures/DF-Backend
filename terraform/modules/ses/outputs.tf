# =============================================================================
# SES Module - Outputs
# =============================================================================
# These outputs provide the DNS records that must be added manually
# in your external DNS provider (Microsoft) to verify the domain.
# =============================================================================

# -----------------------------------------------------------------------------
# Domain Verification
# -----------------------------------------------------------------------------

output "ses_verification_txt_record" {
  description = "TXT record to add in DNS for SES domain verification"
  value = {
    name  = "_amazonses.${var.domain}"
    type  = "TXT"
    value = aws_ses_domain_identity.main.verification_token
  }
}

# -----------------------------------------------------------------------------
# DKIM Records
# -----------------------------------------------------------------------------

output "ses_dkim_cname_records" {
  description = "CNAME records to add in DNS for DKIM email authentication"
  value = [
    for token in aws_ses_domain_dkim.main.dkim_tokens : {
      name  = "${token}._domainkey.${var.domain}"
      type  = "CNAME"
      value = "${token}.dkim.amazonses.com"
    }
  ]
}

# -----------------------------------------------------------------------------
# Domain Identity ARN
# -----------------------------------------------------------------------------

output "domain_identity_arn" {
  description = "ARN of the SES domain identity (useful for IAM policy restrictions)"
  value       = aws_ses_domain_identity.main.arn
}
