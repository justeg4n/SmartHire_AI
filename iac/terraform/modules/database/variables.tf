variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type        = string
  description = "VPC ID from networking module"
}

variable "private_db_subnet_ids" {
  type        = list(string)
  description = "Private DB subnet IDs from networking module"
}

variable "private_db_subnet_cidrs" {
  type        = list(string)
  description = "Private DB subnet CIDR blocks from networking module"
  default     = []
}

variable "rds_security_group_id" {
  type        = string
  description = "RDS security group ID from networking module"
}

variable "public_subnet_id" {
  type        = string
  description = "First public subnet ID for Bastion host"
}

variable "rds_master_username" {
  type = string
}

variable "rds_master_password" {
  type      = string
  sensitive = true
}

variable "rds_instance_class" {
  type = string
}

variable "rds_allocated_storage" {
  type = number
}

variable "bastion_key_pair" {
  type = string
}

variable "bastion_ssh_cidr" {
  type = string
}

variable "enable_bastion_nat_instance" {
  description = "Enable bastion host to act as NAT instance for private subnets"
  type        = bool
  default     = false
}

variable "common_tags" {
  type = map(string)
}

variable "enable_rds_proxy" {
  description = "Enable RDS Proxy for Lambda connection pooling"
  type        = bool
  default     = false
}

variable "app_security_group_id" {
  description = "Security group ID for Lambda/App (needed for RDS Proxy ingress rules)"
  type        = string
  default     = ""
}

