# =============================================================================
# SES Module - Email Sending (Domain Verification + DKIM)
# =============================================================================
# This module registers a domain identity with AWS SES and generates DKIM tokens.
# Since DNS is hosted externally (Microsoft), the DNS records must be added
# manually. The required records are provided as outputs.
# =============================================================================

# -----------------------------------------------------------------------------
# SES Domain Identity
# -----------------------------------------------------------------------------
# Registers the domain with SES and generates a verification token.
# A TXT record must be added in DNS for verification.

# resource "aws_ses_domain_identity" "main" {
#   domain = var.domain
# }

# # -----------------------------------------------------------------------------
# # SES DKIM
# # -----------------------------------------------------------------------------
# # Generates 3 DKIM tokens for email authentication.
# # Three CNAME records must be added in DNS for DKIM signing.

# resource "aws_ses_domain_dkim" "main" {
#   domain = aws_ses_domain_identity.main.domain
# }

# # -----------------------------------------------------------------------------
# # SES Email Identity (for sandbox mode)
# # -----------------------------------------------------------------------------
# # While the SES account is in sandbox mode, recipient addresses must also be
# # verified. This verifies the support inbox so it can receive emails.
# # This can be removed once SES production access is granted.

# resource "aws_ses_email_identity" "support" {
#   email = var.support_email
# }
