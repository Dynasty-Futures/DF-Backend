# =============================================================================
# ALB Module
# =============================================================================
# Creates an Application Load Balancer for routing traffic to ECS Fargate
# tasks. Initially configured with HTTP only (port 80).
#
# To add HTTPS later:
# 1. Request an ACM certificate for your domain
# 2. Add an HTTPS listener (port 443) with the certificate
# 3. Update the HTTP listener to redirect to HTTPS
#
# Resources created:
# - Application Load Balancer
# - Target group (IP-based for Fargate)
# - HTTP listener (port 80)
# =============================================================================

# -----------------------------------------------------------------------------
# Application Load Balancer
# -----------------------------------------------------------------------------

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.deletion_protection

  tags = {
    Name = "${var.project_name}-alb-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Target Group
# -----------------------------------------------------------------------------

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-tg-${var.environment}"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # Required for Fargate

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 10
    interval            = 30
    matcher             = "200"
  }

  # Allow slow drain on deregistration
  deregistration_delay = 30

  tags = {
    Name = "${var.project_name}-api-tg-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# HTTP Listener (Port 80)
# -----------------------------------------------------------------------------

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # TODO: When adding HTTPS, change this to redirect:
  # default_action {
  #   type = "redirect"
  #   redirect {
  #     port        = "443"
  #     protocol    = "HTTPS"
  #     status_code = "HTTP_301"
  #   }
  # }

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = {
    Name = "${var.project_name}-http-listener-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# HTTPS Listener (Port 443) - Uncomment when ACM certificate is ready
# -----------------------------------------------------------------------------

# resource "aws_lb_listener" "https" {
#   load_balancer_arn = aws_lb.main.arn
#   port              = 443
#   protocol          = "HTTPS"
#   ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
#   certificate_arn   = var.acm_certificate_arn
#
#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.api.arn
#   }
# }
