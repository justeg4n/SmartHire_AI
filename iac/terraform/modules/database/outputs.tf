output "rds_endpoint" {
  description = "RDS endpoint address"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "RDS port"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

output "rds_instance_id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}

output "rds_resource_id" {
  description = "RDS DB resource ID used by IAM database authentication"
  value       = aws_db_instance.main.resource_id
}

output "rds_secret_arn" {
  description = "ARN of the RDS Secrets Manager secret"
  value       = aws_secretsmanager_secret.rds.arn
}

output "rds_secret_name" {
  description = "Name of the RDS Secrets Manager secret"
  value       = aws_secretsmanager_secret.rds.name
}

output "rds_secrets_kms_key_id" {
  description = "KMS Key ID for RDS secrets"
  value       = aws_kms_key.secrets.id
}

output "rds_secrets_kms_key_arn" {
  description = "KMS Key ARN for RDS secrets"
  value       = aws_kms_key.secrets.arn
}

output "bastion_public_ip" {
  description = "Elastic IP of the Bastion host"
  value       = aws_eip.bastion.public_ip
}

output "bastion_instance_id" {
  description = "EC2 instance ID of the Bastion host"
  value       = aws_instance.bastion.id
}

output "bastion_primary_network_interface_id" {
  description = "Primary network interface ID of the Bastion host"
  value       = aws_instance.bastion.primary_network_interface_id
}

# ============================================
# RDS Proxy Outputs
# ============================================

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint for Lambda connections"
  value       = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : ""
}

output "rds_proxy_arn" {
  description = "RDS Proxy ARN"
  value       = var.enable_rds_proxy ? aws_db_proxy.main[0].arn : ""
}

output "rds_instance_arn" {
  description = "RDS instance ARN for IAM auth"
  value       = aws_db_instance.main.arn
}

