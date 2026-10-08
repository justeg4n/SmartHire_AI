# SmartHire IAC - Example Terraform Variables
# Copy this file to terraform.tfvars and update values as needed

project_name = "smarthire"
environment  = "dev"
aws_region   = "ap-southeast-1"

# Cognito configuration
cognito_password_min_length = 8

# Service enablement flags
enable_ai_services       = true
enable_frontend_services = true
enable_backend_services  = true

# RDS Configuration
rds_master_username   = "smarthire_admin"
rds_master_password   = "CHANGE_ME_USE_A_STRONG_PASSWORD"  # Set via TF_VAR_rds_master_password
rds_instance_class    = "db.t3.micro"        # dev; Prod dùng db.m5.large
rds_allocated_storage = 20                   # GB

# Example for production environment:
# rds_instance_class    = "db.m5.large"
# rds_allocated_storage = 100
