# ============================================
# Cognito User Pool
# ============================================

locals {
  cognito_pre_signup_source_dir        = "${path.module}/../../../lambda/cognito_pre_signup"
  cognito_pre_signup_zip_path          = "${path.module}/../../../lambda/cognito_pre_signup.zip"
  cognito_post_confirmation_source_dir = "${path.module}/../../../lambda/cognito_post_confirmation"
  cognito_post_confirmation_zip_path   = "${path.module}/../../../lambda/cognito_post_confirmation.zip"
}

resource "aws_cognito_user_pool" "smarthire_pool" {
  name = "${var.project_name}-user-pool-${var.environment}"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = var.cognito_password_min_length
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true
  }

  schema {
    attribute_data_type = "String"
    name                = "role"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 20
    }
  }

  lambda_config {
    pre_sign_up       = aws_lambda_function.cognito_pre_signup.arn
    post_confirmation = aws_lambda_function.cognito_sync.arn
  }
}

resource "aws_cognito_user_pool_client" "smarthire_frontend_client" {
  name         = "${var.project_name}-frontend-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.smarthire_pool.id

  supported_identity_providers         = ["COGNITO", "Google"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile", "aws.cognito.signin.user.admin"]
  callback_urls = var.environment == "dev" ? [
    "http://localhost:5173/",
    "http://localhost:5173/login",
    "https://smarthire-ai.org/",
    "https://smarthire-ai.org/login",
    "https://www.smarthire-ai.org/",
    "https://www.smarthire-ai.org/login"
    ] : [
    "https://smarthire-ai.org/",
    "https://smarthire-ai.org/login",
    "https://www.smarthire-ai.org/",
    "https://www.smarthire-ai.org/login"
  ]
  logout_urls = var.environment == "dev" ? [
    "http://localhost:5173/",
    "http://localhost:5173/login",
    "https://smarthire-ai.org/",
    "https://www.smarthire-ai.org/"
    ] : [
    "https://smarthire-ai.org/",
    "https://www.smarthire-ai.org/"
  ]

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]

  read_attributes  = ["email", "name", "custom:role"]
  write_attributes = ["email", "name", "custom:role"]

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 24
  id_token_validity      = 24
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "smarthire_domain" {
  domain       = "${var.project_name}-auth-${var.environment}"
  user_pool_id = aws_cognito_user_pool.smarthire_pool.id
}

resource "aws_cognito_identity_provider" "google_provider" {
  user_pool_id  = aws_cognito_user_pool.smarthire_pool.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    authorize_scopes = "email openid profile"
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
  }
}

# ============================================
# Lambda: Cognito PreSignUp -> Identity Linking
# ============================================

resource "aws_iam_role" "cognito_pre_signup" {
  name = "${var.project_name}-cognito-pre-signup-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy_attachment" "cognito_pre_signup_basic" {
  role       = aws_iam_role.cognito_pre_signup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "cognito_pre_signup_linking" {
  name = "cognito-pre-signup-linking"
  role = aws_iam_role.cognito_pre_signup.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminLinkProviderForUser"
        ]
        Resource = aws_cognito_user_pool.smarthire_pool.arn
      }
    ]
  })
}

resource "null_resource" "cognito_pre_signup_build" {
  triggers = {
    package_json = filemd5("${local.cognito_pre_signup_source_dir}/package.json")
    index_js     = filemd5("${local.cognito_pre_signup_source_dir}/index.js")
  }

  provisioner "local-exec" {
    command = "cd ${local.cognito_pre_signup_source_dir} && npm install --production"
  }
}

data "archive_file" "cognito_pre_signup" {
  type        = "zip"
  source_dir  = local.cognito_pre_signup_source_dir
  output_path = local.cognito_pre_signup_zip_path

  depends_on = [null_resource.cognito_pre_signup_build]
}

resource "aws_lambda_function" "cognito_pre_signup" {
  filename         = data.archive_file.cognito_pre_signup.output_path
  source_code_hash = data.archive_file.cognito_pre_signup.output_base64sha256
  function_name    = "${var.project_name}-cognito-pre-signup-${var.environment}"
  role             = aws_iam_role.cognito_pre_signup.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 15
  memory_size      = 128

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-cognito-pre-signup-${var.environment}"
  })
}

resource "aws_lambda_permission" "cognito_invoke_pre_signup" {
  statement_id  = "AllowCognitoInvokePreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.smarthire_pool.arn
}

# ============================================
# Lambda: Cognito PostConfirmation -> RDS Sync
# ============================================

resource "aws_iam_role" "cognito_sync" {
  name = "${var.project_name}-cognito-sync-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy_attachment" "cognito_sync_vpc" {
  role       = aws_iam_role.cognito_sync.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "cognito_sync_secrets" {
  name = "read-rds-secret"
  role = aws_iam_role.cognito_sync.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.rds_secret_arn
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.kms_key_arn
      }
    ]
  })
}

resource "null_resource" "cognito_sync_build" {
  triggers = {
    package_json = filemd5("${local.cognito_post_confirmation_source_dir}/package.json")
    index_js     = filemd5("${local.cognito_post_confirmation_source_dir}/index.js")
  }

  provisioner "local-exec" {
    command = "cd ${local.cognito_post_confirmation_source_dir} && npm install --production"
  }
}

data "archive_file" "cognito_sync" {
  type        = "zip"
  source_dir  = local.cognito_post_confirmation_source_dir
  output_path = local.cognito_post_confirmation_zip_path

  depends_on = [null_resource.cognito_sync_build]
}

resource "aws_lambda_function" "cognito_sync" {
  filename         = data.archive_file.cognito_sync.output_path
  source_code_hash = data.archive_file.cognito_sync.output_base64sha256
  function_name    = "${var.project_name}-cognito-rds-sync-${var.environment}"
  role             = aws_iam_role.cognito_sync.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 128

  vpc_config {
    subnet_ids         = var.private_db_subnet_ids
    security_group_ids = [var.app_security_group_id]
  }

  environment {
    variables = {
      SECRET_NAME = var.rds_secret_name
    }
  }

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-cognito-rds-sync-${var.environment}"
  })
}

resource "aws_lambda_permission" "cognito_invoke_sync" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_sync.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.smarthire_pool.arn
}

# ============================================
# Cognito Identity Pool
# ============================================

resource "aws_cognito_identity_pool" "smarthire_identity_pool" {
  identity_pool_name               = "${var.project_name}-identity-pool-${var.environment}"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.smarthire_frontend_client.id
    provider_name           = aws_cognito_user_pool.smarthire_pool.endpoint
    server_side_token_check = false
  }
}

resource "aws_iam_role" "cognito_auth_role" {
  name = "${var.project_name}-identity-auth-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        },
        Action = "sts:AssumeRoleWithWebIdentity",
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.smarthire_identity_pool.id
          },
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })
  tags = var.common_tags
}

resource "aws_iam_role_policy" "cognito_auth_s3_policy" {
  name = "${var.project_name}-auth-s3-policy-${var.environment}"
  role = aws_iam_role.cognito_auth_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = [
          "${var.raw_assets_bucket_arn}/candidates/*",
          "${var.raw_assets_bucket_arn}/jobs/*"
        ]
      },
      # GetObject/ListBucket: keys use Cognito User Pool sub; IAM only exposes Identity Pool :sub.
      # Scoped IAM per owner requires identity-id paths + aligned pipeline, or presigned URLs (API/Lambda).
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = [
          "${var.raw_assets_bucket_arn}/candidates/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          var.raw_assets_bucket_arn
        ]
        Condition = {
          StringLike = {
            "s3:prefix" = [
              "candidates/*"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_iam_role" "cognito_unauth_role" {
  name = "${var.project_name}-identity-unauth-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        },
        Action = "sts:AssumeRoleWithWebIdentity",
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.smarthire_identity_pool.id
          },
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "unauthenticated"
          }
        }
      }
    ]
  })
  tags = var.common_tags
}

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.smarthire_identity_pool.id

  roles = {
    "authenticated"   = aws_iam_role.cognito_auth_role.arn
    "unauthenticated" = aws_iam_role.cognito_unauth_role.arn
  }
}
