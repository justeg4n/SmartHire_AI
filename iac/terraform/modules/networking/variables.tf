variable "project_name" {
  type        = string
  description = "Prefix for resource names"
}

variable "environment" {
  type        = string
  description = "Environment name (dev / staging / prod)"
}

variable "aws_region" {
  type        = string
  description = "Primary AWS region"
}

variable "common_tags" {
  type        = map(string)
  description = "Common tags applied to all resources"
}

variable "endpoint_single_subnet_dev" {
  type        = bool
  description = "If true in dev, place interface VPC endpoints in a single private DB subnet"
  default     = false
}

variable "endpoint_subnet_index" {
  type        = number
  description = "Index of private DB subnet used when endpoint_single_subnet_dev is enabled"
  default     = 0
}

variable "egress_mode" {
  type        = string
  description = "Egress architecture mode: endpoint_only, shared_bastion_nat, nat_gateway"
  default     = "endpoint_only"

  validation {
    condition     = contains(["endpoint_only", "shared_bastion_nat", "nat_gateway"], var.egress_mode)
    error_message = "egress_mode must be one of: endpoint_only, shared_bastion_nat, nat_gateway."
  }
}

variable "nat_gateway_az_count" {
  type        = number
  description = "Number of AZs/NAT Gateways to provision when egress_mode=nat_gateway"
  default     = 2
}

variable "enable_interface_endpoints" {
  type        = bool
  description = "Whether to provision interface VPC endpoints (Secrets Manager, Cognito, Bedrock Runtime)"
  default     = true
}
