variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "private_db_subnet_ids" {
  type        = list(string)
  description = "Private DB subnet IDs from networking module"
}

variable "app_security_group_id" {
  type        = string
  description = "App security group ID from networking module"
}

variable "rds_secret_arn" {
  type        = string
  description = "ARN of RDS Secrets Manager secret from database module"
}

variable "rds_secret_name" {
  type        = string
  description = "Name of RDS Secrets Manager secret from database module"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS Key ARN for RDS secrets from database module"
}

variable "cognito_password_min_length" {
  type    = number
  default = 8
}

variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "common_tags" {
  type = map(string)
}

variable "raw_assets_bucket_arn" {
  type        = string
  description = "ARN of the unified raw assets bucket for Identity Pool permissions"
}
