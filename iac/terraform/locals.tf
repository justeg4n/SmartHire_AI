locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  cognito_config = {
    user_pool_name       = "${var.project_name}-user-pool-${var.environment}"
    frontend_client_name = "${var.project_name}-frontend-client-${var.environment}"
    domain_prefix        = "${var.project_name}-auth-${var.environment}"
  }

  iam_groups = {
    ai_group       = "${var.project_name}-ai-group-${var.environment}"
    frontend_group = "${var.project_name}-frontend-group-${var.environment}"
    backend_group  = "${var.project_name}-backend-group-${var.environment}"
  }
}
