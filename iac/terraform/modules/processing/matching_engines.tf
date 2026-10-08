resource "aws_lambda_function" "job_suggestion_engine" {
  function_name = "${var.project_name}-job-suggestion-engine-${var.environment}"
  role          = aws_iam_role.pipeline.arn
  package_type  = "Image"
  image_uri     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/smarthire-job-suggestion-engine:latest"

  lifecycle {
    ignore_changes = [image_uri]
  }
  timeout     = 180
  memory_size = 3008

  tracing_config {
    mode = "Active"
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.app_security_group_id]
  }

  environment {
    variables = {
      DYNAMODB_TABLE_NAME     = aws_dynamodb_table.application_tracking.name
      RDS_PROXY_ENDPOINT      = var.rds_proxy_endpoint
      RDS_DATABASE            = "smarthiredb"
      RDS_SECRET_ARN          = var.rds_secret_arn
      RDS_SSL_MODE            = "require"
      RDS_CONNECT_TIMEOUT     = "10"
      ANN_CANDIDATE_POOL_SIZE = "10"
      FINAL_SUGGESTION_COUNT  = "5"
      SCORING_VERSION         = "mvp-v1"
      ENABLE_PGVECTOR         = "true"
      PARSE_STATUS_TTL_DAYS   = "30"
      OMP_NUM_THREADS         = "1"
      TRANSFORMERS_CACHE      = "/tmp"
      HF_HOME                 = "/tmp/hf_home"
      APPSYNC_ENABLED         = tostring(var.appsync_enabled)
      APPSYNC_REGION          = data.aws_region.current.name
      APPSYNC_URL             = var.appsync_enabled ? aws_appsync_graphql_api.smart_matching[0].uris["GRAPHQL"] : ""
      ENABLE_AI_SKILL_SEMANTICS = var.enable_ai_skill_semantics ? "true" : "false"
    }
  }

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-job-suggestion-engine-${var.environment}"
    Service = "cv-processing"
  })
}

resource "aws_cloudwatch_log_group" "job_suggestion_engine" {
  name              = "/aws/lambda/${aws_lambda_function.job_suggestion_engine.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.common_tags
}

resource "aws_cloudwatch_log_metric_filter" "job_suggestion_warnings" {
  count = var.enable_alarms && var.matching_pipeline_warning_log_alarms_enabled ? 1 : 0

  name           = "${var.project_name}-job-suggestion-warnings-${var.environment}"
  pattern        = "WARNING"
  log_group_name = aws_cloudwatch_log_group.job_suggestion_engine.name

  metric_transformation {
    name      = "JobSuggestionEngineWarningLines"
    namespace = "SmartHire/CVPipeline"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "job_suggestion_log_warnings" {
  count = var.enable_alarms && var.matching_pipeline_warning_log_alarms_enabled ? 1 : 0

  alarm_name          = "${var.project_name}-job-suggestion-log-warnings-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "JobSuggestionEngineWarningLines"
  namespace           = "SmartHire/CVPipeline"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "job_suggestion_engine printed WARNING in the last minute; inspect CloudWatch Logs"
  alarm_actions       = local.pipeline_alarm_actions
  ok_actions          = []
  treat_missing_data  = "notBreaching"
}

# ============================================
# Lambda: Candidate Ranking Engine
# ============================================

resource "aws_lambda_function" "candidate_ranking_engine" {
  function_name = "${var.project_name}-candidate-ranking-engine-${var.environment}"
  role          = aws_iam_role.pipeline.arn
  package_type  = "Image"
  image_uri     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/smarthire-candidate-ranking-engine:latest"

  lifecycle {
    ignore_changes = [image_uri]
  }
  timeout     = 90
  memory_size = 3008

  tracing_config {
    mode = "Active"
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.app_security_group_id]
  }

  environment {
    variables = {
      DYNAMODB_TABLE_NAME   = aws_dynamodb_table.application_tracking.name
      RDS_PROXY_ENDPOINT    = var.rds_proxy_endpoint
      RDS_DATABASE          = "smarthiredb"
      RDS_SECRET_ARN        = var.rds_secret_arn
      RDS_SSL_MODE          = "require"
      RDS_CONNECT_TIMEOUT   = "10"
      RANKING_ANN_POOL_SIZE = "10"
      FINAL_RANKING_COUNT   = "5"
      SCORING_VERSION       = "mvp-v1"
      ENABLE_PGVECTOR       = "true"
      OMP_NUM_THREADS       = "1"
      TRANSFORMERS_CACHE    = "/tmp"
      HF_HOME               = "/tmp/hf_home"
      APPSYNC_ENABLED       = tostring(var.appsync_enabled)
      APPSYNC_REGION        = data.aws_region.current.name
      APPSYNC_URL           = var.appsync_enabled ? aws_appsync_graphql_api.smart_matching[0].uris["GRAPHQL"] : ""
      ENABLE_AI_SKILL_SEMANTICS = var.enable_ai_skill_semantics ? "true" : "false"
    }
  }

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-candidate-ranking-engine-${var.environment}"
    Service = "cv-processing"
  })
}

resource "aws_cloudwatch_log_group" "candidate_ranking_engine" {
  name              = "/aws/lambda/${aws_lambda_function.candidate_ranking_engine.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.common_tags
}

resource "aws_cloudwatch_log_metric_filter" "candidate_ranking_engine_warnings" {
  count = var.enable_alarms && var.matching_pipeline_warning_log_alarms_enabled ? 1 : 0

  name           = "${var.project_name}-candidate-ranking-warnings-${var.environment}"
  pattern        = "WARNING"
  log_group_name = aws_cloudwatch_log_group.candidate_ranking_engine.name

  metric_transformation {
    name      = "CandidateRankingEngineWarningLines"
    namespace = "SmartHire/CVPipeline"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "candidate_ranking_engine_log_warnings" {
  count = var.enable_alarms && var.matching_pipeline_warning_log_alarms_enabled ? 1 : 0

  alarm_name          = "${var.project_name}-candidate-ranking-log-warnings-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CandidateRankingEngineWarningLines"
  namespace           = "SmartHire/CVPipeline"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "candidate_ranking_engine printed WARNING in the last minute; inspect CloudWatch Logs"
  alarm_actions       = local.pipeline_alarm_actions
  ok_actions          = []
  treat_missing_data  = "notBreaching"
}
