variable "bucket_name" {
  description = "Name of the unified raw assets S3 bucket"
  type        = string
}

variable "cv_object_prefix" {
  description = "Object key prefix for candidate CV files"
  type        = string
}

variable "jd_object_prefix" {
  description = "Object key prefix for JD files"
  type        = string
}

variable "object_retention_days" {
  description = "Days to retain objects before expiration"
  type        = number
}

variable "noncurrent_retention_days" {
  description = "Days to retain noncurrent object versions"
  type        = number
}

variable "sse_algorithm" {
  description = "S3 server-side encryption algorithm"
  type        = string
  default     = "AES256"
}

variable "force_destroy" {
  description = "Allow bucket deletion even when objects exist"
  type        = bool
  default     = false
}

variable "common_tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
}
