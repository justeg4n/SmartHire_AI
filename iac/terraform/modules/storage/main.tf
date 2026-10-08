resource "aws_s3_bucket" "raw_assets" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = merge(var.common_tags, {
    Name    = var.bucket_name
    Service = "raw-assets"
  })
}

resource "aws_s3_bucket_public_access_block" "raw_assets" {
  bucket = aws_s3_bucket.raw_assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "raw_assets" {
  bucket = aws_s3_bucket.raw_assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag", "x-amz-server-side-encryption"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_versioning" "raw_assets" {
  bucket = aws_s3_bucket.raw_assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_assets" {
  bucket = aws_s3_bucket.raw_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = var.sse_algorithm
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "raw_assets" {
  bucket = aws_s3_bucket.raw_assets.id

  rule {
    id     = "expire-cv-objects"
    status = "Enabled"

    filter {
      prefix = var.cv_object_prefix
    }

    expiration {
      days = var.object_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_retention_days
    }
  }

  rule {
    id     = "expire-jd-objects"
    status = "Enabled"

    filter {
      prefix = var.jd_object_prefix
    }

    expiration {
      days = var.object_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_retention_days
    }
  }
}
