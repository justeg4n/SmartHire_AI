/**
 * AppSync GraphQL Operations for SmartHire Real-time Matching
 */

/**
 * Query: Load persisted JOB_SUGGESTIONS from DynamoDB (F5 / first paint).
 * Requires AppSync resolver getJobSuggestions + Cognito (sub must match candidateId).
 */
const JOB_SUGGESTION_FIELDS = `
  jobId
  jobTitle
  companyName
  finalScore
  biEncoderScore
  crossEncoderScore
  matchExplanation
  requiredSkills
  candidateSkills
  hardSkills
  processSkills
  softSkills
  domainExpertise
  skillGapScore
  skillCoverageMust
  skillCoverageOneOf
  skillCoverageNice
  skillCompositeScore
  hybridSemanticScore
  finalScoreV3
  mustPenaltyPoints
  skillSummarySchemaVersion
  skillSummary {
    schemaVersion
    required {
      must
      oneOfGroups {
        label
        options
      }
      nice
    }
    candidate {
      normalized
      hardSkills
      processSkills
      softSkills
      domainExpertise
    }
    match {
      must
      oneOf
      nice
    }
    missing {
      must
      oneOf
      nice
    }
    coverage {
      must
      oneOf
      nice
      oneOfSatisfiedCount
      oneOfTotalCount
    }
    weightsApplied {
      must
      one_of
      nice
    }
  }
  seniority
  location
  jobType
  salaryRange {
    min
    max
    currency
  }
`

export const GET_JOB_SUGGESTIONS = `
  query GetJobSuggestions($candidateId: String!) {
    getJobSuggestions(candidateId: $candidateId) {
      candidateId
      updatedAt
      scoredAt
      suggestionCount
      pipelineRunId
      scoringVersion
      cvVersion
      suggestions {
        ${JOB_SUGGESTION_FIELDS}
      }
    }
  }
`

export const GET_JOB_SUGGESTIONS_STATUS = `
  query GetJobSuggestionsStatus($candidateId: String!) {
    getJobSuggestionsStatus(candidateId: $candidateId) {
      candidateId
      hasRecord
      updatedAt
      scoredAt
      suggestionCount
      pipelineRunId
      scoringVersion
      cvVersion
    }
  }
`

export const GET_JOB_SUGGESTION_FOR_CANDIDATE = `
  query GetJobSuggestionForCandidate($candidateId: String!, $jobId: String!) {
    getJobSuggestionForCandidate(candidateId: $candidateId, jobId: $jobId) {
      ${JOB_SUGGESTION_FIELDS}
    }
  }
`

/** Query: CV rows exist in application_tracking (PK=CANDIDATE#id, SK begins with CV#). */
export const GET_CANDIDATE_CV_STATUS = `
  query GetCandidateCvStatus($candidateId: String!) {
    getCandidateCvStatus(candidateId: $candidateId) {
      candidateId
      hasCv
      status
      parseStatus
      errorMessage
      updatedAt
      cvVersion
      latestCvKey
      latestSuggestionCount
      latestSuggestionAt
      contactInfo {
        fullName
        email
        phone
        linkedinUrl
        githubUrl
        portfolioUrl
      }
      parsedProfile {
        headline
        summary
        yearsExperience
        skills
        education
        certifications
        languages
        projects
        professionalExperience
        domainExperience
        seniorityEvidence
        recencySignals
        strengths
        gaps
      }
    }
  }
`

export const GET_CANDIDATE_PROFILE_FOR_RECRUITER = `
  query GetCandidateProfileForRecruiter($jobId: String!, $candidateId: String!) {
    getCandidateProfileForRecruiter(jobId: $jobId, candidateId: $candidateId) {
      candidateId
      hasCv
      status
      parseStatus
      errorMessage
      updatedAt
      cvVersion
      latestCvKey
      latestSuggestionCount
      latestSuggestionAt
      contactInfo {
        fullName
        email
        phone
        linkedinUrl
        githubUrl
        portfolioUrl
      }
      parsedProfile {
        headline
        summary
        yearsExperience
        skills
        education
        certifications
        languages
        projects
        professionalExperience
        domainExperience
        seniorityEvidence
        recencySignals
        strengths
        gaps
      }
    }
  }
`

export const GET_CANDIDATE_RANKING = `
  query GetCandidateRanking($jobId: String!) {
    getCandidateRanking(jobId: $jobId) {
      jobId
      rankedCandidates
      candidateCount
      updatedAt
      scoredAt
      pipelineRunId
      scoringVersion
      jdVersion
    }
  }
`

export const GET_JOB_METADATA = `
  query GetJobMetadata($jobId: String!) {
    getJobMetadata(jobId: $jobId) {
      jobId
      jobTitle
      companyName
      jdText
      jdMarkdown
      location
      employmentType
      experienceLevel
      salaryRange {
        min
        max
        currency
      }
      requiredSkills
      parseStatus
      status
      updatedAt
    }
  }
`

export const GET_CANDIDATE_JOB_METADATA = `
  query GetCandidateJobMetadata($candidateId: String!, $jobId: String!) {
    getJobMetadataForCandidate(candidateId: $candidateId, jobId: $jobId) {
      jobId
      jobTitle
      companyName
      jdText
      jdMarkdown
      location
      employmentType
      experienceLevel
      salaryRange {
        min
        max
        currency
      }
      requiredSkills
      parseStatus
      status
      updatedAt
    }
  }
`

export const LIST_RECRUITER_JOBS = `
  query ListRecruiterJobs($limit: Int, $nextToken: String) {
    listRecruiterJobs(limit: $limit, nextToken: $nextToken) {
      items {
        jobId
        jobTitle
        companyName
        location
        updatedAt
        parseStatus
        status
      }
      nextToken
    }
  }
`

export const LIST_JOB_CATALOG = `
  query ListJobCatalog($limit: Int, $nextToken: String) {
    listJobCatalog(limit: $limit, nextToken: $nextToken) {
      items {
        jobId
        jobTitle
        companyName
        location
        employmentType
        experienceLevel
        salaryRange {
          min
          max
          currency
        }
        requiredSkills
        parseStatus
        status
        updatedAt
      }
      nextToken
    }
  }
`

/**
 * Subscription: Receive job suggestions for a candidate
 * Filters by candidateId - each client only receives their own suggestions
 */
export const ON_JOB_SUGGESTIONS = `
  subscription onJobSuggestions($candidateId: String!) {
    onJobSuggestions(candidateId: $candidateId) {
      candidateId
      updatedAt
      scoredAt
      suggestionCount
      pipelineRunId
      scoringVersion
      cvVersion
      suggestions {
        ${JOB_SUGGESTION_FIELDS}
      }
    }
  }
`

/**
 * Subscription: Receive ranked candidate list for a job posting
 * Filters by jobId - each recruiter only receives candidates for their posted jobs
 */
export const ON_CANDIDATE_RANKING = `
  subscription onCandidateRanking($jobId: String!) {
    onCandidateRanking(jobId: $jobId) {
      jobId
      rankedCandidates
      candidateCount
      updatedAt
      scoredAt
      pipelineRunId
      scoringVersion
      jdVersion
    }
  }
`

/**
 * Type definitions for subscription data
 */
export interface JobSuggestionData {
  jobId: string
  jobTitle?: string | null
  companyName?: string | null
  /** Backend uses 0–100 scale */
  finalScore?: number | null
  biEncoderScore?: number | null
  crossEncoderScore?: number | null
  matchExplanation?: string | null
  requiredSkills?: string[] | null
  /** Skills from the candidate's CV used for gap scoring (persisted per suggestion row). */
  candidateSkills?: string[] | null
  /** Structured skill breakdown (new schema) */
  hardSkills?: string[] | null
  processSkills?: string[] | null
  softSkills?: string[] | null
  domainExpertise?: string[] | null
  skillGapScore?: number | null
  skillCoverageMust?: number | null
  skillCoverageOneOf?: number | null
  skillCoverageNice?: number | null
  skillCompositeScore?: number | null
  hybridSemanticScore?: number | null
  finalScoreV3?: number | null
  mustPenaltyPoints?: number | null
  skillSummarySchemaVersion?: string | null
  skillSummary?: {
    schemaVersion?: string | null
    required?: {
      must?: string[] | null
      oneOfGroups?: Array<{ label?: string | null; options?: string[] | null }> | null
      nice?: string[] | null
    } | null
    candidate?: {
      normalized?: string[] | null
      hardSkills?: string[] | null
      processSkills?: string[] | null
      softSkills?: string[] | null
      domainExpertise?: string[] | null
    } | null
    match?: {
      must?: string[] | null
      oneOf?: string[] | null
      nice?: string[] | null
    } | null
    missing?: {
      must?: string[] | null
      oneOf?: string[] | null
      nice?: string[] | null
    } | null
    coverage?: {
      must?: number | null
      oneOf?: number | null
      nice?: number | null
      oneOfSatisfiedCount?: number | null
      oneOfTotalCount?: number | null
    } | null
    weightsApplied?: {
      must?: number | null
      one_of?: number | null
      nice?: number | null
    } | null
  } | null
  seniority?: string | null
  salaryRange?: {
    min: number
    max: number
    currency: string
  } | null
  location?: string | null
  jobType?: string | null
}

/** AppSync Query payload for getJobSuggestions */
export interface GetJobSuggestionsQueryData {
  getJobSuggestions: {
    candidateId: string
    suggestions: JobSuggestionData[]
    updatedAt: string | null
    scoredAt?: string | null
    suggestionCount: number
    pipelineRunId?: string | null
    scoringVersion?: string | null
    cvVersion?: string | null
  } | null
}

export interface GetJobSuggestionsStatusQueryData {
  getJobSuggestionsStatus: {
    candidateId: string
    hasRecord: boolean
    updatedAt: string | null
    scoredAt?: string | null
    suggestionCount?: number | null
    pipelineRunId?: string | null
    scoringVersion?: string | null
    cvVersion?: string | null
  } | null
}

export interface GetJobSuggestionForCandidateQueryData {
  getJobSuggestionForCandidate: JobSuggestionData | null
}

/** AppSync Query payload for getCandidateCvStatus */
export interface GetCandidateCvStatusQueryData {
  getCandidateCvStatus: {
    candidateId: string
    hasCv: boolean
    status?: string | null
    parseStatus?: string | null
    errorMessage?: string | null
    updatedAt?: string | null
    cvVersion?: string | null
    latestCvKey?: string | null
    latestSuggestionCount?: number | null
    latestSuggestionAt?: string | null
    contactInfo?: {
      fullName?: string | null
      email?: string | null
      phone?: string | null
      linkedinUrl?: string | null
      githubUrl?: string | null
      portfolioUrl?: string | null
    } | null
    parsedProfile?: CandidateParsedProfileData | null
  }
}

export interface CandidateParsedProfileData {
  headline?: string | null
  summary?: string | null
  yearsExperience?: number | null
  skills?: string[] | null
  education?: string[] | null
  certifications?: string[] | null
  languages?: string[] | null
  projects?: unknown | null
  professionalExperience?: unknown | null
  domainExperience?: string[] | null
  seniorityEvidence?: string[] | null
  recencySignals?: unknown | null
  strengths?: string | null
  gaps?: string | null
}

export interface CandidateCvStatusData {
  candidateId: string
  hasCv: boolean
  status?: string | null
  parseStatus?: string | null
  errorMessage?: string | null
  updatedAt?: string | null
  cvVersion?: string | null
  latestCvKey?: string | null
  latestSuggestionCount?: number | null
  latestSuggestionAt?: string | null
  contactInfo?: {
    fullName?: string | null
    email?: string | null
    phone?: string | null
    linkedinUrl?: string | null
    githubUrl?: string | null
    portfolioUrl?: string | null
  } | null
  parsedProfile?: CandidateParsedProfileData | null
}

export interface GetCandidateProfileForRecruiterQueryData {
  getCandidateProfileForRecruiter: CandidateCvStatusData | null
}

export interface JobSuggestionsResponse {
  onJobSuggestions: {
    candidateId: string
    suggestions: JobSuggestionData[]
    updatedAt: string
    scoredAt?: string | null
    suggestionCount: number
    pipelineRunId?: string | null
    scoringVersion?: string | null
    cvVersion?: string | null
  }
}

export interface CandidateSuggestionData {
  candidateId: string
  rank: number
  seniority: string
  yearsExperience: number
  /** Hybrid match score 0–100 from ranking engine */
  finalScore: number
  biEncoderScore: number
  crossEncoderScore?: number
  /** Display lines (split from AI snapshot string) */
  candidateSnapshot: string[]
  matchedSkills?: string[]
  missingSkills?: string[]
  matchedGroups?: Array<{ label: string; options: string[]; satisfied_by?: string }>
  missingGroups?: Array<{ label: string; options: string[]; satisfied_by?: string }>
  /** Share of required JD skills matched (0–100), same semantics as job suggestions */
  skillGapScore?: number
  interviewGuide?: unknown[]
  applicationStatus?: string
  profileUrl?: string
  contactInfo?: {
    fullName?: string
    email?: string
    phone?: string
    githubUrl?: string
    linkedinUrl?: string
    portfolioUrl?: string
  }
  parsedProfile?: {
    headline?: string
    summary?: string
    yearsExperience?: number
    skills?: string[]
    education?: string[]
    certifications?: string[]
    languages?: string[]
  }
  scoreBreakdown?: {
    hybridScore?: number
    projectRelevanceScore?: number
    experienceAlignmentScore?: number
    enrichmentScore?: number
    finalScore?: number
  }
  evidenceHighlights?: string[]
  schemaVersion?: string
}

/** Normalize one Dynamo/AppSync ranking row (scores are 0–100; snapshot may be string). */
export function normalizeRankedCandidateRow(raw: Record<string, unknown>): CandidateSuggestionData {
  const snap = raw.candidateSnapshot
  let snapshotLines: string[] = []
  if (typeof snap === 'string' && snap.trim()) {
    snapshotLines = snap
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  } else if (Array.isArray(snap)) {
    snapshotLines = snap.map(String).filter(Boolean)
  }

  const fs = Number(raw.finalScore)
  const bi = Number(raw.biEncoderScore)
  const ceRaw = raw.crossEncoderScore
  const ce = ceRaw != null && ceRaw !== '' ? Number(ceRaw) : undefined

  return {
    candidateId: String(raw.candidateId ?? ''),
    rank: Number(raw.rank ?? 0),
    seniority: String(raw.seniority ?? ''),
    yearsExperience: Number(raw.yearsExperience ?? 0),
    finalScore: Number.isFinite(fs) ? fs : 0,
    biEncoderScore: Number.isFinite(bi) ? bi : 0,
    crossEncoderScore: ce != null && Number.isFinite(ce) ? ce : undefined,
    candidateSnapshot: snapshotLines,
    matchedSkills: Array.isArray(raw.matchedSkills) ? raw.matchedSkills.map(String) : [],
    missingSkills: Array.isArray(raw.missingSkills) ? raw.missingSkills.map(String) : [],
    matchedGroups: Array.isArray(raw.matchedGroups) ? raw.matchedGroups as any[] : [],
    missingGroups: Array.isArray(raw.missingGroups) ? raw.missingGroups as any[] : [],
    skillGapScore:
      raw.skillGapScore != null && raw.skillGapScore !== '' ? Number(raw.skillGapScore) : undefined,
    interviewGuide: Array.isArray(raw.interviewGuide) ? raw.interviewGuide : [],
    applicationStatus:
      raw.applicationStatus != null && String(raw.applicationStatus).trim()
        ? String(raw.applicationStatus)
        : undefined,
    profileUrl:
      raw.profileUrl != null && String(raw.profileUrl).trim() ? String(raw.profileUrl) : undefined,
    contactInfo:
      raw.contactInfo != null && typeof raw.contactInfo === 'object'
        ? (raw.contactInfo as CandidateSuggestionData['contactInfo'])
        : undefined,
    parsedProfile:
      raw.parsedProfile != null && typeof raw.parsedProfile === 'object'
        ? (raw.parsedProfile as CandidateSuggestionData['parsedProfile'])
        : undefined,
    scoreBreakdown:
      raw.scoreBreakdown != null && typeof raw.scoreBreakdown === 'object'
        ? (raw.scoreBreakdown as CandidateSuggestionData['scoreBreakdown'])
        : undefined,
    evidenceHighlights: Array.isArray(raw.evidenceHighlights)
      ? raw.evidenceHighlights.map(String).filter(Boolean)
      : [],
    schemaVersion:
      raw.schemaVersion != null && String(raw.schemaVersion).trim()
        ? String(raw.schemaVersion)
        : undefined,
  }
}

export function normalizeRankedCandidateList(raw: unknown): CandidateSuggestionData[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => normalizeRankedCandidateRow(row as Record<string, unknown>))
}

/** Mirrors `JobMetadataDetail` in `iac/terraform/modules/processing/appsync_schema.graphql`. */
export interface JobMetadataDetail {
  jobId: string
  jobTitle?: string | null
  companyName?: string | null
  jdText?: string | null
  jdMarkdown?: string | null
  location?: string | null
  employmentType?: string | null
  experienceLevel?: string | null
  salaryRange?: {
    min: number
    max: number
    currency?: string | null
  } | null
  requiredSkills?: string[] | null
  parseStatus?: string | null
  status?: string | null
  updatedAt?: string | null
}

export interface GetCandidateRankingQueryData {
  getCandidateRanking: {
    jobId: string
    rankedCandidates: unknown
    updatedAt: string | null
    scoredAt?: string | null
    candidateCount?: number | null
    pipelineRunId?: string | null
    scoringVersion?: string | null
    jdVersion?: string | null
  } | null
}

export interface GetJobMetadataQueryData {
  getJobMetadata: JobMetadataDetail | null
}

export interface GetCandidateJobMetadataQueryData {
  getJobMetadataForCandidate: JobMetadataDetail | null
}

export interface RecruiterJobListItem {
  jobId: string
  jobTitle?: string | null
  companyName?: string | null
  location?: string | null
  updatedAt?: string | null
  parseStatus?: string | null
  status?: string | null
}

export interface JobCatalogListItem {
  jobId: string
  jobTitle?: string | null
  companyName?: string | null
  location?: string | null
  employmentType?: string | null
  experienceLevel?: string | null
  salaryRange?: {
    min?: number | null
    max?: number | null
    currency?: string | null
  } | null
  requiredSkills?: string[] | null
  parseStatus?: string | null
  status?: string | null
  updatedAt?: string | null
}

export interface ListRecruiterJobsQueryData {
  listRecruiterJobs: {
    items: RecruiterJobListItem[]
    nextToken?: string | null
  } | null
}

export interface ListJobCatalogQueryData {
  listJobCatalog: {
    items: JobCatalogListItem[]
    nextToken?: string | null
  } | null
}

export interface CandidateRankingsResponse {
  onCandidateRanking: {
    jobId: string
    rankedCandidates: string // AWSJSON
    updatedAt: string
    scoredAt?: string | null
    candidateCount?: number | null
    pipelineRunId?: string | null
    scoringVersion?: string | null
    jdVersion?: string | null
  }
}
