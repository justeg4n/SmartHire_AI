data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_ecr_repository" "job_suggestion" {
  name                 = "smarthire-job-suggestion-engine"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.common_tags
}

resource "aws_ecr_repository" "candidate_ranking" {
  name                 = "smarthire-candidate-ranking-engine"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.common_tags
}

# Bootstrap: Push placeholder images to both repos to satisfy Lambda CreateFunction
resource "null_resource" "lambda_bootstrap" {
  triggers = {
    job_suggestion_id    = aws_ecr_repository.job_suggestion.id
    candidate_ranking_id = aws_ecr_repository.candidate_ranking.id
  }

  depends_on = [
    aws_ecr_repository.job_suggestion,
    aws_ecr_repository.candidate_ranking
  ]

  provisioner "local-exec" {
    command = <<EOT
      aws ecr get-login-password --region ${data.aws_region.current.name} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com
      
      # Kéo bản linux/amd64 để đảm bảo chạy được trên Lambda
      docker pull --platform linux/amd64 public.ecr.aws/lambda/python:3.12
      
      # Mồi cho Job Suggestion
      docker tag public.ecr.aws/lambda/python:3.12 ${aws_ecr_repository.job_suggestion.repository_url}:latest
      docker push ${aws_ecr_repository.job_suggestion.repository_url}:latest

      # Mồi cho Candidate Ranking
      docker tag public.ecr.aws/lambda/python:3.12 ${aws_ecr_repository.candidate_ranking.repository_url}:latest
      docker push ${aws_ecr_repository.candidate_ranking.repository_url}:latest

      # Đợi 10 giây cho ECR cập nhật xong xuôi trước khi Lambda gọi
      sleep 10
    EOT
  }
}

output "job_suggestion_repo_url" {
  value = aws_ecr_repository.job_suggestion.repository_url
}

output "job_suggestion_repo_name" {
  value = aws_ecr_repository.job_suggestion.name
}

output "candidate_ranking_repo_url" {
  value = aws_ecr_repository.candidate_ranking.repository_url
}

output "candidate_ranking_repo_name" {
  value = aws_ecr_repository.candidate_ranking.name
}
