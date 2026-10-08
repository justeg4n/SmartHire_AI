output "application_tracking_table_name" {
  description = "DynamoDB table name for Single Table Application Tracking"
  value       = aws_dynamodb_table.application_tracking.name
}

output "application_tracking_table_arn" {
  description = "DynamoDB table ARN for Single Table Application Tracking"
  value       = aws_dynamodb_table.application_tracking.arn
}

# ============================================
# Pipeline Lambda Outputs
# ============================================

output "ingestion_trigger_function_name" {
  description = "Name of the Ingestion Trigger Lambda"
  value       = aws_lambda_function.ingestion_trigger.function_name
}

output "ingestion_trigger_function_arn" {
  description = "ARN of the Ingestion Trigger Lambda"
  value       = aws_lambda_function.ingestion_trigger.arn
}

output "cv_jd_processor_function_name" {
  description = "Name of the CV/JD Processor Lambda"
  value       = aws_lambda_function.cv_jd_processor.function_name
}

output "cv_jd_processor_function_arn" {
  description = "ARN of the CV/JD Processor Lambda"
  value       = aws_lambda_function.cv_jd_processor.arn
}

output "cv_processing_state_machine_arn" {
  description = "ARN of CV processing Step Functions state machine"
  value       = aws_sfn_state_machine.cv_processing.arn
}

output "job_suggestion_engine_function_name" {
  description = "Name of the Job Suggestion Engine Lambda"
  value       = aws_lambda_function.job_suggestion_engine.function_name
}

output "job_suggestion_engine_function_arn" {
  description = "ARN of the Job Suggestion Engine Lambda"
  value       = aws_lambda_function.job_suggestion_engine.arn
}

output "candidate_ranking_engine_function_name" {
  description = "Name of the Candidate Ranking Engine Lambda"
  value       = aws_lambda_function.candidate_ranking_engine.function_name
}

output "candidate_ranking_engine_function_arn" {
  description = "ARN of the Candidate Ranking Engine Lambda"
  value       = aws_lambda_function.candidate_ranking_engine.arn
}

output "cv_pipeline_alarms_sns_topic_arn" {
  description = "SNS topic ARN for CV pipeline CloudWatch alarms (null if disabled or no email configured)"
  value       = length(aws_sns_topic.cv_pipeline_alarms) > 0 ? aws_sns_topic.cv_pipeline_alarms[0].arn : null
}

output "appsync_api_id" {
  description = "AppSync API ID for Smart Matching real-time updates"
  value       = var.appsync_enabled ? aws_appsync_graphql_api.smart_matching[0].id : null
}

output "appsync_graphql_url" {
  description = "AppSync GraphQL endpoint URL"
  value       = var.appsync_enabled ? aws_appsync_graphql_api.smart_matching[0].uris["GRAPHQL"] : null
}

output "appsync_realtime_url" {
  description = "AppSync real-time endpoint URL"
  value       = var.appsync_enabled ? aws_appsync_graphql_api.smart_matching[0].uris["REALTIME"] : null
}

