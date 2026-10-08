# ============================================
# Step Functions: CV Processing Orchestration
# ============================================

resource "aws_iam_role" "cv_processing_sfn" {
  name = "${var.project_name}-cv-processing-sfn-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "cv_processing_sfn_access" {
  name = "cv-processing-sfn-access"
  role = aws_iam_role.cv_processing_sfn.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokePipelineLambdas"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.cv_jd_processor.arn,
          aws_lambda_function.job_suggestion_engine.arn,
          aws_lambda_function.candidate_ranking_engine.arn
        ]
      },
      # Single statement + Resource "*" per https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html
      {
        Sid    = "CloudWatchLogsForSfn"
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:CreateLogStream",
          "logs:DeleteLogDelivery",
          "logs:DescribeLogGroups",
          "logs:DescribeResourcePolicies",
          "logs:GetLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutLogEvents",
          "logs:PutResourcePolicy",
          "logs:UpdateLogDelivery"
        ]
        Resource = "*"
      },
      {
        Sid    = "XRayWrite"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })
}

# Prefix /aws/vendedlogs/states avoids CloudWatch account resource-policy size issues (SFN logging)
resource "aws_cloudwatch_log_group" "cv_processing" {
  name              = "/aws/vendedlogs/states/${var.project_name}-cv-processing-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = var.common_tags
}

resource "aws_sfn_state_machine" "cv_processing" {
  name     = "${var.project_name}-cv-processing-${var.environment}"
  role_arn = aws_iam_role.cv_processing_sfn.arn

  definition = templatefile("${path.module}/state_machine_cv_processing.asl.json", {
    cv_jd_processor_arn          = aws_lambda_function.cv_jd_processor.arn
    job_suggestion_engine_arn    = aws_lambda_function.job_suggestion_engine.arn
    candidate_ranking_engine_arn = aws_lambda_function.candidate_ranking_engine.arn
  })

  tracing_configuration {
    enabled = true
  }

  logging_configuration {
    level                  = "ERROR"
    include_execution_data = false
    log_destination        = "${aws_cloudwatch_log_group.cv_processing.arn}:*"
  }

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-cv-processing-${var.environment}"
    Service = "cv-processing"
  })
}

# ============================================
# SNS → email for CloudWatch alarms
# ============================================

resource "aws_sns_topic" "cv_pipeline_alarms" {
  count = var.enable_alarms && var.alarm_notification_email != "" ? 1 : 0
  name  = "${var.project_name}-cv-pipeline-alarms-${var.environment}"
  tags  = merge(var.common_tags, { Purpose = "cloudwatch-alarms" })
}

resource "aws_sns_topic_subscription" "cv_pipeline_alarms_email" {
  count     = var.enable_alarms && var.alarm_notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.cv_pipeline_alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_notification_email
}

locals {
  pipeline_alarm_actions = concat(var.alarm_actions, aws_sns_topic.cv_pipeline_alarms[*].arn)
}

# ============================================
# CloudWatch Alarms (optional)
# ============================================

resource "aws_cloudwatch_metric_alarm" "cv_parse_queue_depth" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-cv-parse-queue-depth-${var.environment}"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 1
  threshold           = var.queue_depth_alarm_threshold
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    QueueName = var.cv_parse_queue_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "cv_jd_processor_errors" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-cv-jd-processor-errors-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.cv_jd_processor.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "cv_jd_processor_throttles" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-cv-jd-processor-throttles-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.cv_jd_processor.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "cv_jd_processor_duration_p95" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-cv-jd-processor-duration-p95-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 1
  threshold           = var.cv_jd_processor_duration_p95_alarm_threshold_ms
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.cv_jd_processor.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "job_suggestion_engine_errors" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-job-suggestion-engine-errors-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.job_suggestion_engine.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "job_suggestion_engine_throttles" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-job-suggestion-engine-throttles-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.job_suggestion_engine.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "job_suggestion_engine_duration_p95" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-job-suggestion-engine-duration-p95-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 1
  threshold           = var.job_suggestion_engine_duration_p95_alarm_threshold_ms
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.job_suggestion_engine.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "candidate_ranking_engine_errors" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-candidate-ranking-engine-errors-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.candidate_ranking_engine.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "candidate_ranking_engine_throttles" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-candidate-ranking-engine-throttles-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.candidate_ranking_engine.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "candidate_ranking_engine_duration_p95" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-candidate-ranking-engine-duration-p95-${var.environment}"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 1
  threshold           = var.candidate_ranking_engine_duration_p95_alarm_threshold_ms
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    FunctionName = aws_lambda_function.candidate_ranking_engine.function_name
  }

  alarm_actions             = local.pipeline_alarm_actions
  ok_actions                = []
  insufficient_data_actions = []
  treat_missing_data        = "notBreaching"
}

