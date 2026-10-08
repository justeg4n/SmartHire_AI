resource "aws_sqs_queue" "cv_parse_dlq" {
  name                       = "${var.project_name}-cv-parse-dlq-${var.environment}"
  message_retention_seconds  = var.dlq_message_retention_seconds
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = var.visibility_timeout_seconds

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-cv-parse-dlq-${var.environment}"
    Service = "cv-processing"
  })
}

resource "aws_sqs_queue" "cv_parse" {
  name                       = "${var.project_name}-cv-parse-queue-${var.environment}"
  message_retention_seconds  = var.message_retention_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.cv_parse_dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-cv-parse-queue-${var.environment}"
    Service = "cv-processing"
  })
}
