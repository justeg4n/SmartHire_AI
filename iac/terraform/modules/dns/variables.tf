variable "domain_name" {
  type        = string
  description = "Primary domain name (e.g. smarthire-ai.org)"
}

variable "common_tags" {
  type        = map(string)
  description = "Common tags applied to all resources"
}
