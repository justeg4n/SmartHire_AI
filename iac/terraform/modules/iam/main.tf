data "aws_caller_identity" "current" {}

# ============================================
# IAM Groups for different service layers
# ============================================

resource "aws_iam_group" "ai_group" {
  name = "${var.project_name}-ai-group-${var.environment}"
  path = "/services/"
}

resource "aws_iam_group" "frontend_group" {
  name = "${var.project_name}-frontend-group-${var.environment}"
  path = "/services/"
}

resource "aws_iam_group" "backend_group" {
  name = "${var.project_name}-backend-group-${var.environment}"
  path = "/services/"
}

resource "aws_iam_group_policy" "ai_policy" {
  name  = "${var.project_name}-ai-group-${var.environment}-policy"
  group = aws_iam_group.ai_group.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SageMakerAccess"
        Effect   = "Allow"
        Action   = ["sagemaker:*"]
        Resource = "*"
      },
      {
        Sid      = "BedrockAccess"
        Effect   = "Allow"
        Action   = ["bedrock:*"]
        Resource = "*"
      },
      {
        Sid    = "LambdaAccess"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction",
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction",
          "lambda:CreateFunction"
        ]
        Resource = "arn:aws:lambda:${var.aws_region}:*:function:${var.project_name}-ai-*"
      },
      {
        Sid    = "S3AccessForModels"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-ai-models*",
          "arn:aws:s3:::${var.project_name}-ai-models*/*"
        ]
      },
      {
        Sid      = "TranscribeAccess"
        Effect   = "Allow"
        Action   = ["transcribe:*"]
        Resource = "*"
      },
      {
        Sid      = "PollyAccess"
        Effect   = "Allow"
        Action   = ["polly:*"]
        Resource = "*"
      },
      {
        Sid      = "RekognitionAccess"
        Effect   = "Allow"
        Action   = ["rekognition:*"]
        Resource = "*"
      },
      {
        Sid    = "IAMAccessKeyManagement"
        Effect = "Allow"
        Action = [
          "iam:CreateAccessKey",
          "iam:ListAccessKeys",
          "iam:DeleteAccessKey",
          "iam:UpdateAccessKey",
          "iam:GetUser",
          "iam:ListUsers"
        ]
        Resource = "*"
      },
      {
        Sid    = "SecurityAudit"
        Effect = "Allow"
        Action = [
          "access-analyzer:*",
          "acm:Describe*",
          "acm:List*",
          "apigateway:Get",
          "athena:List*",
          "cloudtrail:Describe*",
          "cloudtrail:List*",
          "cloudtrail:LookupEvents",
          "config:Describe*",
          "config:Get*",
          "config:List*",
          "ec2:Describe*",
          "iam:Get*",
          "iam:List*",
          "kms:Describe*",
          "kms:Get*",
          "kms:List*",
          "logs:Describe*",
          "s3:Get*",
          "s3:List*"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudTrailFullAccess"
        Effect = "Allow"
        Action = [
          "cloudtrail:*",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = "*"
      },
      {
        Sid      = "IAMFullAccess"
        Effect   = "Allow"
        Action   = ["iam:*"]
        Resource = "*"
      },
      {
        Sid    = "WAFConsoleFullAccess"
        Effect = "Allow"
        Action = [
          "waf:*",
          "wafv2:*",
          "shield:*"
        ]
        Resource = "*"
      },
      {
        Sid    = "CognitoPowerUser"
        Effect = "Allow"
        Action = [
          "cognito-idp:*",
          "cognito-identity:*"
        ]
        Resource = "*"
      },
      {
        Sid    = "KMSPowerUser"
        Effect = "Allow"
        Action = [
          "kms:CreateGrant",
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:GetPublicKey",
          "kms:ReEncrypt",
          "kms:CreateKey",
          "kms:CreateAlias",
          "kms:DeleteAlias",
          "kms:UpdateAlias",
          "kms:List*"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/sagemaker/*"
      }
    ]
  })
}

resource "aws_iam_group_policy" "frontend_policy" {
  name  = "${var.project_name}-frontend-group-${var.environment}-policy"
  group = aws_iam_group.frontend_group.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "S3FrontendDeployment"
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = "*"
      },
      {
        Sid      = "CloudFrontInvalidation"
        Effect   = "Allow"
        Action   = ["cloudfront:*"]
        Resource = "*"
      },
      {
        Sid    = "CognitoAccess"
        Effect = "Allow"
        Action = [
          "cognito-idp:DescribeUserPool",
          "cognito-idp:DescribeUserPoolClient",
          "cognito-idp:ListUserPools"
        ]
        Resource = "*"
      },
      {
        Sid      = "APIGatewayAccess"
        Effect   = "Allow"
        Action   = ["apigateway:GET"]
        Resource = "arn:aws:apigateway:${var.aws_region}::*"
      }
    ]
  })
}

resource "aws_iam_group_policy" "backend_policy" {
  name  = "${var.project_name}-backend-group-${var.environment}-policy"
  group = aws_iam_group.backend_group.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "LambdaManagement"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = "*"
      },
      {
        Sid      = "APIGatewayManagement"
        Effect   = "Allow"
        Action   = ["apigateway:*"]
        Resource = "arn:aws:apigateway:${var.aws_region}::*"
      },
      {
        Sid      = "RDSAccess"
        Effect   = "Allow"
        Action   = ["rds:*"]
        Resource = "*"
      },
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable",
          "dynamodb:DescribeTable",
          "dynamodb:ListTables",
          "dynamodb:UpdateTable",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-*"
      },
      {
        Sid    = "SecretsManagerAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:${var.project_name}/*"
      },
      {
        Sid      = "SQSAccess"
        Effect   = "Allow"
        Action   = ["sqs:*"]
        Resource = "*"
      },
      {
        Sid    = "LambdaSQSTrigger"
        Effect = "Allow"
        Action = [
          "lambda:CreateEventSourceMapping",
          "lambda:DeleteEventSourceMapping",
          "lambda:GetEventSourceMapping",
          "lambda:ListEventSourceMappings",
          "lambda:UpdateEventSourceMapping"
        ]
        Resource = "*"
      },
      {
        Sid      = "SNSAccess"
        Effect   = "Allow"
        Action   = ["sns:*"]
        Resource = "*"
      },
      {
        Sid      = "EventBridgeAccess"
        Effect   = "Allow"
        Action   = ["events:*"]
        Resource = "*"
      },
      {
        Sid      = "StepFunctionsAccess"
        Effect   = "Allow"
        Action   = ["states:*"]
        Resource = "*"
      },
      {
        Sid    = "KMSDecrypt"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey",
          "kms:CreateGrant"
        ]
        Resource = "*"
      },
      {
        Sid      = "CloudFormationAccess"
        Effect   = "Allow"
        Action   = ["cloudformation:*"]
        Resource = "*"
      },
      {
        Sid      = "SESAccess"
        Effect   = "Allow"
        Action   = ["ses:*"]
        Resource = "*"
      },
      {
        Sid    = "DocumentProcessingAndAI"
        Effect = "Allow"
        Action = [
          "s3:*",
          "textract:*",
          "bedrock:*"
        ]
        Resource = "*"
      },
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = "*"
      },
      {
        Sid      = "CloudWatchMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:*"]
        Resource = "*"
      },
      {
        Sid      = "CognitoFullAccess"
        Effect   = "Allow"
        Action   = ["cognito-idp:*"]
        Resource = var.cognito_user_pool_arn
      },
      {
        Sid    = "CognitoDescribeAccess"
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUserPools",
          "cognito-idp:DescribeUserPool",
          "cognito-idp:DescribeUserPoolClient"
        ]
        Resource = "*"
      },
      {
        Sid      = "EC2FullAccess"
        Effect   = "Allow"
        Action   = ["ec2:*"]
        Resource = "*"
      },
      {
        Sid      = "EC2SerialConsoleAccess"
        Effect   = "Allow"
        Action   = ["ec2-instance-connect:SendSerialConsoleSSHPublicKey"]
        Resource = "*"
      },
      {
        Sid    = "IAMRoleManagement"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:UpdateAccessKey",
          "iam:GetRole",
          "iam:ListUsers",
          "iam:ListRoles",
          "iam:CreateOpenIDConnectProvider",
          "iam:GetOpenIDConnectProvider",
          "iam:CreateAccessKey",
          "iam:DeleteAccessKey",
          "iam:ListAccessKeys",
          "iam:GetUser",
          "iam:DeleteOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviders",
          "iam:UpdateAssumeRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:CreatePolicy",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicy",
          "iam:DeletePolicyVersion",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicies",
          "iam:ListPolicyVersions",
          "iam:PassRole",
          "iam:ListRolePolicies"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================
# GitHub OIDC for CI/CD Deployment
# ============================================

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

resource "aws_iam_role" "github_actions_frontend" {
  name = "${var.project_name}-github-actions-frontend-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
          }
        }
      }
    ]
  })

  tags = var.common_tags
}

resource "aws_iam_policy" "frontend_deploy_policy" {
  name        = "${var.project_name}-frontend-deploy-policy-${var.environment}"
  description = "Policy allowing GitHub Actions to deploy to S3 and invalidate CloudFront caches"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3UploadAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.frontend_s3_bucket_name}",
          "arn:aws:s3:::${var.frontend_s3_bucket_name}/*"
        ]
      },
      {
        Sid    = "CloudFrontInvalidationAccess"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
          "cloudfront:ListInvalidations"
        ]
        Resource = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${var.cloudfront_distribution_id}"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_deploy_attach" {
  role       = aws_iam_role.github_actions_frontend.name
  policy_arn = aws_iam_policy.frontend_deploy_policy.arn
}
