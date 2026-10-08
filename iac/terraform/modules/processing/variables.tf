variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "raw_assets_bucket_arn" {
  description = "ARN of the unified raw assets S3 bucket"
  type        = string
}

variable "raw_assets_bucket_name" {
  description = "Name of the unified raw assets S3 bucket"
  type        = string
}

variable "cv_parse_queue_arn" {
  description = "ARN of CV parse SQS queue"
  type        = string
}

variable "cv_parse_queue_name" {
  description = "Name of CV parse SQS queue"
  type        = string
}

variable "cv_parse_dlq_name" {
  description = "Name of CV parse DLQ"
  type        = string
}

variable "lambda_handler" {
  description = "Handler for CV parser Lambda"
  type        = string
  default     = "cv_parser.lambda_handler"
}

variable "lambda_runtime" {
  description = "Runtime for CV parser Lambda"
  type        = string
  default     = "python3.12"
}

variable "lambda_timeout_seconds" {
  description = "Timeout in seconds for CV parser Lambda"
  type        = number
}

variable "lambda_memory_size" {
  description = "Memory in MB for CV parser Lambda"
  type        = number
}

variable "lambda_batch_size" {
  description = "Batch size for SQS event source mapping"
  type        = number
}

variable "cv_processor_reserved_concurrency" {
  description = <<-EOT
    Optional reserved concurrency for cv_jd_processor.
    Set to null to leave function unreserved (avoids account UnreservedConcurrentExecution floor errors).
    If set, this value is also used to cap SQS polling concurrency.
  EOT
  type        = number
  default     = null
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for parser Lambda"
  type        = number
}

variable "enable_point_in_time_recovery" {
  description = "Enable DynamoDB point-in-time recovery"
  type        = bool
  default     = true
}

variable "bedrock_model_id" {
  description = "Bedrock model id used by parser"
  type        = string
}

variable "parse_status_ttl_days" {
  description = "Application-level TTL days for parse status"
  type        = number
  default     = 30
}

variable "enable_lambda_vpc" {
  description = "Whether parser Lambda runs in VPC"
  type        = bool
  default     = false
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for VPC-enabled Lambda"
  type        = list(string)
  default     = []
}

variable "app_security_group_id" {
  description = "Security group id for VPC-enabled Lambda"
  type        = string
  default     = ""
}

variable "enable_alarms" {
  description = "Enable CloudWatch alarms for parser pipeline"
  type        = bool
  default     = true
}

variable "alarm_actions" {
  description = "List of alarm action ARNs (e.g. existing SNS topics); merged with alarm_notification_email topic when set"
  type        = list(string)
  default     = []
}

variable "alarm_notification_email" {
  description = "If non-empty and enable_alarms is true, creates an SNS topic + email subscription and attaches it to pipeline alarms"
  type        = string
  default     = ""
}

variable "cv_jd_processor_duration_p95_alarm_threshold_ms" {
  description = "Lambda Duration p95 (ms) for cv_jd_processor — Textract, Bedrock, embeddings, cross-encoder; often tens of seconds to a few minutes"
  type        = number
}

variable "job_suggestion_engine_duration_p95_alarm_threshold_ms" {
  description = "Lambda Duration p95 (ms) for job_suggestion_engine — keep below function timeout (90s); ~80% of timeout reduces false alarms"
  type        = number
}

variable "matching_pipeline_warning_log_alarms_enabled" {
  description = "When true with enable_alarms, log metric filter (pattern WARNING) + CloudWatch alarm per Lambda: cv_jd_processor, job_suggestion_engine, candidate_ranking_engine → pipeline SNS / alarm_actions"
  type        = bool
  default     = true
}

variable "candidate_ranking_engine_duration_p95_alarm_threshold_ms" {
  description = "Lambda Duration p95 (ms) for candidate_ranking_engine"
  type        = number
}

variable "enable_ai_skill_semantics" {
  description = "When true, job_suggestion_engine and candidate_ranking_engine call Bedrock Haiku (SKILL_SEMANTICS_MODEL_ID) to map required vs candidate skills after exact/fuzzy matching"
  type        = bool
  default     = true
}

variable "queue_depth_alarm_threshold" {
  description = "Queue depth threshold for visible messages"
  type        = number
}

variable "common_tags" {
  type = map(string)
}

variable "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint for VectorOps Lambda database connections"
  type        = string
  default     = ""
}

variable "rds_secret_arn" {
  description = "Secrets Manager ARN for RDS credentials"
  type        = string
  default     = ""
}

variable "rds_instance_arn" {
  description = "RDS instance ARN for IAM database authentication"
  type        = string
  default     = ""
}

variable "rds_kms_key_arn" {
  description = "KMS key ARN for decrypting RDS secrets"
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID used by AppSync primary authentication"
  type        = string
}

variable "appsync_enabled" {
  description = "Enable AppSync real-time notifications from matching engines"
  type        = bool
  default     = true
}

