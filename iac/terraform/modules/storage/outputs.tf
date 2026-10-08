output "bucket_id" {
  description = "ID of the raw assets S3 bucket"
  value       = aws_s3_bucket.raw_assets.id
}

output "bucket_name" {
  description = "Name of the raw assets S3 bucket"
  value       = aws_s3_bucket.raw_assets.bucket
}

output "bucket_arn" {
  description = "ARN of the raw assets S3 bucket"
  value       = aws_s3_bucket.raw_assets.arn
}
