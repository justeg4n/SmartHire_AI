variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type        = string
  description = "AWS region (used in IAM policy ARN patterns)"
}

variable "frontend_s3_bucket_name" {
  type        = string
  description = "Frontend S3 bucket name from frontend module"
}

variable "cloudfront_distribution_id" {
  type        = string
  description = "CloudFront distribution ID from frontend module"
}

variable "cognito_user_pool_arn" {
  type        = string
  description = "Cognito User Pool ARN from auth module"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository in owner/repo format"
  default     = "YOUR_GITHUB_ORG/YOUR_GITHUB_REPO"
}

variable "enable_ai_services" {
  type    = bool
  default = true
}

variable "enable_frontend_services" {
  type    = bool
  default = true
}

variable "enable_backend_services" {
  type    = bool
  default = true
}

variable "common_tags" {
  type = map(string)
}
