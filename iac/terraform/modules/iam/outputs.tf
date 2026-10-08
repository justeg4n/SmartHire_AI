output "ai_group_arn" {
  description = "ARN of AI Services IAM Group"
  value       = aws_iam_group.ai_group.arn
}

output "ai_group_name" {
  description = "Name of AI Services IAM Group"
  value       = aws_iam_group.ai_group.name
}

output "frontend_group_arn" {
  description = "ARN of Frontend Services IAM Group"
  value       = aws_iam_group.frontend_group.arn
}

output "frontend_group_name" {
  description = "Name of Frontend Services IAM Group"
  value       = aws_iam_group.frontend_group.name
}

output "backend_group_arn" {
  description = "ARN of Backend Services IAM Group"
  value       = aws_iam_group.backend_group.arn
}

output "backend_group_name" {
  description = "Name of Backend Services IAM Group"
  value       = aws_iam_group.backend_group.name
}
