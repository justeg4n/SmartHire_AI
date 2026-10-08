# ============================================
# AWS Provider Configuration
# ============================================

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "local" {
    # Store state file locally in the current directory
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region
}

# Required for CloudFront ACM certificates and WAF Global
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
