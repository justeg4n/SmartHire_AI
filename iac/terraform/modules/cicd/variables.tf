variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "github_repo" {
  description = "The GitHub repository in format 'user/repo'"
  type        = string
}

variable "github_branch" {
  description = "The GitHub branch to watch for the CI/CD pipeline"
  type        = string
  default     = "main"
}

variable "job_suggestion_function_name" {
  description = "Name of the job suggestion lambda function"
  type        = string
}

variable "candidate_ranking_function_name" {
  description = "Name of the candidate ranking lambda function"
  type        = string
}

variable "job_suggestion_repo_name" {
  description = "Name of the job suggestion ECR repository"
  type        = string
}

variable "candidate_ranking_repo_name" {
  description = "Name of the candidate ranking ECR repository"
  type        = string
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
