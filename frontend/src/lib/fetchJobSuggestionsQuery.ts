import { generateClient } from 'aws-amplify/api'

import {
  GET_JOB_SUGGESTION_FOR_CANDIDATE,
  GET_JOB_SUGGESTIONS,
  GET_JOB_SUGGESTIONS_STATUS,
  type GetJobSuggestionForCandidateQueryData,
  type GetJobSuggestionsQueryData,
  type GetJobSuggestionsStatusQueryData,
  type JobSuggestionData,
} from '@/lib/appSyncOperations'

export type JobSuggestionsSnapshot = {
  /** True when DynamoDB has a JOB_SUGGESTIONS item for this candidate (may be an empty list). */
  hasRecord: boolean
  suggestions: JobSuggestionData[]
  updatedAt: string | null
  scoredAt: string | null
  pipelineRunId: string | null
  scoringVersion: string | null
  cvVersion: string | null
}

/** Metadata-only JOB_SUGGESTIONS row (no suggestion rows) — same Dynamo read, smaller GraphQL payload. */
export type JobSuggestionsStatusSnapshot = Omit<JobSuggestionsSnapshot, 'suggestions'>

/**
 * CV / pipeline status: same record as full snapshot but does not request or parse suggestion rows.
 */
export async function fetchJobSuggestionsStatusSnapshot(
  candidateId: string,
): Promise<JobSuggestionsStatusSnapshot> {
  const client = generateClient()
  const result = await client.graphql({
    query: GET_JOB_SUGGESTIONS_STATUS,
    variables: { candidateId },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return {
      hasRecord: false,
      updatedAt: null,
      scoredAt: null,
      pipelineRunId: null,
      scoringVersion: null,
      cvVersion: null,
    }
  }

  const payload = (result.data as GetJobSuggestionsStatusQueryData | undefined)
    ?.getJobSuggestionsStatus
  if (!payload || !payload.hasRecord) {
    return {
      hasRecord: false,
      updatedAt: null,
      scoredAt: null,
      pipelineRunId: null,
      scoringVersion: null,
      cvVersion: null,
    }
  }

  return {
    hasRecord: true,
    updatedAt: payload.updatedAt ?? null,
    scoredAt: payload.scoredAt ?? null,
    pipelineRunId: payload.pipelineRunId ?? null,
    scoringVersion: payload.scoringVersion ?? null,
    cvVersion: payload.cvVersion ?? null,
  }
}

/**
 * F5 / status checks: full snapshot so the UI can tell "never processed" from "processed, zero matches".
 */
export async function fetchJobSuggestionsSnapshot(
  candidateId: string,
): Promise<JobSuggestionsSnapshot> {
  const client = generateClient()
  const result = await client.graphql({
    query: GET_JOB_SUGGESTIONS,
    variables: { candidateId },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return {
      hasRecord: false,
      suggestions: [],
      updatedAt: null,
      scoredAt: null,
      pipelineRunId: null,
      scoringVersion: null,
      cvVersion: null,
    }
  }

  const payload = (result.data as GetJobSuggestionsQueryData | undefined)?.getJobSuggestions
  if (!payload) {
    return {
      hasRecord: false,
      suggestions: [],
      updatedAt: null,
      scoredAt: null,
      pipelineRunId: null,
      scoringVersion: null,
      cvVersion: null,
    }
  }

  const list = payload.suggestions
  return {
    hasRecord: true,
    suggestions: Array.isArray(list) ? list : [],
    updatedAt: payload.updatedAt ?? null,
    scoredAt: payload.scoredAt ?? null,
    pipelineRunId: payload.pipelineRunId ?? null,
    scoringVersion: payload.scoringVersion ?? null,
    cvVersion: payload.cvVersion ?? null,
  }
}

/**
 * Initial load: read JOB_SUGGESTIONS from DynamoDB via AppSync Query.
 */
export async function fetchJobSuggestionsQuery(candidateId: string): Promise<JobSuggestionData[]> {
  const snap = await fetchJobSuggestionsSnapshot(candidateId)
  return snap.suggestions
}

export async function fetchJobSuggestionForCandidateQuery(
  candidateId: string,
  jobId: string,
): Promise<JobSuggestionData | null> {
  const client = generateClient()
  const result = await client.graphql({
    query: GET_JOB_SUGGESTION_FOR_CANDIDATE,
    variables: { candidateId, jobId },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return null
  }

  const payload = (result.data as GetJobSuggestionForCandidateQueryData | undefined)
    ?.getJobSuggestionForCandidate
  return payload ?? null
}
