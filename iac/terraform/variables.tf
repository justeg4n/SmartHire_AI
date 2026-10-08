variable "project_name" {
  description = "Project name"
  type        = string
  default     = "smarthire"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "endpoint_single_subnet_dev" {
  description = "If true in dev, place interface VPC endpoints in a single private DB subnet"
  type        = bool
  default     = false
}

variable "endpoint_subnet_index" {
  description = "Index of private DB subnet used when endpoint_single_subnet_dev is enabled"
  type        = number
  default     = 0
}

variable "egress_mode" {
  description = "Egress architecture mode: endpoint_only, shared_bastion_nat, nat_gateway"
  type        = string
  default     = "endpoint_only"

  validation {
    condition     = contains(["endpoint_only", "shared_bastion_nat", "nat_gateway"], var.egress_mode)
    error_message = "egress_mode must be one of: endpoint_only, shared_bastion_nat, nat_gateway."
  }
}

variable "nat_gateway_az_count" {
  description = "Number of NAT Gateways to provision when egress_mode is nat_gateway"
  type        = number
  default     = 2
}

variable "enable_interface_endpoints" {
  description = "Whether to create interface VPC endpoints (Secrets Manager, Cognito, Bedrock Runtime)"
  type        = bool
  default     = true
}

variable "cognito_password_min_length" {
  description = "Minimum password length"
  type        = number
  default     = 8
}

variable "enable_ai_services" {
  description = "Enable AI services (SageMaker, Bedrock, etc.)"
  type        = bool
  default     = true
}

variable "enable_frontend_services" {
  description = "Enable frontend services (CloudFront, S3, etc.)"
  type        = bool
  default     = true
}

variable "enable_backend_services" {
  description = "Enable backend services (Lambda, RDS, etc.)"
  type        = bool
  default     = true
}

variable "rds_master_username" {
  description = "RDS master username"
  type        = string
  default     = "smarthire_admin"
}

variable "rds_master_password" {
  description = "RDS master password (sensitive - set via TF_VAR_rds_master_password or terraform.tfvars)"
  type        = string
  sensitive   = true
}

variable "rds_instance_class" {
  description = "RDS instance class (dev: db.t3.micro, prod: db.m5.large)"
  type        = string
  default     = "db.t3.micro"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "google_client_id" {
  description = "Google OAuth Client ID for Cognito Federation"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret for Cognito Federation"
  type        = string
  default     = ""
}

variable "bastion_key_pair" {
  description = "EC2 Key Pair name for SSH access to Bastion host"
  type        = string
  default     = ""
}

variable "bastion_ssh_cidr" {
  description = "CIDR block allowed to SSH into Bastion host"
  type        = string
  default     = "0.0.0.0/0"
}

variable "existing_waf_arn" {
  description = "ARN of the existing WAF automatically created by CloudFront Pricing Plan"
  type        = string
  default     = ""  # Set to your CloudFront WAF ACL ARN, e.g. arn:aws:wafv2:us-east-1:ACCOUNT_ID:global/webacl/NAME/ID
}

variable "domain_name" {
  type        = string
  description = "The primary domain name for the frontend (e.g., example.com)"
  default     = "smarthire-ai.org"
}

variable "github_repo" {
  type        = string
  description = "The GitHub repository in format 'user/repo' allowed to assume the role"
  default     = "YOUR_GITHUB_ORG/YOUR_GITHUB_REPO"
}

variable "github_branch" {
  type        = string
  description = "The GitHub branch to watch for the CI/CD pipeline"
  default     = "dev"
}

variable "raw_assets_bucket_name_override" {
  description = "Override S3 bucket name for raw assets; leave empty to use naming convention"
  type        = string
  default     = ""
}

variable "cv_object_prefix" {
  description = "Object key prefix for candidate CV files"
  type        = string
  default     = "candidates/"
}

variable "jd_object_prefix" {
  description = "Object key prefix for JD files"
  type        = string
  default     = "jobs/"
}

variable "cv_bucket_force_destroy" {
  description = "Allow deletion of CV bucket even if non-empty"
  type        = bool
  default     = false
}

variable "cv_bucket_sse_algorithm" {
  description = "SSE algorithm for CV bucket objects"
  type        = string
  default     = "AES256"
}

variable "cv_object_retention_days" {
  description = "Retention in days for CV objects"
  type        = number
  default     = 365
}

variable "cv_noncurrent_retention_days" {
  description = "Retention in days for noncurrent CV object versions"
  type        = number
  default     = 30
}

variable "cv_queue_message_retention_seconds" {
  description = "Retention in seconds for cv-parse queue messages"
  type        = number
  default     = 345600
}

variable "cv_dlq_message_retention_seconds" {
  description = "Retention in seconds for cv-parse DLQ messages"
  type        = number
  default     = 1209600
}

variable "cv_queue_visibility_timeout_seconds" {
  description = "Visibility timeout for cv-parse queue"
  type        = number
  default     = 300
}

variable "cv_queue_max_receive_count" {
  description = "Max receives before cv-parse message moves to DLQ"
  type        = number
  default     = 3
}

variable "cv_dynamodb_pitr_enabled" {
  description = "Enable point-in-time recovery for CV parse DynamoDB table"
  type        = bool
  default     = true
}

variable "cv_parser_lambda_handler" {
  description = "Handler for cv-parser Lambda"
  type        = string
  default     = "cv_parser.lambda_handler"
}

variable "cv_parser_lambda_runtime" {
  description = "Runtime for cv-parser Lambda"
  type        = string
  default     = "python3.12"
}

variable "cv_parser_lambda_timeout_seconds" {
  description = "Timeout in seconds for cv-parser Lambda"
  type        = number
  default     = 240
}

variable "cv_parser_lambda_memory_size" {
  description = "Memory in MB for cv-parser Lambda"
  type        = number
  default     = 512
}

variable "cv_parser_lambda_batch_size" {
  description = "SQS batch size for cv-parser event source mapping"
  type        = number
  default     = 1
}

variable "cv_processor_reserved_concurrency" {
  description = "Max concurrent executions for cv_jd_processor. Haiku 4.5: 50 RPM global, each CV ~20-30s → 20 concurrent = ~40 CV/min. 100 CVs in ~2-3 minutes."
  type        = number
  default     = 20
}

variable "cv_parser_log_retention_days" {
  description = "CloudWatch log retention for cv-parser Lambda"
  type        = number
  default     = 30
}

variable "cv_parser_bedrock_model_id" {
  description = "Bedrock model id for cv-parser classification (Agent-1 CV extraction, JD parsing, interview guide). Haiku is sufficient for all structured extraction tasks and has 4× higher RPM quota than Sonnet."
  type        = string
  default     = "apac.anthropic.claude-3-haiku-20240307-v1:0"
}

variable "cv_parser_status_ttl_days" {
  description = "Application-level ttl days for parser status records"
  type        = number
  default     = 30
}

variable "cv_parser_enable_vpc" {
  description = "Whether cv-parser Lambda should run in VPC"
  type        = bool
  default     = false
}

variable "cv_parser_enable_alarms" {
  description = "Enable CloudWatch alarms for cv-parser service"
  type        = bool
  default     = true
}

variable "cv_parser_alarm_actions" {
  description = "Alarm action ARNs for cv-parser alarms"
  type        = list(string)
  default     = []
}

variable "cv_parser_alarm_notification_email" {
  description = "Email for SNS notifications from cv-parser CloudWatch alarms (confirm subscription after first apply)"
  type        = string
  default     = ""  # Set to your SNS notification email
}

variable "cv_jd_processor_duration_p95_alarm_threshold_ms" {
  description = "CloudWatch alarm: cv_jd_processor Duration p95 (ms). Default 120s — below Lambda timeout (240s); raise if normal p95 is higher (see CW Lambda metrics)"
  type        = number
  default     = 120000
}

variable "job_suggestion_engine_duration_p95_alarm_threshold_ms" {
  description = "CloudWatch alarm: job_suggestion_engine Duration p95 (ms). Lambda timeout 90s; default 72s (~80%) to warn before frequent timeouts"
  type        = number
  default     = 72000
}

variable "matching_pipeline_warning_log_alarms_enabled" {
  description = "CloudWatch log WARNING metric filters + alarms for cv_jd_processor, job_suggestion_engine, candidate_ranking_engine (SNS via cv_parser_alarm_notification_email / alarm_actions)"
  type        = bool
  default     = true
}

variable "candidate_ranking_engine_duration_p95_alarm_threshold_ms" {
  description = "CloudWatch alarm: candidate_ranking_engine Duration p95 (ms)"
  type        = number
  default     = 72000
}

variable "enable_ai_skill_semantics" {
  description = "Enable Haiku-backed semantic skill-gap mapping for job_suggestion_engine and candidate_ranking_engine (adds Bedrock calls for unmatched required skills)"
  type        = bool
  default     = true
}

variable "cv_parse_queue_depth_alarm_threshold" {
  description = "Threshold for visible messages in cv-parse queue alarm"
  type        = number
  default     = 10
}

variable "enable_rds_proxy" {
  description = "Enable RDS Proxy for Lambda connection pooling to PostgreSQL"
  type        = bool
  default     = false
}
