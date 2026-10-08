# ============================================
# Root Orchestration — calls all modules
# ============================================

module "networking" {
  source                     = "./modules/networking"
  project_name               = var.project_name
  environment                = var.environment
  aws_region                 = var.aws_region
  endpoint_single_subnet_dev = var.endpoint_single_subnet_dev
  endpoint_subnet_index      = var.endpoint_subnet_index
  egress_mode                = var.egress_mode
  nat_gateway_az_count       = var.nat_gateway_az_count
  enable_interface_endpoints = var.enable_interface_endpoints
  common_tags                = local.common_tags
}

module "dns" {
  source = "./modules/dns"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
  domain_name = var.domain_name
  common_tags = local.common_tags
}

module "database" {
  source                      = "./modules/database"
  project_name                = var.project_name
  environment                 = var.environment
  vpc_id                      = module.networking.vpc_id
  private_db_subnet_ids       = module.networking.private_db_subnet_ids
  private_db_subnet_cidrs     = module.networking.private_db_subnet_cidrs
  rds_security_group_id       = module.networking.rds_security_group_id
  public_subnet_id            = module.networking.public_subnet_ids[0]
  rds_master_username         = var.rds_master_username
  rds_master_password         = var.rds_master_password
  rds_instance_class          = var.rds_instance_class
  rds_allocated_storage       = var.rds_allocated_storage
  bastion_key_pair            = var.bastion_key_pair
  bastion_ssh_cidr            = var.bastion_ssh_cidr
  enable_bastion_nat_instance = var.egress_mode == "shared_bastion_nat"
  enable_rds_proxy            = var.enable_rds_proxy
  app_security_group_id       = module.networking.app_security_group_id
  common_tags                 = local.common_tags
}

resource "aws_route" "private_default_shared_bastion_nat" {
  count = var.egress_mode == "shared_bastion_nat" ? length(module.networking.private_route_table_ids) : 0

  route_table_id         = module.networking.private_route_table_ids[count.index]
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = module.database.bastion_primary_network_interface_id
}

module "auth" {
  source                      = "./modules/auth"
  project_name                = var.project_name
  environment                 = var.environment
  private_db_subnet_ids       = module.networking.private_db_subnet_ids
  app_security_group_id       = module.networking.app_security_group_id
  raw_assets_bucket_arn       = module.storage.bucket_arn
  rds_secret_arn              = module.database.rds_secret_arn
  rds_secret_name             = module.database.rds_secret_name
  kms_key_arn                 = module.database.rds_secrets_kms_key_arn
  cognito_password_min_length = var.cognito_password_min_length
  google_client_id            = var.google_client_id
  google_client_secret        = var.google_client_secret
  common_tags                 = local.common_tags
}

module "frontend" {
  source           = "./modules/frontend"
  project_name     = var.project_name
  environment      = var.environment
  domain_name      = var.domain_name
  certificate_arn  = module.dns.certificate_arn
  route53_zone_id  = module.dns.route53_zone_id
  existing_waf_arn = var.existing_waf_arn
  common_tags      = local.common_tags
}

module "iam" {
  source                     = "./modules/iam"
  project_name               = var.project_name
  environment                = var.environment
  aws_region                 = var.aws_region
  frontend_s3_bucket_name    = module.frontend.frontend_s3_bucket_name
  cloudfront_distribution_id = module.frontend.cloudfront_distribution_id
  cognito_user_pool_arn      = module.auth.cognito_user_pool_arn
  github_repo                = var.github_repo
  enable_ai_services         = var.enable_ai_services
  enable_frontend_services   = var.enable_frontend_services
  enable_backend_services    = var.enable_backend_services
  common_tags                = local.common_tags
}

module "storage" {
  source                    = "./modules/storage"
  bucket_name               = var.raw_assets_bucket_name_override != "" ? var.raw_assets_bucket_name_override : "${var.project_name}-raw-assets-${var.environment}"
  cv_object_prefix          = var.cv_object_prefix
  jd_object_prefix          = var.jd_object_prefix
  object_retention_days     = var.cv_object_retention_days
  noncurrent_retention_days = var.cv_noncurrent_retention_days
  sse_algorithm             = var.cv_bucket_sse_algorithm
  force_destroy             = var.cv_bucket_force_destroy
  common_tags               = local.common_tags
}

module "queue" {
  source                        = "./modules/queue"
  project_name                  = var.project_name
  environment                   = var.environment
  message_retention_seconds     = var.cv_queue_message_retention_seconds
  dlq_message_retention_seconds = var.cv_dlq_message_retention_seconds
  visibility_timeout_seconds    = var.cv_queue_visibility_timeout_seconds
  max_receive_count             = var.cv_queue_max_receive_count
  common_tags                   = local.common_tags
}

data "aws_iam_policy_document" "cv_parse_queue_policy" {
  statement {
    sid    = "AllowS3SendMessage"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [module.queue.cv_parse_queue_arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [module.storage.bucket_arn]
    }
  }
}

resource "aws_sqs_queue_policy" "cv_parse_queue_policy" {
  queue_url = module.queue.cv_parse_queue_url
  policy    = data.aws_iam_policy_document.cv_parse_queue_policy.json
}

# S3 bucket notification for CV uploads only (JD processing is triggered directly by .NET backend via Step Functions)
resource "aws_s3_bucket_notification" "raw_assets_events" {
  bucket = module.storage.bucket_id

  queue {
    queue_arn     = module.queue.cv_parse_queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = var.cv_object_prefix
    filter_suffix = ".pdf"
  }

  depends_on = [
    module.storage,
    module.ecr
  ]
}

module "ecr" {
  source       = "./modules/ecr"
  project_name = var.project_name
  environment  = var.environment
  common_tags  = local.common_tags
}

module "processing" {
  source                                                   = "./modules/processing"
  project_name                                             = var.project_name
  environment                                              = var.environment
  raw_assets_bucket_arn                                    = module.storage.bucket_arn
  raw_assets_bucket_name                                   = module.storage.bucket_name
  cv_parse_queue_arn                                       = module.queue.cv_parse_queue_arn
  cv_parse_queue_name                                      = module.queue.cv_parse_queue_name
  cv_parse_dlq_name                                        = module.queue.cv_parse_dlq_name
  lambda_handler                                           = var.cv_parser_lambda_handler
  lambda_runtime                                           = var.cv_parser_lambda_runtime
  lambda_timeout_seconds                                   = var.cv_parser_lambda_timeout_seconds
  lambda_memory_size                                       = var.cv_parser_lambda_memory_size
  lambda_batch_size                                        = var.cv_parser_lambda_batch_size
  cv_processor_reserved_concurrency                        = var.cv_processor_reserved_concurrency
  log_retention_days                                       = var.cv_parser_log_retention_days
  enable_point_in_time_recovery                            = var.cv_dynamodb_pitr_enabled
  bedrock_model_id                                         = var.cv_parser_bedrock_model_id
  parse_status_ttl_days                                    = var.cv_parser_status_ttl_days
  enable_lambda_vpc                                        = var.cv_parser_enable_vpc
  private_subnet_ids                                       = module.networking.private_db_subnet_ids
  app_security_group_id                                    = module.networking.app_security_group_id
  enable_alarms                                            = var.cv_parser_enable_alarms
  alarm_actions                                            = var.cv_parser_alarm_actions
  alarm_notification_email                                 = var.cv_parser_alarm_notification_email
  cv_jd_processor_duration_p95_alarm_threshold_ms          = var.cv_jd_processor_duration_p95_alarm_threshold_ms
  job_suggestion_engine_duration_p95_alarm_threshold_ms    = var.job_suggestion_engine_duration_p95_alarm_threshold_ms
  matching_pipeline_warning_log_alarms_enabled             = var.matching_pipeline_warning_log_alarms_enabled
  candidate_ranking_engine_duration_p95_alarm_threshold_ms = var.candidate_ranking_engine_duration_p95_alarm_threshold_ms
  enable_ai_skill_semantics                                = var.enable_ai_skill_semantics
  queue_depth_alarm_threshold                              = var.cv_parse_queue_depth_alarm_threshold
  rds_proxy_endpoint                                       = module.database.rds_proxy_endpoint
  rds_secret_arn                                           = module.database.rds_secret_arn
  rds_instance_arn                                         = module.database.rds_instance_arn
  rds_kms_key_arn                                          = module.database.rds_secrets_kms_key_arn
  cognito_user_pool_id                                     = module.auth.cognito_user_pool_id
  common_tags                                              = local.common_tags

  depends_on = [module.ecr]
}

module "cicd" {
  source                          = "./modules/cicd"
  project_name                    = var.project_name
  environment                     = var.environment
  github_repo                     = var.github_repo
  github_branch                   = var.github_branch
  job_suggestion_function_name    = module.processing.job_suggestion_engine_function_name
  candidate_ranking_function_name = module.processing.candidate_ranking_engine_function_name
  job_suggestion_repo_name        = module.ecr.job_suggestion_repo_name
  candidate_ranking_repo_name     = module.ecr.candidate_ranking_repo_name
  common_tags                     = local.common_tags
}
