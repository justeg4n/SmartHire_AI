variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "message_retention_seconds" {
  description = "Retention period for main queue messages"
  type        = number
}

variable "dlq_message_retention_seconds" {
  description = "Retention period for DLQ messages"
  type        = number
}

variable "visibility_timeout_seconds" {
  description = "Visibility timeout for queue messages"
  type        = number
}

variable "max_receive_count" {
  description = "Maximum receive attempts before sending to DLQ"
  type        = number
}

variable "common_tags" {
  type = map(string)
}
