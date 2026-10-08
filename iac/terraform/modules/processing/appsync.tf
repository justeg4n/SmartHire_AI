resource "aws_appsync_graphql_api" "smart_matching" {
  count               = var.appsync_enabled ? 1 : 0
  name                = "${var.project_name}-smart-matching-${var.environment}"
  authentication_type = "AMAZON_COGNITO_USER_POOLS"
  schema              = file("${path.module}/appsync_schema.graphql")
  xray_enabled        = true

  user_pool_config {
    aws_region     = data.aws_region.current.name
    default_action = "ALLOW"
    user_pool_id   = var.cognito_user_pool_id
  }

  log_config {
    cloudwatch_logs_role_arn = aws_iam_role.appsync_logs[0].arn
    field_log_level          = "ALL"
  }

  additional_authentication_provider {
    authentication_type = "AWS_IAM"
  }

  tags = merge(var.common_tags, {
    Name    = "${var.project_name}-smart-matching-${var.environment}"
    Service = "cv-processing"
  })
}

resource "aws_appsync_datasource" "smart_matching_none" {
  count  = var.appsync_enabled ? 1 : 0
  api_id = aws_appsync_graphql_api.smart_matching[0].id
  name   = "SmartMatchingNoneDS"
  type   = "NONE"
}

# AppSync → DynamoDB read for candidate JOB_SUGGESTIONS (Query hydrate / F5)
resource "aws_iam_role" "appsync_ddb" {
  count = var.appsync_enabled ? 1 : 0
  name  = "${var.project_name}-appsync-ddb-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "appsync.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "appsync_ddb_getitem" {
  count = var.appsync_enabled ? 1 : 0
  name  = "dynamodb-getitem-application-tracking"
  role  = aws_iam_role.appsync_ddb[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ReadApplicationTracking"
      Effect = "Allow"
      Action = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"]
      Resource = [
        aws_dynamodb_table.application_tracking.arn,
        "${aws_dynamodb_table.application_tracking.arn}/index/*"
      ]
    }]
  })
}

resource "aws_appsync_datasource" "application_tracking_ddb" {
  count            = var.appsync_enabled ? 1 : 0
  api_id           = aws_appsync_graphql_api.smart_matching[0].id
  name             = "ApplicationTrackingDDB"
  type             = "AMAZON_DYNAMODB"
  service_role_arn = aws_iam_role.appsync_ddb[0].arn
  dynamodb_config {
    table_name = aws_dynamodb_table.application_tracking.name
    region     = data.aws_region.current.name
  }
}

resource "aws_appsync_resolver" "get_job_suggestions" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "getJobSuggestions"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub) || $ctx.identity.sub != $ctx.args.candidateId)
  $util.unauthorized()
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("CANDIDATE#$ctx.args.candidateId"),
    "SK": $util.dynamodb.toDynamoDBJson("JOB_SUGGESTIONS")
  }
}
EOF

  response_template = <<EOF
## GetItem returns DynamoDB AttributeValue maps ({S=...},{N=...},{L=...}). Unmarshal for GraphQL scalars / list.
#if($util.isNull($ctx.result))
null
#else
#set($rows = [])
#set($sugAttr = $ctx.result.suggestions)
#if($sugAttr && $sugAttr.L)
  #foreach($elem in $sugAttr.L)
    #set($m = $elem.M)
    ## Per-row Map (M) unmarshalling works reliably; whole-Item toMapValues often does not.
    #set($flat = $util.dynamodb.toMapValues($m))
    $util.qr($rows.add($flat))
  #end
#elseif($sugAttr && $util.isList($sugAttr))
  #set($rows = $sugAttr)
#end
#set($cnt = $rows.size())
#if($ctx.result.suggestionCount && $ctx.result.suggestionCount.N)
  #set($cnt = $util.toNumber($ctx.result.suggestionCount.N))
#end
#set($updatedAt = $null)
#if($ctx.result.updatedAt && $ctx.result.updatedAt.S)
  #set($updatedAt = $ctx.result.updatedAt.S)
#elseif($ctx.result.updatedAt)
  #set($updatedAt = $ctx.result.updatedAt)
#end
#set($scoredAt = $null)
#if($ctx.result.scoredAt && $ctx.result.scoredAt.S)
  #set($scoredAt = $ctx.result.scoredAt.S)
#elseif($ctx.result.scoredAt)
  #set($scoredAt = $ctx.result.scoredAt)
#end
#set($pipelineRunId = $null)
#if($ctx.result.pipelineRunId && $ctx.result.pipelineRunId.S)
  #set($pipelineRunId = $ctx.result.pipelineRunId.S)
#elseif($ctx.result.pipelineRunId)
  #set($pipelineRunId = $ctx.result.pipelineRunId)
#end
#set($scoringVersion = $null)
#if($ctx.result.scoringVersion && $ctx.result.scoringVersion.S)
  #set($scoringVersion = $ctx.result.scoringVersion.S)
#elseif($ctx.result.scoringVersion)
  #set($scoringVersion = $ctx.result.scoringVersion)
#end
#set($cvVersion = $null)
#if($ctx.result.cvVersion && $ctx.result.cvVersion.S)
  #set($cvVersion = $ctx.result.cvVersion.S)
#elseif($ctx.result.cvVersion)
  #set($cvVersion = $ctx.result.cvVersion)
#end
$util.toJson({
  "candidateId": $ctx.args.candidateId,
  "suggestions": $rows,
  "updatedAt": $updatedAt,
  "scoredAt": $scoredAt,
  "suggestionCount": $cnt,
  "pipelineRunId": $pipelineRunId,
  "scoringVersion": $scoringVersion,
  "cvVersion": $cvVersion
})
#end
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "get_job_suggestions_status" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "getJobSuggestionsStatus"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub) || $ctx.identity.sub != $ctx.args.candidateId)
  $util.unauthorized()
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("CANDIDATE#$ctx.args.candidateId"),
    "SK": $util.dynamodb.toDynamoDBJson("JOB_SUGGESTIONS")
  }
}
EOF

  response_template = <<EOF
#if($util.isNull($ctx.result))
null
#else
#set($sugAttr = $ctx.result.suggestions)
#set($cnt = 0)
#if($ctx.result.suggestionCount && $ctx.result.suggestionCount.N)
  #set($cnt = $util.toNumber($ctx.result.suggestionCount.N))
#elseif($sugAttr && $sugAttr.L)
  #foreach($elem in $sugAttr.L)
    #set($cnt = $cnt + 1)
  #end
#elseif($sugAttr && $util.isList($sugAttr))
  #foreach($elem in $sugAttr)
    #set($cnt = $cnt + 1)
  #end
#end
#set($updatedAt = $null)
#if($ctx.result.updatedAt && $ctx.result.updatedAt.S)
  #set($updatedAt = $ctx.result.updatedAt.S)
#elseif($ctx.result.updatedAt)
  #set($updatedAt = $ctx.result.updatedAt)
#end
#set($scoredAt = $null)
#if($ctx.result.scoredAt && $ctx.result.scoredAt.S)
  #set($scoredAt = $ctx.result.scoredAt.S)
#elseif($ctx.result.scoredAt)
  #set($scoredAt = $ctx.result.scoredAt)
#end
#set($pipelineRunId = $null)
#if($ctx.result.pipelineRunId && $ctx.result.pipelineRunId.S)
  #set($pipelineRunId = $ctx.result.pipelineRunId.S)
#elseif($ctx.result.pipelineRunId)
  #set($pipelineRunId = $ctx.result.pipelineRunId)
#end
#set($scoringVersion = $null)
#if($ctx.result.scoringVersion && $ctx.result.scoringVersion.S)
  #set($scoringVersion = $ctx.result.scoringVersion.S)
#elseif($ctx.result.scoringVersion)
  #set($scoringVersion = $ctx.result.scoringVersion)
#end
#set($cvVersion = $null)
#if($ctx.result.cvVersion && $ctx.result.cvVersion.S)
  #set($cvVersion = $ctx.result.cvVersion.S)
#elseif($ctx.result.cvVersion)
  #set($cvVersion = $ctx.result.cvVersion)
#end
$util.toJson({
  "candidateId": $ctx.args.candidateId,
  "hasRecord": true,
  "updatedAt": $updatedAt,
  "scoredAt": $scoredAt,
  "suggestionCount": $cnt,
  "pipelineRunId": $pipelineRunId,
  "scoringVersion": $scoringVersion,
  "cvVersion": $cvVersion
})
#end
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "get_job_suggestion_for_candidate" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "getJobSuggestionForCandidate"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub) || $ctx.identity.sub != $ctx.args.candidateId)
  $util.unauthorized()
#end
#if($util.isNullOrEmpty($ctx.args.jobId))
  $util.error("jobId is required", "BadRequest")
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("CANDIDATE#$ctx.args.candidateId"),
    "SK": $util.dynamodb.toDynamoDBJson("JOB_SUGGESTIONS")
  }
}
EOF

  response_template = <<EOF
#if($util.isNull($ctx.result))
null
#else
#set($target = "$ctx.args.jobId")
#set($target = $target.trim())
#if($target.toUpperCase().startsWith("JOB#"))
  #set($target = $target.substring(4))
#end

#set($match = $null)
#set($suggestions = $ctx.result.suggestions)

#if($suggestions && $suggestions.L)
  #foreach($elem in $suggestions.L)
    #set($flat = {})
    #if($elem.M)
      #set($flat = $util.dynamodb.toMapValues($elem.M))
    #elseif($elem)
      #set($flat = $elem)
    #end
    #set($sid = "")
    #if($flat.jobId)
      #set($sid = "$flat.jobId")
    #end
    #if(!$util.isNullOrEmpty($sid))
      #set($sid = $sid.trim())
      #if($sid.toUpperCase().startsWith("JOB#"))
        #set($sid = $sid.substring(4))
      #end
      #if($sid == $target)
        #set($match = $flat)
        #break
      #end
    #end
  #end
#elseif($suggestions && $util.isList($suggestions))
  #foreach($row in $suggestions)
    #set($sid = "")
    #if($row.jobId)
      #set($sid = "$row.jobId")
    #end
    #if(!$util.isNullOrEmpty($sid))
      #set($sid = $sid.trim())
      #if($sid.toUpperCase().startsWith("JOB#"))
        #set($sid = $sid.substring(4))
      #end
      #if($sid == $target)
        #set($match = $row)
        #break
      #end
    #end
  #end
#end

$util.toJson($match)
#end
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "get_candidate_cv_status" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "getCandidateCvStatus"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub) || $ctx.identity.sub != $ctx.args.candidateId)
  $util.unauthorized()
#end
{
  "version": "2018-05-29",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("CANDIDATE#$ctx.args.candidateId")
    }
  },
  "limit": 50
}
EOF

  response_template = <<EOF
#set($hasCv = false)
#set($meta = $null)
#set($latestCv = $null)
#set($latestCvUpdatedAt = "")

#if(!$util.isNullOrEmpty($ctx.result.items))
  #foreach($it in $ctx.result.items)
    #set($sk = "")
    #if($it.SK && $it.SK.S)
      #set($sk = $it.SK.S)
    #elseif($it.SK)
      #set($sk = $it.SK)
    #end

    #if($sk == "METADATA")
      #set($meta = $it)
    #elseif(!$util.isNullOrEmpty($sk) && $sk.startsWith("CV#"))
      #set($hasCv = true)
      #set($rowUpdatedAt = "")
      #if($it.updatedAt && $it.updatedAt.S)
        #set($rowUpdatedAt = $it.updatedAt.S)
      #elseif($it.updatedAt)
        #set($rowUpdatedAt = $it.updatedAt)
      #end
      #if($util.isNull($latestCv) || $rowUpdatedAt > $latestCvUpdatedAt)
        #set($latestCv = $it)
        #set($latestCvUpdatedAt = $rowUpdatedAt)
      #end
    #end
  #end
#end

#set($metaObjKey = $null)
#if(!$util.isNull($meta))
  #if($meta.objectKey && $meta.objectKey.S)
    #set($metaObjKey = $meta.objectKey.S)
  #elseif($meta.objectKey)
    #set($metaObjKey = $meta.objectKey)
  #end
#end
#if(!$util.isNullOrEmpty($metaObjKey))
  #set($hasCv = true)
#end

#set($status = $null)
#set($parseStatus = $null)
#set($errorMessage = $null)
#set($updatedAt = $null)
#set($cvVersion = $null)
#set($latestCvKey = $metaObjKey)
#set($latestSuggestionCount = $null)
#set($latestSuggestionAt = $null)
#set($contactInfo = {})
#set($parsedProfile = {
  "headline": $null,
  "summary": $null,
  "yearsExperience": $null,
  "skills": [],
  "education": [],
  "certifications": [],
  "languages": [],
  "projects": [],
  "professionalExperience": [],
  "domainExperience": [],
  "seniorityEvidence": [],
  "recencySignals": {},
  "strengths": $null,
  "gaps": $null
})

#if(!$util.isNull($meta))
  #if($meta.status && $meta.status.S)
    #set($status = $meta.status.S)
  #elseif($meta.status)
    #set($status = $meta.status)
  #end

  #if($meta.parseStatus && $meta.parseStatus.S)
    #set($parseStatus = $meta.parseStatus.S)
  #elseif($meta.parseStatus)
    #set($parseStatus = $meta.parseStatus)
  #end

  #if($meta.errorMessage && $meta.errorMessage.S)
    #set($errorMessage = $meta.errorMessage.S)
  #elseif($meta.errorMessage)
    #set($errorMessage = $meta.errorMessage)
  #end

  #if($meta.updatedAt && $meta.updatedAt.S)
    #set($updatedAt = $meta.updatedAt.S)
  #elseif($meta.updatedAt)
    #set($updatedAt = $meta.updatedAt)
  #end

  #if($meta.cvVersion && $meta.cvVersion.S)
    #set($cvVersion = $meta.cvVersion.S)
  #elseif($meta.cvVersion)
    #set($cvVersion = $meta.cvVersion)
  #end

  #if($meta.latestSuggestionCount && $meta.latestSuggestionCount.N)
    #set($latestSuggestionCount = $util.parseJson($meta.latestSuggestionCount.N))
  #elseif(!$util.isNull($meta.latestSuggestionCount))
    #set($latestSuggestionCount = $meta.latestSuggestionCount)
  #end

  #if($meta.latestSuggestionAt && $meta.latestSuggestionAt.S)
    #set($latestSuggestionAt = $meta.latestSuggestionAt.S)
  #elseif($meta.latestSuggestionAt)
    #set($latestSuggestionAt = $meta.latestSuggestionAt)
  #end

  #set($ci = $meta.contactInfo)
  #if(!$util.isNull($ci) && $ci.M)
    #set($ci = $util.dynamodb.toMapValues($ci.M))
  #end
  #if(!$util.isNull($ci) && $util.isMap($ci))
    #set($contactInfo = {
      "fullName": $ci.fullName,
      "email": $ci.email,
      "phone": $ci.phone,
      "linkedinUrl": $ci.linkedinUrl,
      "githubUrl": $ci.githubUrl,
      "portfolioUrl": $ci.portfolioUrl
    })
  #end

  #set($pp = $meta.parsedProfile)
  #if(!$util.isNull($pp) && $pp.M)
    #set($pp = $util.dynamodb.toMapValues($pp.M))
  #end
  #if(!$util.isNull($pp) && $util.isMap($pp))
    #set($skills = [])
    #set($education = [])
    #set($certs = [])
    #set($languages = [])

    #set($skillsRaw = $pp.skills)
    #if(!$util.isNull($skillsRaw) && $skillsRaw.L)
      #foreach($item in $skillsRaw.L)
        #if($item.S)
          $util.qr($skills.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($skills.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($skillsRaw) && $util.isList($skillsRaw))
      #foreach($item in $skillsRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($skills.add("$item"))
        #end
      #end
    #end

    #set($educationRaw = $pp.education)
    #if(!$util.isNull($educationRaw) && $educationRaw.L)
      #foreach($item in $educationRaw.L)
        #if($item.S)
          $util.qr($education.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($education.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($educationRaw) && $util.isList($educationRaw))
      #foreach($item in $educationRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($education.add("$item"))
        #end
      #end
    #end

    #set($certRaw = $pp.certifications)
    #if(!$util.isNull($certRaw) && $certRaw.L)
      #foreach($item in $certRaw.L)
        #if($item.S)
          $util.qr($certs.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($certs.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($certRaw) && $util.isList($certRaw))
      #foreach($item in $certRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($certs.add("$item"))
        #end
      #end
    #end

    #set($langRaw = $pp.languages)
    #if(!$util.isNull($langRaw) && $langRaw.L)
      #foreach($item in $langRaw.L)
        #if($item.S)
          $util.qr($languages.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($languages.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($langRaw) && $util.isList($langRaw))
      #foreach($item in $langRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($languages.add("$item"))
        #end
      #end
    #end

    #set($yearsExperience = $null)
    #if(!$util.isNull($pp.years_experience))
      #set($yearsExperience = $pp.years_experience)
    #elseif(!$util.isNull($pp.yearsExperience))
      #set($yearsExperience = $pp.yearsExperience)
    #end

    #set($projects = [])
    #if(!$util.isNull($pp.projects) && $pp.projects.L)
      #foreach($item in $pp.projects.L)
        #if($item.M)
          $util.qr($projects.add($util.dynamodb.toMapValues($item.M)))
        #elseif(!$util.isNull($item))
          $util.qr($projects.add($item))
        #end
      #end
    #elseif(!$util.isNull($pp.projects) && $util.isList($pp.projects))
      #set($projects = $pp.projects)
    #end

    #set($professionalExperience = [])
    #if(!$util.isNull($pp.professional_experience) && $pp.professional_experience.L)
      #foreach($item in $pp.professional_experience.L)
        #if($item.M)
          $util.qr($professionalExperience.add($util.dynamodb.toMapValues($item.M)))
        #elseif(!$util.isNull($item))
          $util.qr($professionalExperience.add($item))
        #end
      #end
    #elseif(!$util.isNull($pp.professional_experience) && $util.isList($pp.professional_experience))
      #set($professionalExperience = $pp.professional_experience)
    #elseif(!$util.isNull($pp.professionalExperience) && $util.isList($pp.professionalExperience))
      #set($professionalExperience = $pp.professionalExperience)
    #end

    #set($domainExperience = [])
    #set($domainRaw = $pp.domain_experience)
    #if(!$util.isNull($domainRaw) && $domainRaw.L)
      #foreach($item in $domainRaw.L)
        #if($item.S)
          $util.qr($domainExperience.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($domainExperience.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($domainRaw) && $util.isList($domainRaw))
      #foreach($item in $domainRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($domainExperience.add("$item"))
        #end
      #end
    #end

    #set($seniorityEvidence = [])
    #set($seniorityRaw = $pp.seniority_evidence)
    #if(!$util.isNull($seniorityRaw) && $seniorityRaw.L)
      #foreach($item in $seniorityRaw.L)
        #if($item.S)
          $util.qr($seniorityEvidence.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($seniorityEvidence.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($seniorityRaw) && $util.isList($seniorityRaw))
      #foreach($item in $seniorityRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($seniorityEvidence.add("$item"))
        #end
      #end
    #end

    #set($recencySignals = {})
    #if(!$util.isNull($pp.recency_signals) && $pp.recency_signals.M)
      #set($recencySignals = $util.dynamodb.toMapValues($pp.recency_signals.M))
    #elseif(!$util.isNull($pp.recency_signals) && $util.isMap($pp.recency_signals))
      #set($recencySignals = $pp.recency_signals)
    #elseif(!$util.isNull($pp.recencySignals) && $util.isMap($pp.recencySignals))
      #set($recencySignals = $pp.recencySignals)
    #end

    #set($headline = $null)
    #if(!$util.isNullOrEmpty($pp.headline))
      #set($headline = $pp.headline)
    #elseif(!$util.isNullOrEmpty($pp.current_title))
      #set($headline = $pp.current_title)
    #elseif(!$util.isNullOrEmpty($pp.title))
      #set($headline = $pp.title)
    #end

    #set($summary = $null)
    #if(!$util.isNullOrEmpty($pp.summary))
      #set($summary = $pp.summary)
    #elseif(!$util.isNullOrEmpty($pp.raw_summary))
      #set($summary = $pp.raw_summary)
    #end

    #set($strengths = $null)
    #if(!$util.isNullOrEmpty($pp.strengths))
      #set($strengths = $pp.strengths)
    #end

    #set($gaps = $null)
    #if(!$util.isNullOrEmpty($pp.gaps))
      #set($gaps = $pp.gaps)
    #end

    #set($parsedProfile = {
      "headline": $headline,
      "summary": $summary,
      "yearsExperience": $yearsExperience,
      "skills": $skills,
      "education": $education,
      "certifications": $certs,
      "languages": $languages,
      "projects": $projects,
      "professionalExperience": $professionalExperience,
      "domainExperience": $domainExperience,
      "seniorityEvidence": $seniorityEvidence,
      "recencySignals": $recencySignals,
      "strengths": $strengths,
      "gaps": $gaps
    })
  #end
#end

#if($util.isNullOrEmpty($latestCvKey) && !$util.isNull($latestCv))
  #set($latestCvSk = "")
  #if($latestCv.SK && $latestCv.SK.S)
    #set($latestCvSk = $latestCv.SK.S)
  #elseif($latestCv.SK)
    #set($latestCvSk = $latestCv.SK)
  #end
  #if(!$util.isNullOrEmpty($latestCvSk) && $latestCvSk.startsWith("CV#"))
    #set($latestCvKey = $latestCvSk.substring(3))
  #end
#end

$util.toJson({
  "candidateId": $ctx.args.candidateId,
  "hasCv": $hasCv,
  "status": $status,
  "parseStatus": $parseStatus,
  "errorMessage": $errorMessage,
  "updatedAt": $updatedAt,
  "cvVersion": $cvVersion,
  "latestCvKey": $latestCvKey,
  "latestSuggestionCount": $latestSuggestionCount,
  "latestSuggestionAt": $latestSuggestionAt,
  "contactInfo": $contactInfo,
  "parsedProfile": $parsedProfile
})
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "get_job_metadata" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "getJobMetadata"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.args.jobId))
  $util.error("jobId is required", "BadRequest")
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("JOB#$ctx.args.jobId"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  }
}
EOF

  response_template = <<EOF
#if($util.isNull($ctx.result))
null
#else
## $ctx.result is already unwrapped by the AMAZON_DYNAMODB data source.
#set($item = $ctx.result)

#set($owner = "")
#if($item.ownerCognitoSub && $item.ownerCognitoSub.S)
  #set($owner = $item.ownerCognitoSub.S)
#elseif($item.ownerCognitoSub)
  #set($owner = $item.ownerCognitoSub)
#end
#if($util.isNullOrEmpty($owner))
  $util.unauthorized()
#end
#if($owner != $ctx.identity.sub)
  $util.unauthorized()
#end

## Ensure requiredSkills is always a GraphQL list.
#set($requiredSkills = [])
#if($item.requiredSkills && $item.requiredSkills.L)
  #foreach($elem in $item.requiredSkills.L)
    #if($elem.S)
      $util.qr($requiredSkills.add($elem.S))
    #end
  #end
#elseif($item.requiredSkills && $item.requiredSkills.SS)
  #foreach($skill in $item.requiredSkills.SS)
    $util.qr($requiredSkills.add($skill))
  #end
#elseif(!$util.isNull($item.requiredSkills) && $util.isList($item.requiredSkills))
  #set($requiredSkills = $item.requiredSkills)
#end
$util.qr($item.put("requiredSkills", $requiredSkills))

## Backward-compatible fallback for old records.
#if($util.isNullOrEmpty($item.employmentType) && !$util.isNullOrEmpty($item.jobType))
  $util.qr($item.put("employmentType", $item.jobType))
#end

## Guarantee jobId in response.
#if($util.isNullOrEmpty($item.jobId))
  $util.qr($item.put("jobId", $ctx.args.jobId))
#end

## Never expose internal owner/recruiter identity keys in UI models.
$util.qr($item.remove("ownerCognitoSub"))
$util.qr($item.remove("recruiterId"))

$util.toJson($item)
#end
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_function" "candidate_job_access_check" {
  count            = var.appsync_enabled ? 1 : 0
  api_id           = aws_appsync_graphql_api.smart_matching[0].id
  data_source      = aws_appsync_datasource.application_tracking_ddb[0].name
  name             = "candidateJobAccessCheck"
  function_version = "2018-05-29"

  request_mapping_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub) || $ctx.identity.sub != $ctx.args.candidateId)
  $util.unauthorized()
#end
#if($util.isNullOrEmpty($ctx.args.jobId))
  $util.error("jobId is required", "BadRequest")
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("CANDIDATE#$ctx.args.candidateId"),
    "SK": $util.dynamodb.toDynamoDBJson("JOB_SUGGESTIONS")
  }
}
EOF

  response_mapping_template = <<EOF
#set($target = "$ctx.args.jobId")
#set($target = $target.trim())
#if($target.toUpperCase().startsWith("JOB#"))
  #set($target = $target.substring(4))
#end
#set($allowed = false)

#if(!$util.isNull($ctx.result))
  #set($suggestions = $ctx.result.suggestions)
  #if($suggestions && $suggestions.L)
    #foreach($elem in $suggestions.L)
      #set($sid = "")
      #if($elem.M && $elem.M.jobId && $elem.M.jobId.S)
        #set($sid = $elem.M.jobId.S)
      #elseif($elem.M && $elem.M.jobId)
        #set($sid = $elem.M.jobId)
      #end
      #if(!$util.isNullOrEmpty($sid))
        #set($sid = $sid.trim())
        #if($sid.toUpperCase().startsWith("JOB#"))
          #set($sid = $sid.substring(4))
        #end
        #if($sid == $target)
          #set($allowed = true)
          #break
        #end
      #end
    #end
  #elseif($suggestions && $util.isList($suggestions))
    #foreach($row in $suggestions)
      #set($sid = "")
      #if($row.jobId)
        #set($sid = "$row.jobId")
      #end
      #if(!$util.isNullOrEmpty($sid))
        #set($sid = $sid.trim())
        #if($sid.toUpperCase().startsWith("JOB#"))
          #set($sid = $sid.substring(4))
        #end
        #if($sid == $target)
          #set($allowed = true)
          #break
        #end
      #end
    #end
  #end
#end
$util.toJson({
  "candidateId": $ctx.args.candidateId,
  "jobId": $target,
  "allowed": $allowed
})
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_function" "candidate_job_metadata_get" {
  count            = var.appsync_enabled ? 1 : 0
  api_id           = aws_appsync_graphql_api.smart_matching[0].id
  data_source      = aws_appsync_datasource.application_tracking_ddb[0].name
  name             = "candidateJobMetadataGet"
  function_version = "2018-05-29"

  request_mapping_template = <<EOF
#set($jid = "__NO_ACCESS__")
#if($ctx.prev.result && $ctx.prev.result.allowed == true && !$util.isNullOrEmpty($ctx.prev.result.jobId))
  #set($jid = $ctx.prev.result.jobId)
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("JOB#$jid"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  }
}
EOF

  response_mapping_template = <<EOF
#if($ctx.prev.result && $ctx.prev.result.allowed != true)
null
#elseif($util.isNull($ctx.result))
null
#else
#set($item = $ctx.result)

## Ensure requiredSkills is always a GraphQL list.
#set($requiredSkills = [])
#if($item.requiredSkills && $item.requiredSkills.L)
  #foreach($elem in $item.requiredSkills.L)
    #if($elem.S)
      $util.qr($requiredSkills.add($elem.S))
    #end
  #end
#elseif($item.requiredSkills && $item.requiredSkills.SS)
  #foreach($skill in $item.requiredSkills.SS)
    $util.qr($requiredSkills.add($skill))
  #end
#elseif(!$util.isNull($item.requiredSkills) && $util.isList($item.requiredSkills))
  #set($requiredSkills = $item.requiredSkills)
#end
$util.qr($item.put("requiredSkills", $requiredSkills))

## Backward-compatible fallback for old records.
#if($util.isNullOrEmpty($item.employmentType) && !$util.isNullOrEmpty($item.jobType))
  $util.qr($item.put("employmentType", $item.jobType))
#end

## Guarantee jobId in response.
#if($util.isNullOrEmpty($item.jobId) && $ctx.prev.result && !$util.isNullOrEmpty($ctx.prev.result.jobId))
  $util.qr($item.put("jobId", $ctx.prev.result.jobId))
#end

## Never expose internal owner/recruiter identity keys in UI models.
$util.qr($item.remove("ownerCognitoSub"))
$util.qr($item.remove("recruiterId"))

$util.toJson($item)
#end
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_function" "recruiter_candidate_profile_access_check" {
  count            = var.appsync_enabled ? 1 : 0
  api_id           = aws_appsync_graphql_api.smart_matching[0].id
  data_source      = aws_appsync_datasource.application_tracking_ddb[0].name
  name             = "recruiterCandidateProfileAccessCheck"
  function_version = "2018-05-29"

  request_mapping_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub))
  $util.unauthorized()
#end
#if($util.isNullOrEmpty($ctx.args.jobId))
  $util.error("jobId is required", "BadRequest")
#end
#if($util.isNullOrEmpty($ctx.args.candidateId))
  $util.error("candidateId is required", "BadRequest")
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("JOB#$ctx.args.jobId"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  }
}
EOF

  response_mapping_template = <<EOF
#set($owner = "")
#if(!$util.isNull($ctx.result))
  #if($ctx.result.ownerCognitoSub && $ctx.result.ownerCognitoSub.S)
    #set($owner = $ctx.result.ownerCognitoSub.S)
  #elseif($ctx.result.ownerCognitoSub)
    #set($owner = $ctx.result.ownerCognitoSub)
  #end
#end
#set($allowed = false)
#if(!$util.isNullOrEmpty($owner) && $owner == $ctx.identity.sub)
  #set($allowed = true)
#end
$util.toJson({
  "candidateId": $ctx.args.candidateId,
  "jobId": $ctx.args.jobId,
  "allowed": $allowed
})
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_function" "recruiter_candidate_profile_get" {
  count            = var.appsync_enabled ? 1 : 0
  api_id           = aws_appsync_graphql_api.smart_matching[0].id
  data_source      = aws_appsync_datasource.application_tracking_ddb[0].name
  name             = "recruiterCandidateProfileGet"
  function_version = "2018-05-29"

  request_mapping_template = <<EOF
#set($cid = "__NO_ACCESS__")
#if($ctx.prev.result && $ctx.prev.result.allowed == true && !$util.isNullOrEmpty($ctx.prev.result.candidateId))
  #set($cid = $ctx.prev.result.candidateId)
#end
{
  "version": "2018-05-29",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("CANDIDATE#$cid")
    }
  },
  "limit": 50
}
EOF

  response_mapping_template = <<EOF
#if($ctx.prev.result && $ctx.prev.result.allowed != true)
  $util.unauthorized()
#end
#set($hasCv = false)
#set($meta = $null)
#set($latestCv = $null)
#set($latestCvUpdatedAt = "")

#if(!$util.isNullOrEmpty($ctx.result.items))
  #foreach($it in $ctx.result.items)
    #set($sk = "")
    #if($it.SK && $it.SK.S)
      #set($sk = $it.SK.S)
    #elseif($it.SK)
      #set($sk = $it.SK)
    #end

    #if($sk == "METADATA")
      #set($meta = $it)
    #elseif(!$util.isNullOrEmpty($sk) && $sk.startsWith("CV#"))
      #set($hasCv = true)
      #set($rowUpdatedAt = "")
      #if($it.updatedAt && $it.updatedAt.S)
        #set($rowUpdatedAt = $it.updatedAt.S)
      #elseif($it.updatedAt)
        #set($rowUpdatedAt = $it.updatedAt)
      #end
      #if($util.isNull($latestCv) || $rowUpdatedAt > $latestCvUpdatedAt)
        #set($latestCv = $it)
        #set($latestCvUpdatedAt = $rowUpdatedAt)
      #end
    #end
  #end
#end

#set($metaObjKey = $null)
#if(!$util.isNull($meta))
  #if($meta.objectKey && $meta.objectKey.S)
    #set($metaObjKey = $meta.objectKey.S)
  #elseif($meta.objectKey)
    #set($metaObjKey = $meta.objectKey)
  #end
#end
#if(!$util.isNullOrEmpty($metaObjKey))
  #set($hasCv = true)
#end

#set($status = $null)
#set($parseStatus = $null)
#set($errorMessage = $null)
#set($updatedAt = $null)
#set($cvVersion = $null)
#set($latestCvKey = $metaObjKey)
#set($latestSuggestionCount = $null)
#set($latestSuggestionAt = $null)
#set($contactInfo = {})
#set($parsedProfile = {
  "headline": $null,
  "summary": $null,
  "yearsExperience": $null,
  "skills": [],
  "education": [],
  "certifications": [],
  "languages": [],
  "projects": [],
  "professionalExperience": [],
  "domainExperience": [],
  "seniorityEvidence": [],
  "recencySignals": {},
  "strengths": $null,
  "gaps": $null
})

#if(!$util.isNull($meta))
  #if($meta.status && $meta.status.S)
    #set($status = $meta.status.S)
  #elseif($meta.status)
    #set($status = $meta.status)
  #end

  #if($meta.parseStatus && $meta.parseStatus.S)
    #set($parseStatus = $meta.parseStatus.S)
  #elseif($meta.parseStatus)
    #set($parseStatus = $meta.parseStatus)
  #end

  #if($meta.errorMessage && $meta.errorMessage.S)
    #set($errorMessage = $meta.errorMessage.S)
  #elseif($meta.errorMessage)
    #set($errorMessage = $meta.errorMessage)
  #end

  #if($meta.updatedAt && $meta.updatedAt.S)
    #set($updatedAt = $meta.updatedAt.S)
  #elseif($meta.updatedAt)
    #set($updatedAt = $meta.updatedAt)
  #end

  #if($meta.cvVersion && $meta.cvVersion.S)
    #set($cvVersion = $meta.cvVersion.S)
  #elseif($meta.cvVersion)
    #set($cvVersion = $meta.cvVersion)
  #end

  #if($meta.latestSuggestionCount && $meta.latestSuggestionCount.N)
    #set($latestSuggestionCount = $util.parseJson($meta.latestSuggestionCount.N))
  #elseif(!$util.isNull($meta.latestSuggestionCount))
    #set($latestSuggestionCount = $meta.latestSuggestionCount)
  #end

  #if($meta.latestSuggestionAt && $meta.latestSuggestionAt.S)
    #set($latestSuggestionAt = $meta.latestSuggestionAt.S)
  #elseif($meta.latestSuggestionAt)
    #set($latestSuggestionAt = $meta.latestSuggestionAt)
  #end

  #set($ci = $meta.contactInfo)
  #if(!$util.isNull($ci) && $ci.M)
    #set($ci = $util.dynamodb.toMapValues($ci.M))
  #end
  #if(!$util.isNull($ci) && $util.isMap($ci))
    #set($contactInfo = {
      "fullName": $ci.fullName,
      "email": $ci.email,
      "phone": $ci.phone,
      "linkedinUrl": $ci.linkedinUrl,
      "githubUrl": $ci.githubUrl,
      "portfolioUrl": $ci.portfolioUrl
    })
  #end

  #set($pp = $meta.parsedProfile)
  #if(!$util.isNull($pp) && $pp.M)
    #set($pp = $util.dynamodb.toMapValues($pp.M))
  #end
  #if(!$util.isNull($pp) && $util.isMap($pp))
    #set($skills = [])
    #set($education = [])
    #set($certs = [])
    #set($languages = [])

    #set($skillsRaw = $pp.skills)
    #if(!$util.isNull($skillsRaw) && $skillsRaw.L)
      #foreach($item in $skillsRaw.L)
        #if($item.S)
          $util.qr($skills.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($skills.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($skillsRaw) && $util.isList($skillsRaw))
      #foreach($item in $skillsRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($skills.add("$item"))
        #end
      #end
    #end

    #set($educationRaw = $pp.education)
    #if(!$util.isNull($educationRaw) && $educationRaw.L)
      #foreach($item in $educationRaw.L)
        #if($item.S)
          $util.qr($education.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($education.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($educationRaw) && $util.isList($educationRaw))
      #foreach($item in $educationRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($education.add("$item"))
        #end
      #end
    #end

    #set($certRaw = $pp.certifications)
    #if(!$util.isNull($certRaw) && $certRaw.L)
      #foreach($item in $certRaw.L)
        #if($item.S)
          $util.qr($certs.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($certs.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($certRaw) && $util.isList($certRaw))
      #foreach($item in $certRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($certs.add("$item"))
        #end
      #end
    #end

    #set($langRaw = $pp.languages)
    #if(!$util.isNull($langRaw) && $langRaw.L)
      #foreach($item in $langRaw.L)
        #if($item.S)
          $util.qr($languages.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($languages.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($langRaw) && $util.isList($langRaw))
      #foreach($item in $langRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($languages.add("$item"))
        #end
      #end
    #end

    #set($yearsExperience = $null)
    #if(!$util.isNull($pp.years_experience))
      #set($yearsExperience = $pp.years_experience)
    #elseif(!$util.isNull($pp.yearsExperience))
      #set($yearsExperience = $pp.yearsExperience)
    #end

    #set($projects = [])
    #if(!$util.isNull($pp.projects) && $pp.projects.L)
      #foreach($item in $pp.projects.L)
        #if($item.M)
          $util.qr($projects.add($util.dynamodb.toMapValues($item.M)))
        #elseif(!$util.isNull($item))
          $util.qr($projects.add($item))
        #end
      #end
    #elseif(!$util.isNull($pp.projects) && $util.isList($pp.projects))
      #set($projects = $pp.projects)
    #end

    #set($professionalExperience = [])
    #if(!$util.isNull($pp.professional_experience) && $pp.professional_experience.L)
      #foreach($item in $pp.professional_experience.L)
        #if($item.M)
          $util.qr($professionalExperience.add($util.dynamodb.toMapValues($item.M)))
        #elseif(!$util.isNull($item))
          $util.qr($professionalExperience.add($item))
        #end
      #end
    #elseif(!$util.isNull($pp.professional_experience) && $util.isList($pp.professional_experience))
      #set($professionalExperience = $pp.professional_experience)
    #elseif(!$util.isNull($pp.professionalExperience) && $util.isList($pp.professionalExperience))
      #set($professionalExperience = $pp.professionalExperience)
    #end

    #set($domainExperience = [])
    #set($domainRaw = $pp.domain_experience)
    #if(!$util.isNull($domainRaw) && $domainRaw.L)
      #foreach($item in $domainRaw.L)
        #if($item.S)
          $util.qr($domainExperience.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($domainExperience.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($domainRaw) && $util.isList($domainRaw))
      #foreach($item in $domainRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($domainExperience.add("$item"))
        #end
      #end
    #end

    #set($seniorityEvidence = [])
    #set($seniorityRaw = $pp.seniority_evidence)
    #if(!$util.isNull($seniorityRaw) && $seniorityRaw.L)
      #foreach($item in $seniorityRaw.L)
        #if($item.S)
          $util.qr($seniorityEvidence.add($item.S))
        #elseif(!$util.isNull($item))
          $util.qr($seniorityEvidence.add("$item"))
        #end
      #end
    #elseif(!$util.isNull($seniorityRaw) && $util.isList($seniorityRaw))
      #foreach($item in $seniorityRaw)
        #if(!$util.isNull($item) && "$item" != "")
          $util.qr($seniorityEvidence.add("$item"))
        #end
      #end
    #end

    #set($recencySignals = {})
    #if(!$util.isNull($pp.recency_signals) && $pp.recency_signals.M)
      #set($recencySignals = $util.dynamodb.toMapValues($pp.recency_signals.M))
    #elseif(!$util.isNull($pp.recency_signals) && $util.isMap($pp.recency_signals))
      #set($recencySignals = $pp.recency_signals)
    #elseif(!$util.isNull($pp.recencySignals) && $util.isMap($pp.recencySignals))
      #set($recencySignals = $pp.recencySignals)
    #end

    #set($headline = $null)
    #if(!$util.isNullOrEmpty($pp.headline))
      #set($headline = $pp.headline)
    #elseif(!$util.isNullOrEmpty($pp.current_title))
      #set($headline = $pp.current_title)
    #elseif(!$util.isNullOrEmpty($pp.title))
      #set($headline = $pp.title)
    #end

    #set($summary = $null)
    #if(!$util.isNullOrEmpty($pp.summary))
      #set($summary = $pp.summary)
    #elseif(!$util.isNullOrEmpty($pp.raw_summary))
      #set($summary = $pp.raw_summary)
    #end

    #set($strengths = $null)
    #if(!$util.isNullOrEmpty($pp.strengths))
      #set($strengths = $pp.strengths)
    #end

    #set($gaps = $null)
    #if(!$util.isNullOrEmpty($pp.gaps))
      #set($gaps = $pp.gaps)
    #end

    #set($parsedProfile = {
      "headline": $headline,
      "summary": $summary,
      "yearsExperience": $yearsExperience,
      "skills": $skills,
      "education": $education,
      "certifications": $certs,
      "languages": $languages,
      "projects": $projects,
      "professionalExperience": $professionalExperience,
      "domainExperience": $domainExperience,
      "seniorityEvidence": $seniorityEvidence,
      "recencySignals": $recencySignals,
      "strengths": $strengths,
      "gaps": $gaps
    })
  #end
#end

#if($util.isNullOrEmpty($latestCvKey) && !$util.isNull($latestCv))
  #set($latestCvSk = "")
  #if($latestCv.SK && $latestCv.SK.S)
    #set($latestCvSk = $latestCv.SK.S)
  #elseif($latestCv.SK)
    #set($latestCvSk = $latestCv.SK)
  #end
  #if(!$util.isNullOrEmpty($latestCvSk) && $latestCvSk.startsWith("CV#"))
    #set($latestCvKey = $latestCvSk.substring(3))
  #end
#end

$util.toJson({
  "candidateId": $ctx.prev.result.candidateId,
  "hasCv": $hasCv,
  "status": $status,
  "parseStatus": $parseStatus,
  "errorMessage": $errorMessage,
  "updatedAt": $updatedAt,
  "cvVersion": $cvVersion,
  "latestCvKey": $latestCvKey,
  "latestSuggestionCount": $latestSuggestionCount,
  "latestSuggestionAt": $latestSuggestionAt,
  "contactInfo": $contactInfo,
  "parsedProfile": $parsedProfile
})
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "get_job_metadata_for_candidate" {
  count  = var.appsync_enabled ? 1 : 0
  api_id = aws_appsync_graphql_api.smart_matching[0].id
  type   = "Query"
  field  = "getJobMetadataForCandidate"
  kind   = "PIPELINE"

  request_template = <<EOF
{
  "version": "2018-05-29",
  "payload": {}
}
EOF

  response_template = <<EOF
$util.toJson($ctx.prev.result)
EOF

  pipeline_config {
    functions = [
      aws_appsync_function.candidate_job_access_check[0].function_id,
      aws_appsync_function.candidate_job_metadata_get[0].function_id
    ]
  }

  depends_on = [
    aws_appsync_function.candidate_job_access_check,
    aws_appsync_function.candidate_job_metadata_get
  ]
}

resource "aws_appsync_resolver" "get_candidate_profile_for_recruiter" {
  count  = var.appsync_enabled ? 1 : 0
  api_id = aws_appsync_graphql_api.smart_matching[0].id
  type   = "Query"
  field  = "getCandidateProfileForRecruiter"
  kind   = "PIPELINE"

  request_template = <<EOF
{
  "version": "2018-05-29",
  "payload": {}
}
EOF

  response_template = <<EOF
$util.toJson($ctx.prev.result)
EOF

  pipeline_config {
    functions = [
      aws_appsync_function.recruiter_candidate_profile_access_check[0].function_id,
      aws_appsync_function.recruiter_candidate_profile_get[0].function_id
    ]
  }

  depends_on = [
    aws_appsync_function.recruiter_candidate_profile_access_check,
    aws_appsync_function.recruiter_candidate_profile_get
  ]
}

resource "aws_appsync_resolver" "get_candidate_ranking" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "getCandidateRanking"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.args.jobId))
  $util.error("jobId is required", "BadRequest")
#end
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("JOB#$ctx.args.jobId"),
    "SK": $util.dynamodb.toDynamoDBJson("CANDIDATE_RANKING")
  }
}
EOF

  response_template = <<EOF
#if($util.isNull($ctx.result))
null
#else
#set($owner = "")
#if($ctx.result.ownerCognitoSub && $ctx.result.ownerCognitoSub.S)
  #set($owner = $ctx.result.ownerCognitoSub.S)
#elseif($ctx.result.ownerCognitoSub)
  #set($owner = $ctx.result.ownerCognitoSub)
#end
#if($util.isNullOrEmpty($owner))
  $util.unauthorized()
#end
#if($owner != $ctx.identity.sub)
  $util.unauthorized()
#end

#set($rows = [])
#if($ctx.result.rankedCandidates && $ctx.result.rankedCandidates.L)
  #foreach($elem in $ctx.result.rankedCandidates.L)
    #if($elem.M)
      #set($flat = $util.dynamodb.toMapValues($elem.M))
      ## Defensive sanitization: ranking display rows must not leak internal identities.
      $util.qr($flat.remove("ownerCognitoSub"))
      $util.qr($flat.remove("candidateCognitoSub"))
      $util.qr($flat.remove("recruiterId"))
      $util.qr($rows.add($flat))
    #else
      $util.qr($rows.add($elem))
    #end
  #end
#elseif($ctx.result.rankedCandidates && $util.isList($ctx.result.rankedCandidates))
  #set($rows = $ctx.result.rankedCandidates)
#end

#set($jid = $ctx.args.jobId)
#if($ctx.result.jobId && $ctx.result.jobId.S)
  #set($jid = $ctx.result.jobId.S)
#elseif($ctx.result.jobId)
  #set($jid = $ctx.result.jobId)
#end

#set($u = $ctx.result.updatedAt)
#if($u && $u.S)
  #set($u = $u.S)
#elseif($u)
  #set($u = $u)
#end
#set($scoredAt = $null)
#if($ctx.result.scoredAt && $ctx.result.scoredAt.S)
  #set($scoredAt = $ctx.result.scoredAt.S)
#elseif($ctx.result.scoredAt)
  #set($scoredAt = $ctx.result.scoredAt)
#end
#set($candidateCount = 0)
#if($ctx.result.candidateCount && $ctx.result.candidateCount.N)
  #set($candidateCount = $util.toNumber($ctx.result.candidateCount.N))
#elseif($ctx.result.candidateCount)
  #set($candidateCount = $ctx.result.candidateCount)
#elseif($rows)
  #set($candidateCount = $rows.size())
#end
#set($pipelineRunId = $null)
#if($ctx.result.pipelineRunId && $ctx.result.pipelineRunId.S)
  #set($pipelineRunId = $ctx.result.pipelineRunId.S)
#elseif($ctx.result.pipelineRunId)
  #set($pipelineRunId = $ctx.result.pipelineRunId)
#end
#set($scoringVersion = $null)
#if($ctx.result.scoringVersion && $ctx.result.scoringVersion.S)
  #set($scoringVersion = $ctx.result.scoringVersion.S)
#elseif($ctx.result.scoringVersion)
  #set($scoringVersion = $ctx.result.scoringVersion)
#end
#set($jdVersion = $null)
#if($ctx.result.jdVersion && $ctx.result.jdVersion.S)
  #set($jdVersion = $ctx.result.jdVersion.S)
#elseif($ctx.result.jdVersion)
  #set($jdVersion = $ctx.result.jdVersion)
#end
$util.toJson({
  "jobId": $jid,
  "rankedCandidates": $rows,
  "candidateCount": $candidateCount,
  "updatedAt": $u,
  "scoredAt": $scoredAt,
  "pipelineRunId": $pipelineRunId,
  "scoringVersion": $scoringVersion,
  "jdVersion": $jdVersion
})
#end
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "list_recruiter_jobs" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "listRecruiterJobs"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub))
  $util.unauthorized()
#end
#set($lim = 25)
#if($ctx.args.limit)
  #set($lim = $ctx.args.limit)
#end
#if($lim > 50)
  #set($lim = 50)
#end
#if($lim < 1)
  #set($lim = 1)
#end
{
  "version": "2018-05-29",
  "operation": "Query",
  "index": "GSI2",
  "query": {
    "expression": "GSI2PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson($ctx.identity.sub)
    }
  },
  "scanIndexForward": false,
  "limit": $lim
  #if(!$util.isNullOrEmpty($ctx.args.nextToken))
  ,"nextToken": $util.toJson($ctx.args.nextToken)
  #end
}
EOF

  response_template = <<EOF
#set($items = [])
#if($ctx.result.items)
  #foreach($it in $ctx.result.items)
    #set($entry = {})

    #set($jid = $null)
    #if($it.jobId && $it.jobId.S)
      #set($jid = $it.jobId.S)
    #elseif($it.jobId)
      #set($jid = $it.jobId)
    #end

    #set($pk = $null)
    #if($it.PK && $it.PK.S)
      #set($pk = $it.PK.S)
    #elseif($it.PK)
      #set($pk = $it.PK)
    #end

    #if($util.isNullOrEmpty($jid) && !$util.isNullOrEmpty($pk))
      #if($pk.startsWith("JOB#"))
        #set($jid = $pk.substring(4))
      #end
    #end

    #set($jobTitle = $null)
    #if($it.jobTitle && $it.jobTitle.S)
      #set($jobTitle = $it.jobTitle.S)
    #elseif($it.jobTitle)
      #set($jobTitle = $it.jobTitle)
    #end

    #set($companyName = $null)
    #if($it.companyName && $it.companyName.S)
      #set($companyName = $it.companyName.S)
    #elseif($it.companyName)
      #set($companyName = $it.companyName)
    #end

    #set($location = $null)
    #if($it.location && $it.location.S)
      #set($location = $it.location.S)
    #elseif($it.location)
      #set($location = $it.location)
    #end

    #set($updatedAt = $null)
    #if($it.updatedAt && $it.updatedAt.S)
      #set($updatedAt = $it.updatedAt.S)
    #elseif($it.updatedAt && $it.updatedAt.N)
      #set($updatedAt = $it.updatedAt.N)
    #elseif($it.updatedAt)
      #set($updatedAt = $it.updatedAt)
    #end

    #set($parseStatus = $null)
    #if($it.parseStatus && $it.parseStatus.S)
      #set($parseStatus = $it.parseStatus.S)
    #elseif($it.parseStatus)
      #set($parseStatus = $it.parseStatus)
    #end

    #set($status = $null)
    #if($it.status && $it.status.S)
      #set($status = $it.status.S)
    #elseif($it.status)
      #set($status = $it.status)
    #end

    $util.qr($entry.put("jobId", $jid))
    $util.qr($entry.put("jobTitle", $jobTitle))
    $util.qr($entry.put("companyName", $companyName))
    $util.qr($entry.put("location", $location))
    $util.qr($entry.put("updatedAt", $updatedAt))
    $util.qr($entry.put("parseStatus", $parseStatus))
    $util.qr($entry.put("status", $status))
    $util.qr($items.add($entry))
  #end
#end
$util.toJson({
  "items": $items,
  "nextToken": $ctx.result.nextToken
})
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "list_job_catalog" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Query"
  field       = "listJobCatalog"
  data_source = aws_appsync_datasource.application_tracking_ddb[0].name

  request_template = <<EOF
#if($util.isNullOrEmpty($ctx.identity.sub))
  $util.unauthorized()
#end
#set($lim = 25)
#if($ctx.args.limit)
  #set($lim = $ctx.args.limit)
#end
#if($lim > 100)
  #set($lim = 100)
#end
#if($lim < 1)
  #set($lim = 1)
#end
{
  "version": "2018-05-29",
  "operation": "Scan",
  "filter": {
    "expression": "begins_with(#pk, :jobPrefix) AND #sk = :metaSk",
    "expressionNames": {
      "#pk": "PK",
      "#sk": "SK"
    },
    "expressionValues": {
      ":jobPrefix": $util.dynamodb.toDynamoDBJson("JOB#"),
      ":metaSk": $util.dynamodb.toDynamoDBJson("METADATA")
    }
  },
  "limit": $lim
  #if(!$util.isNullOrEmpty($ctx.args.nextToken))
  ,"nextToken": $util.toJson($ctx.args.nextToken)
  #end
}
EOF

  response_template = <<EOF
#set($items = [])
#if($ctx.result.items)
  #foreach($it in $ctx.result.items)
    #set($entry = {})

    #set($jid = $null)
    #if($it.jobId && $it.jobId.S)
      #set($jid = $it.jobId.S)
    #elseif($it.jobId)
      #set($jid = $it.jobId)
    #end

    #set($pk = $null)
    #if($it.PK && $it.PK.S)
      #set($pk = $it.PK.S)
    #elseif($it.PK)
      #set($pk = $it.PK)
    #end

    #if($util.isNullOrEmpty($jid) && !$util.isNullOrEmpty($pk))
      #if($pk.startsWith("JOB#"))
        #set($jid = $pk.substring(4))
      #end
    #end

    #set($jobTitle = $null)
    #if($it.jobTitle && $it.jobTitle.S)
      #set($jobTitle = $it.jobTitle.S)
    #elseif($it.jobTitle)
      #set($jobTitle = $it.jobTitle)
    #end

    #set($companyName = $null)
    #if($it.companyName && $it.companyName.S)
      #set($companyName = $it.companyName.S)
    #elseif($it.companyName)
      #set($companyName = $it.companyName)
    #end

    #set($location = $null)
    #if($it.location && $it.location.S)
      #set($location = $it.location.S)
    #elseif($it.location)
      #set($location = $it.location)
    #end

    #set($employmentType = $null)
    #if($it.employmentType && $it.employmentType.S)
      #set($employmentType = $it.employmentType.S)
    #elseif($it.employmentType)
      #set($employmentType = $it.employmentType)
    #end

    #set($experienceLevel = $null)
    #if($it.experienceLevel && $it.experienceLevel.S)
      #set($experienceLevel = $it.experienceLevel.S)
    #elseif($it.experienceLevel)
      #set($experienceLevel = $it.experienceLevel)
    #end

    #set($parseStatus = $null)
    #if($it.parseStatus && $it.parseStatus.S)
      #set($parseStatus = $it.parseStatus.S)
    #elseif($it.parseStatus)
      #set($parseStatus = $it.parseStatus)
    #end

    #set($status = $null)
    #if($it.status && $it.status.S)
      #set($status = $it.status.S)
    #elseif($it.status)
      #set($status = $it.status)
    #end

    #set($updatedAt = $null)
    #if($it.updatedAt && $it.updatedAt.S)
      #set($updatedAt = $it.updatedAt.S)
    #elseif($it.updatedAt)
      #set($updatedAt = $it.updatedAt)
    #end

    #set($requiredSkills = [])
    #if($it.requiredSkills && $it.requiredSkills.L)
      #foreach($elem in $it.requiredSkills.L)
        #if($elem.S)
          $util.qr($requiredSkills.add($elem.S))
        #end
      #end
    #elseif($it.requiredSkills && $it.requiredSkills.SS)
      #foreach($skill in $it.requiredSkills.SS)
        $util.qr($requiredSkills.add($skill))
      #end
    #elseif(!$util.isNull($it.requiredSkills) && $util.isList($it.requiredSkills))
      #set($requiredSkills = $it.requiredSkills)
    #end

    #set($salaryRange = $null)
    #if($it.salaryRange && $it.salaryRange.M)
      #set($sr = $it.salaryRange.M)
      #set($salaryEntry = {})
      #if($sr.min && $sr.min.N)
        $util.qr($salaryEntry.put("min", $util.toNumber($sr.min.N)))
      #elseif($sr.min)
        $util.qr($salaryEntry.put("min", $sr.min))
      #end
      #if($sr.max && $sr.max.N)
        $util.qr($salaryEntry.put("max", $util.toNumber($sr.max.N)))
      #elseif($sr.max)
        $util.qr($salaryEntry.put("max", $sr.max))
      #end
      #if($sr.currency && $sr.currency.S)
        $util.qr($salaryEntry.put("currency", $sr.currency.S))
      #elseif($sr.currency)
        $util.qr($salaryEntry.put("currency", $sr.currency))
      #end
      #set($salaryRange = $salaryEntry)
    #elseif(!$util.isNull($it.salaryRange))
      #set($salaryRange = $it.salaryRange)
    #end

    $util.qr($entry.put("jobId", $jid))
    $util.qr($entry.put("jobTitle", $jobTitle))
    $util.qr($entry.put("companyName", $companyName))
    $util.qr($entry.put("location", $location))
    $util.qr($entry.put("employmentType", $employmentType))
    $util.qr($entry.put("experienceLevel", $experienceLevel))
    $util.qr($entry.put("salaryRange", $salaryRange))
    $util.qr($entry.put("requiredSkills", $requiredSkills))
    $util.qr($entry.put("parseStatus", $parseStatus))
    $util.qr($entry.put("status", $status))
    $util.qr($entry.put("updatedAt", $updatedAt))
    $util.qr($items.add($entry))
  #end
#end
$util.toJson({
  "items": $items,
  "nextToken": $ctx.result.nextToken
})
EOF

  depends_on = [
    aws_appsync_graphql_api.smart_matching,
    aws_appsync_datasource.application_tracking_ddb,
    aws_iam_role_policy.appsync_ddb_getitem
  ]
}

resource "aws_appsync_resolver" "publish_job_suggestions" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Mutation"
  field       = "publishJobSuggestions"
  data_source = aws_appsync_datasource.smart_matching_none[0].name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "payload": {}
}
EOF

  response_template = <<EOF
#set($raw = $ctx.args.suggestions)
#if($util.isString($raw))
  #set($parsed = $util.parseJson($raw))
#else
  #set($parsed = $raw)
#end
#if($util.isNull($parsed))
  #set($parsed = [])
#end
$util.toJson({
  "candidateId": $ctx.args.candidateId,
  "suggestions": $parsed,
  "updatedAt": $ctx.args.updatedAt,
  "scoredAt": $ctx.args.scoredAt,
  "suggestionCount": $parsed.size(),
  "pipelineRunId": $ctx.args.pipelineRunId,
  "scoringVersion": $ctx.args.scoringVersion,
  "cvVersion": $ctx.args.cvVersion
})
EOF

  depends_on = [aws_appsync_graphql_api.smart_matching]
}

resource "aws_appsync_resolver" "publish_candidate_ranking" {
  count       = var.appsync_enabled ? 1 : 0
  api_id      = aws_appsync_graphql_api.smart_matching[0].id
  type        = "Mutation"
  field       = "publishCandidateRanking"
  data_source = aws_appsync_datasource.smart_matching_none[0].name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "payload": {
    "jobId": "$ctx.args.jobId",
    "rankedCandidates": $util.toJson($ctx.args.rankedCandidates),
    "updatedAt": $util.toJson($ctx.args.updatedAt),
    "scoredAt": $util.toJson($ctx.args.scoredAt),
    "candidateCount": $util.toJson($ctx.args.candidateCount),
    "pipelineRunId": $util.toJson($ctx.args.pipelineRunId),
    "scoringVersion": $util.toJson($ctx.args.scoringVersion),
    "jdVersion": $util.toJson($ctx.args.jdVersion)
  }
}
EOF

  response_template = <<EOF
#set($raw = $ctx.args.rankedCandidates)
#if($util.isString($raw))
  #set($parsed = $util.parseJson($raw))
#else
  #set($parsed = $raw)
#end
#if($util.isNull($parsed))
  #set($parsed = [])
#end
$util.toJson({
  "jobId": $ctx.args.jobId,
  "rankedCandidates": $parsed,
  "candidateCount": $ctx.args.candidateCount,
  "updatedAt": $ctx.args.updatedAt,
  "scoredAt": $ctx.args.scoredAt,
  "pipelineRunId": $ctx.args.pipelineRunId,
  "scoringVersion": $ctx.args.scoringVersion,
  "jdVersion": $ctx.args.jdVersion
})
EOF

  depends_on = [aws_appsync_graphql_api.smart_matching]
}
