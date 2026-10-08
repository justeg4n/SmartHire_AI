output "certificate_arn" {
  description = "ARN of the ACM certificate (us-east-1)"
  value       = aws_acm_certificate_validation.frontend_cert.certificate_arn
}

output "route53_zone_id" {
  description = "Route53 hosted zone ID"
  value       = data.aws_route53_zone.main.zone_id
}
