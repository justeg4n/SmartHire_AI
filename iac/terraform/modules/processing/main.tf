resource "aws_dynamodb_table" "application_tracking" {
  name         = "${var.project_name}-application-tracking-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-application-tracking-${var.environment}"
    Service = "cv-processing"
  })
}

# Legacy CV and JD parser resources have been removed as part of the consolidation to the new Hybrid Lambda Pipeline and Single Table Design.

# ============================================
# Shared IAM Role for Pipeline Lambdas
# (ingestion_trigger, cv_jd_processor)
# ============================================

resource "aws_iam_role" "pipeline" {
  name = "${var.project_name}-pipeline-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy_attachment" "pipeline_basic" {
  role       = aws_iam_role.pipeline.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "pipeline_vpc" {
  role       = aws_iam_role.pipeline.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "pipeline_access" {
  name = "pipeline-access"
  role = aws_iam_role.pipeline.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SQSAccess"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = var.cv_parse_queue_arn
      },
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:HeadObject"
        ]
        Resource = [
          "${var.raw_assets_bucket_arn}/*"

        ]
      },
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.application_tracking.arn,
          "${aws_dynamodb_table.application_tracking.arn}/index/*"
        ]
      },
      {
        Sid    = "TextractAccess"
        Effect = "Allow"
        Action = [
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection"
        ]
        Resource = "*"
      },
      {
        Sid    = "BedrockAccess"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = "*"
      },
      {
        Sid    = "ComprehendAccess"
        Effect = "Allow"
        Action = [
          "comprehend:DetectPiiEntities",
          "comprehend:DetectEntities"
        ]
        Resource = "*"
      },
      {
        Sid    = "LambdaInvoke"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          "arn:aws:lambda:*:*:function:${var.project_name}-cv-jd-processor-${var.environment}",
          "arn:aws:lambda:*:*:function:${var.project_name}-job-suggestion-engine-${var.environment}",
          "arn:aws:lambda:*:*:function:${var.project_name}-candidate-ranking-engine-${var.environment}"
        ]
      },
      {
        Sid    = "StepFunctionsStartExecution"
        Effect = "Allow"
        Action = [
          "states:StartExecution"
        ]
        Resource = [
          "arn:aws:states:*:*:stateMachine:${var.project_name}-cv-processing-${var.environment}"
        ]
      },
      {
        Sid    = "XRayWrite"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      {
        Sid    = "ReadRDSSecret"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.rds_secret_arn
      },
      {
        Sid      = "KMSDecrypt"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.rds_kms_key_arn
      },
      {
        Sid    = "AppSyncGraphQL"
        Effect = "Allow"
        Action = [
          "appsync:GraphQL"
        ]
        Resource = var.appsync_enabled ? [
          "arn:aws:appsync:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:apis/${aws_appsync_graphql_api.smart_matching[0].id}/*"
        ] : []
      }
    ]
  })
}

# ============================================
# IAM Role for AppSync CloudWatch Logs
# ============================================

resource "aws_iam_role" "appsync_logs" {
  count = var.appsync_enabled ? 1 : 0
  name  = "${var.project_name}-appsync-logs-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "appsync.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy_attachment" "appsync_logs" {
  count      = var.appsync_enabled ? 1 : 0
  role       = aws_iam_role.appsync_logs[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs"
}

# ============================================
# Lambda: Ingestion Trigger (Starter)
# ============================================

data "archive_file" "ingestion_trigger" {
  type        = "zip"
  source_file = "${path.root}/../lambda/ingestion_trigger/ingestion_trigger.py"
  output_path = "${path.root}/../lambda/ingestion_trigger.zip"
}

resource "aws_lambda_function" "ingestion_trigger" {
  filename         = data.archive_file.ingestion_trigger.output_path
  source_code_hash = data.archive_file.ingestion_trigger.output_base64sha256
  function_name    = "${var.project_name}-ingestion-trigger-${var.environment}"
  role             = aws_iam_role.pipeline.arn
  handler          = "ingestion_trigger.lambda_handler"
  runtime          = var.lambda_runtime
  timeout          = 30
  memory_size      = 256

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      VECTOR_OPS_FUNCTION_NAME = aws_lambda_function.cv_jd_processor.function_name
      STATE_MACHINE_ARN        = aws_sfn_state_machine.cv_processing.arn
      CV_BUCKET_NAME           = var.raw_assets_bucket_name
      DYNAMODB_TABLE_NAME      = aws_dynamodb_table.application_tracking.name
      MAX_FILE_SIZE_BYTES      = "52428800"
    }
  }

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-ingestion-trigger-${var.environment}"
    Service = "cv-processing"
  })
}

resource "aws_lambda_event_source_mapping" "ingestion_trigger_queue" {
  event_source_arn = var.cv_parse_queue_arn
  function_name    = aws_lambda_function.ingestion_trigger.arn
  enabled          = true
  batch_size       = var.lambda_batch_size
}

resource "aws_cloudwatch_log_group" "ingestion_trigger" {
  name              = "/aws/lambda/${aws_lambda_function.ingestion_trigger.function_name}"
  retention_in_days = var.log_retention_days

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-ingestion-trigger-logs-${var.environment}"
    Service = "cv-processing"
  })
}

# ============================================
# Lambda: CV/JD Processor (Merged: Textract + PII + Claude + Embed + Score)
# ============================================

resource "null_resource" "cv_jd_processor_build" {
  triggers = {
    source_hash = join("", [
      filemd5("${path.root}/../lambda/cv_jd_processor/cv_jd_processor.py"),
      filemd5("${path.root}/../lambda/cv_jd_processor/cjp_config.py"),
      filemd5("${path.root}/../lambda/cv_jd_processor/cjp_clients.py"),
      filemd5("${path.root}/../lambda/cv_jd_processor/cjp_engine_core.py"),
      filemd5("${path.root}/../lambda/cv_jd_processor/cjp_skill_canonical_ai.py"),
      filemd5("${path.root}/../lambda/cv_jd_processor/skill_alias_store.py"),
    ])
    requirements_hash = filemd5("${path.root}/../lambda/cv_jd_processor/requirements.txt")
  }

  provisioner "local-exec" {
    command = <<EOT
set -e
BUILD_DIR="${path.root}/../lambda/cv_jd_processor/.build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
python3 -m pip install -r "${path.root}/../lambda/cv_jd_processor/requirements.txt" -t "$BUILD_DIR"
for f in cv_jd_processor.py cjp_config.py cjp_clients.py cjp_engine_core.py cjp_skill_canonical_ai.py skill_alias_store.py; do
  cp "${path.root}/../lambda/cv_jd_processor/$f" "$BUILD_DIR/$f"
done
EOT
  }
}

data "archive_file" "cv_jd_processor" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/cv_jd_processor/.build"
  output_path = "${path.root}/../lambda/cv_jd_processor.zip"
  depends_on  = [null_resource.cv_jd_processor_build]
}

resource "aws_lambda_function" "cv_jd_processor" {
  filename         = data.archive_file.cv_jd_processor.output_path
  source_code_hash = data.archive_file.cv_jd_processor.output_base64sha256
  function_name    = "${var.project_name}-cv-jd-processor-${var.environment}"
  role             = aws_iam_role.pipeline.arn
  handler          = "cv_jd_processor.lambda_handler"
  runtime          = var.lambda_runtime
  timeout          = var.lambda_timeout_seconds
  memory_size      = var.lambda_memory_size

  # reserved_concurrent_executions: not set — account limit is only 10 total,
  # AWS requires ≥10 unreserved so reserved concurrency cannot be used here.
  # Throttling protection is handled by Haiku 4.5 high RPM quota (50 RPM) instead.

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.app_security_group_id]
  }

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      DYNAMODB_TABLE_NAME           = aws_dynamodb_table.application_tracking.name
      CV_BUCKET_NAME                = var.raw_assets_bucket_name
      COHERE_MODEL_ID               = "cohere.embed-english-v3"
      BEDROCK_MODEL_ID              = var.bedrock_model_id
      # Agent-1 CV extraction: Haiku 4.5 — 8192 output tokens + 50 RPM (10× Sonnet).
      # Solves both truncation on long CVs and request timeout issues.
      AGENT1_MODEL_ID               = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      PARSE_STATUS_TTL_DAYS         = tostring(var.parse_status_ttl_days)
      ENABLE_BLIND_SCREENING        = "true"
      ENABLE_INTERVIEW_GUIDE        = "false"
      ENABLE_CROSS_ENCODER          = "true"
      ENABLE_LLM_CONTACT_EXTRACTION = "true"
      CONTACT_EXTRACTION_MAX_CHARS  = "14000"
      CONTACT_EXTRACTION_MODEL_ID   = "apac.anthropic.claude-3-haiku-20240307-v1:0"
      RDS_PROXY_ENDPOINT            = var.rds_proxy_endpoint
      RDS_DATABASE                  = "smarthiredb"
      RDS_SECRET_ARN                = var.rds_secret_arn
      RDS_SSL_MODE                  = "require"
      RDS_CONNECT_TIMEOUT           = "8"
      # Skill consolidation — uses Haiku to avoid throttling Sonnet quota
      ENABLE_SKILL_CONSOLIDATION            = "true"
      SKILL_CONSOLIDATION_MODEL_ID          = "apac.anthropic.claude-3-haiku-20240307-v1:0"
      SKILL_CONSOLIDATION_MAX_OUTPUT_TOKENS = "2000"
    }
  }

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-cv-jd-processor-${var.environment}"
    Service = "cv-processing"
  })
}

resource "aws_cloudwatch_log_group" "cv_jd_processor" {
  name              = "/aws/lambda/${aws_lambda_function.cv_jd_processor.function_name}"
  retention_in_days = var.log_retention_days

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-cv-jd-processor-logs-${var.environment}"
    Service = "cv-processing"
  })
}

resource "aws_cloudwatch_log_metric_filter" "cv_jd_processor_warnings" {
  count = var.enable_alarms && var.matching_pipeline_warning_log_alarms_enabled ? 1 : 0

  name           = "${var.project_name}-cv-jd-processor-warnings-${var.environment}"
  pattern        = "WARNING"
  log_group_name = aws_cloudwatch_log_group.cv_jd_processor.name

  metric_transformation {
    name      = "CvJdProcessorWarningLines"
    namespace = "SmartHire/CVPipeline"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "cv_jd_processor_log_warnings" {
  count = var.enable_alarms && var.matching_pipeline_warning_log_alarms_enabled ? 1 : 0

  alarm_name          = "${var.project_name}-cv-jd-processor-log-warnings-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  metric_name         = "CvJdProcessorWarningLines"
  namespace           = "SmartHire/CVPipeline"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "cv_jd_processor emitted WARNING repeatedly (>=3 of last 5 minutes); inspect CloudWatch Logs"
  alarm_actions       = local.pipeline_alarm_actions
  ok_actions          = []
  treat_missing_data  = "notBreaching"
}

