output "frontend_s3_bucket_name" {
  description = "Frontend S3 bucket name (used in CI/CD)"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name (frontend URL)"
  value       = aws_cloudfront_distribution.frontend.domain_name
}
