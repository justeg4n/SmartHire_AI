# # ============================================
# # Brainboard Mock Terraform File
# # (Chỉ bao gồm các resources đang có sẵn trong IaC)
# # (Thêm Client giả lập, S3 trigger SQS, RDS trong Private, Thêm KMS & SecretsManager)
# # ============================================

# resource "aws_vpc" "main" {
#   cidr_block = "10.0.0.0/16"
#   tags       = { Name = "smarthire-vpc" }
# }

# # ------------------------------------------------------------------
# # CONTAINERS (Subnets)
# # ------------------------------------------------------------------
# resource "aws_subnet" "public" {
#   vpc_id     = aws_vpc.main.id
#   cidr_block = "10.0.1.0/24"
#   tags       = { Name = "smarthire-public-subnet" }
# }

# resource "aws_subnet" "private_db" {
#   vpc_id     = aws_vpc.main.id
#   cidr_block = "10.0.10.0/24"
#   tags       = { Name = "smarthire-private-db-subnet" }
# }

# # ------------------------------------------------------------------
# # CLIENT (Mock bằng 1 Data Source hoặc Resource bất kỳ để vẽ hình)
# # ------------------------------------------------------------------
# # Dùng aws_iam_user hoặc 1 resource dummy để tượng trưng cho "Client / Browser" 
# # và nối vào Route53 / Cognito.
# resource "aws_api_gateway_api_key" "client_browser" {
#   name = "Client-Browser"
# }

# # ------------------------------------------------------------------
# # FRONTEND DELIVERY (Route53 -> ACM -> CloudFront -> S3)
# # ------------------------------------------------------------------
# resource "aws_route53_zone" "main" {
#   name = "smarthire-ai.org"
# }

# resource "aws_acm_certificate" "cert" {
#   domain_name       = "smarthire-ai.org"
#   validation_method = "DNS"
# }

# resource "aws_cloudfront_distribution" "frontend" {
#   enabled = true
#   origin {
#     domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
#     origin_id   = aws_s3_bucket.frontend.id
#   }
#   viewer_certificate {
#     acm_certificate_arn = aws_acm_certificate.cert.arn
#   }

#   # Nối từ Client -> CloudFront
#   depends_on = [aws_api_gateway_api_key.client_browser]
# }

# resource "aws_route53_record" "frontend" {
#   zone_id = aws_route53_zone.main.zone_id
#   name    = "smarthire-ai.org"
#   type    = "A"
#   alias {
#     name                   = aws_cloudfront_distribution.frontend.domain_name
#     zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
#     evaluate_target_health = false
#   }
# }

# resource "aws_s3_bucket" "frontend" {
#   bucket = "smarthire-frontend-bucket"
# }

# # ------------------------------------------------------------------
# # THÔNG TIN BẢO MẬT (KMS & Secrets Manager)
# # ------------------------------------------------------------------
# resource "aws_kms_key" "secrets" {
#   description = "KMS key for Secrets Manager"
# }

# resource "aws_secretsmanager_secret" "rds" {
#   name       = "smarthire/rds/credentials"
#   kms_key_id = aws_kms_key.secrets.id
# }

# # ------------------------------------------------------------------
# # AUTHENTICATION
# # ------------------------------------------------------------------
# resource "aws_cognito_user_pool" "smarthire_pool" {
#   name = "smarthire-user-pool"

#   # Nối Client -> Cognito (dùng depends_on để vẽ line)
#   depends_on = [aws_api_gateway_api_key.client_browser]

#   # Nối từ User Pool đến 2 Lambdas Auth
#   lambda_config {
#     pre_sign_up       = aws_lambda_function.cognito_pre_signup.arn
#     post_confirmation = aws_lambda_function.cognito_sync.arn
#   }
# }

# resource "aws_cognito_identity_pool" "smarthire_identity_pool" {
#   identity_pool_name               = "smarthire-identity-pool"
#   allow_unauthenticated_identities = false
#   cognito_identity_providers {
#     provider_name = aws_cognito_user_pool.smarthire_pool.endpoint
#     client_id     = "dummy-client-id"
#   }
# }

# # ------------------------------------------------------------------
# # COMPUTE & AI WORKERS
# # ------------------------------------------------------------------
# # 1. Cognito Pre-Signup
# resource "aws_lambda_function" "cognito_pre_signup" {
#   function_name = "smarthire-cognito-pre-signup"
#   runtime       = "nodejs20.x"
#   handler       = "index.handler"
#   role          = "arn:aws:iam::123456789012:role/mock"
# }

# # 2. Cognito Sync (Đồng bộ RDS)
# resource "aws_lambda_function" "cognito_sync" {
#   function_name = "smarthire-cognito-rds-sync"
#   runtime       = "nodejs20.x"
#   handler       = "index.handler"
#   role          = "arn:aws:iam::123456789012:role/mock"

#   vpc_config {
#     subnet_ids         = [aws_subnet.private_db.id]
#     security_group_ids = ["sg-mock"]
#   }

#   environment {
#     variables = {
#       # explicit link to RDS and Secrets Manager cho Brainboard vẽ line
#       RDS_HOST      = aws_db_instance.main.address
#       SECRET_MANAGER = aws_secretsmanager_secret.rds.id
#     }
#   }
# }

# # 3. CV Parser Worker 
# resource "aws_lambda_function" "cv_parser" {
#   function_name = "smarthire-cv-parser"
#   runtime       = "python3.10"
#   handler       = "index.handler"
#   role          = "arn:aws:iam::123456789012:role/mock"

#   vpc_config {
#     subnet_ids         = [aws_subnet.private_db.id]
#     security_group_ids = ["sg-mock"]
#   }

#   environment {
#     variables = {
#       # explicit links for Brainboard to draw lines
#       DYNAMODB_TABLE_NAME = aws_dynamodb_table.cv_parse_results.name
#       CV_BUCKET_NAME      = aws_s3_bucket.cv_documents.bucket
#     }
#   }
# }

# # Nối SQS -> CV Parser Lambda
# resource "aws_lambda_event_source_mapping" "sqs_to_lambda" {
#   event_source_arn = aws_sqs_queue.cv_parse.arn
#   function_name    = aws_lambda_function.cv_parser.arn
# }

# # ------------------------------------------------------------------
# # DATA & STORAGE & QUEUES
# # ------------------------------------------------------------------
# resource "aws_s3_bucket" "cv_documents" {
#   bucket = "smarthire-cv-documents"
# }

# # Nối S3 -> SQS (S3 Trigger Event)
# resource "aws_s3_bucket_notification" "cv_bucket_notification" {
#   bucket = aws_s3_bucket.cv_documents.id
#   queue {
#     queue_arn     = aws_sqs_queue.cv_parse.arn
#     events        = ["s3:ObjectCreated:*"]
#   }
# }

# resource "aws_sqs_queue" "cv_parse" {
#   name = "smarthire-cv-parse-queue"
# }

# resource "aws_dynamodb_table" "cv_parse_results" {
#   name         = "smarthire-cv-parse-results"
#   billing_mode = "PAY_PER_REQUEST"
#   hash_key     = "candidateId"
#   attribute {
#     name = "candidateId"
#     type = "S"
#   }
# }

# # RDS đặt trong Private Subnet
# resource "aws_db_instance" "main" {
#   identifier        = "smarthire-postgres"
#   engine            = "postgres"
#   engine_version    = "15"
#   instance_class    = "db.t3.micro"
#   allocated_storage = 20

#   # Đặt DB chính xác vào visual subnet container private_db
#   subnet_id = aws_subnet.private_db.id
# }
