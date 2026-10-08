variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN from dns module"
}

variable "route53_zone_id" {
  type        = string
  description = "Route53 hosted zone ID from dns module"
}

variable "existing_waf_arn" {
  type    = string
  default = ""
}

variable "common_tags" {
  type = map(string)
}
