# ============================================
# Cognito Outputs
# ============================================

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID for React configuration"
  value       = module.auth.cognito_user_pool_id
}

output "cognito_client_id" {
  description = "Cognito Client ID for React configuration"
  value       = module.auth.cognito_client_id
}

output "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID for React configuration"
  value       = module.auth.cognito_identity_pool_id
}

output "aws_region" {
  description = "AWS Region"
  value       = var.aws_region
}

# ============================================
# IAM Groups Outputs
# ============================================

output "ai_group_arn" {
  description = "ARN of AI Services IAM Group"
  value       = module.iam.ai_group_arn
}

output "ai_group_name" {
  description = "Name of AI Services IAM Group"
  value       = module.iam.ai_group_name
}

output "frontend_group_arn" {
  description = "ARN of Frontend Services IAM Group"
  value       = module.iam.frontend_group_arn
}

output "frontend_group_name" {
  description = "Name of Frontend Services IAM Group"
  value       = module.iam.frontend_group_name
}

output "backend_group_arn" {
  description = "ARN of Backend Services IAM Group"
  value       = module.iam.backend_group_arn
}

output "backend_group_name" {
  description = "Name of Backend Services IAM Group"
  value       = module.iam.backend_group_name
}

# ============================================
# Frontend Infrastructure Outputs
# ============================================

output "frontend_s3_bucket_name" {
  description = "S3 bucket name for frontend deployment (used in CI/CD)"
  value       = module.frontend.frontend_s3_bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation (used in CI/CD)"
  value       = module.frontend.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name (frontend URL)"
  value       = module.frontend.cloudfront_domain_name
}

# ============================================
# VPC Outputs
# ============================================

output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Public Subnet IDs"
  value       = module.networking.public_subnet_ids
}

output "private_db_subnet_ids" {
  description = "Private DB Subnet IDs"
  value       = module.networking.private_db_subnet_ids
}

output "app_security_group_id" {
  description = "App Security Group ID (dùng cho Lambda)"
  value       = module.networking.app_security_group_id
}

output "rds_security_group_id" {
  description = "RDS Security Group ID"
  value       = module.networking.rds_security_group_id
}

# ============================================
# RDS Outputs
# ============================================

output "rds_endpoint" {
  description = "RDS endpoint address"
  value       = module.database.rds_endpoint
}

output "rds_port" {
  description = "RDS port"
  value       = module.database.rds_port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = module.database.rds_database_name
}

output "rds_instance_id" {
  description = "RDS instance identifier"
  value       = module.database.rds_instance_id
}

output "rds_secret_arn" {
  description = "ARN of Secrets Manager secret chứa RDS credentials"
  value       = module.database.rds_secret_arn
}

output "rds_secrets_kms_key_id" {
  description = "KMS Key ID dùng để encrypt RDS secrets"
  value       = module.database.rds_secrets_kms_key_id
}

output "rds_secrets_kms_key_arn" {
  description = "KMS Key ARN dùng để encrypt RDS secrets"
  value       = module.database.rds_secrets_kms_key_arn
}

# ============================================
# Bastion Outputs
# ============================================

output "bastion_public_ip" {
  description = "Public IP of Bastion Host"
  value       = module.database.bastion_public_ip
}

# ============================================
# RDS Proxy Outputs
# ============================================

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint for Lambda connections"
  value       = module.database.rds_proxy_endpoint
}

output "rds_proxy_arn" {
  description = "RDS Proxy ARN"
  value       = module.database.rds_proxy_arn
}

output "rds_instance_arn" {
  description = "RDS instance ARN (for IAM database auth)"
  value       = module.database.rds_instance_arn
}

# ============================================
# CV Processing Service Outputs
# ============================================

output "raw_assets_bucket_name" {
  description = "Unified S3 bucket name for raw assets (CV + JD)"
  value       = module.storage.bucket_name
}

output "raw_assets_bucket_arn" {
  description = "Unified S3 bucket ARN for raw assets (CV + JD)"
  value       = module.storage.bucket_arn
}

output "cv_parse_queue_url" {
  description = "SQS URL for cv-parse queue"
  value       = module.queue.cv_parse_queue_url
}

output "cv_parse_queue_arn" {
  description = "SQS ARN for cv-parse queue"
  value       = module.queue.cv_parse_queue_arn
}

output "cv_parse_dlq_url" {
  description = "SQS URL for cv-parse dead-letter queue"
  value       = module.queue.cv_parse_dlq_url
}

output "application_tracking_table_name" {
  description = "DynamoDB table name for Single Table Application Tracking"
  value       = module.processing.application_tracking_table_name
}

output "application_tracking_table_arn" {
  description = "DynamoDB table ARN for Single Table Application Tracking"
  value       = module.processing.application_tracking_table_arn
}

output "appsync_api_id" {
  description = "AppSync API ID for smart matching"
  value       = module.processing.appsync_api_id
}

output "appsync_graphql_url" {
  description = "AppSync GraphQL endpoint URL"
  value       = module.processing.appsync_graphql_url
}

output "appsync_realtime_url" {
  description = "AppSync real-time endpoint URL"
  value       = module.processing.appsync_realtime_url
}
