output "cv_parse_queue_name" {
  description = "CV parse queue name"
  value       = aws_sqs_queue.cv_parse.name
}

output "cv_parse_queue_url" {
  description = "CV parse queue URL"
  value       = aws_sqs_queue.cv_parse.url
}

output "cv_parse_queue_arn" {
  description = "CV parse queue ARN"
  value       = aws_sqs_queue.cv_parse.arn
}

output "cv_parse_dlq_name" {
  description = "CV parse DLQ name"
  value       = aws_sqs_queue.cv_parse_dlq.name
}

output "cv_parse_dlq_url" {
  description = "CV parse DLQ URL"
  value       = aws_sqs_queue.cv_parse_dlq.url
}

output "cv_parse_dlq_arn" {
  description = "CV parse DLQ ARN"
  value       = aws_sqs_queue.cv_parse_dlq.arn
}
