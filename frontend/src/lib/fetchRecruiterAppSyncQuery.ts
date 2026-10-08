import { generateClient } from 'aws-amplify/api'

import {
  GET_CANDIDATE_RANKING,
  GET_JOB_METADATA,
  LIST_JOB_CATALOG,
  LIST_RECRUITER_JOBS,
  normalizeRankedCandidateList,
  type CandidateSuggestionData,
  type GetCandidateRankingQueryData,
  type GetJobMetadataQueryData,
  type JobCatalogListItem,
  type JobMetadataDetail,
  type ListJobCatalogQueryData,
  type ListRecruiterJobsQueryData,
  type RecruiterJobListItem,
} from '@/lib/appSyncOperations'
import { parseAWSJSON } from '@/hooks/useAppSyncSubscription'

/**
 * Hydrate persisted ranking from DynamoDB (first paint / refresh).
 */
export async function fetchCandidateRankingQuery(
  jobId: string,
): Promise<CandidateSuggestionData[]> {
  if (!jobId) return []
  const client = generateClient()
  const result = await client.graphql({
    query: GET_CANDIDATE_RANKING,
    variables: { jobId },
    authMode: 'userPool',
  })

  if (!('data' in result)) return []

  const payload = (result.data as GetCandidateRankingQueryData | undefined)?.getCandidateRanking
  if (!payload?.rankedCandidates) return []

  const raw = payload.rankedCandidates
  const parsed = parseAWSJSON<unknown>(raw as string | unknown[])
  return normalizeRankedCandidateList(parsed)
}

export type CandidateRankingSnapshot = {
  rows: CandidateSuggestionData[]
  updatedAt: string | null
  scoredAt: string | null
  candidateCount: number
  pipelineRunId: string | null
  scoringVersion: string | null
  jdVersion: string | null
}

export async function fetchCandidateRankingSnapshot(
  jobId: string,
): Promise<CandidateRankingSnapshot> {
  if (!jobId)
    return {
      rows: [],
      updatedAt: null,
      scoredAt: null,
      candidateCount: 0,
      pipelineRunId: null,
      scoringVersion: null,
      jdVersion: null,
    }
  const client = generateClient()
  const result = await client.graphql({
    query: GET_CANDIDATE_RANKING,
    variables: { jobId },
    authMode: 'userPool',
  })

  if (!('data' in result))
    return {
      rows: [],
      updatedAt: null,
      scoredAt: null,
      candidateCount: 0,
      pipelineRunId: null,
      scoringVersion: null,
      jdVersion: null,
    }
  const payload = (result.data as GetCandidateRankingQueryData | undefined)?.getCandidateRanking
  if (!payload?.rankedCandidates)
    return {
      rows: [],
      updatedAt: payload?.updatedAt ?? null,
      scoredAt: payload?.scoredAt ?? null,
      candidateCount: payload?.candidateCount ?? 0,
      pipelineRunId: payload?.pipelineRunId ?? null,
      scoringVersion: payload?.scoringVersion ?? null,
      jdVersion: payload?.jdVersion ?? null,
    }

  const parsed = parseAWSJSON<unknown>(payload.rankedCandidates as string | unknown[])
  return {
    rows: normalizeRankedCandidateList(parsed),
    updatedAt: payload.updatedAt ?? null,
    scoredAt: payload.scoredAt ?? null,
    candidateCount: payload.candidateCount ?? 0,
    pipelineRunId: payload.pipelineRunId ?? null,
    scoringVersion: payload.scoringVersion ?? null,
    jdVersion: payload.jdVersion ?? null,
  }
}

export async function fetchJobMetadataQuery(jobId: string): Promise<JobMetadataDetail | null> {
  if (!jobId) return null
  const client = generateClient()
  const result = await client.graphql({
    query: GET_JOB_METADATA,
    variables: { jobId },
    authMode: 'userPool',
  })

  if (!('data' in result)) return null
  return (result.data as GetJobMetadataQueryData | undefined)?.getJobMetadata ?? null
}

export async function fetchRecruiterJobsListQuery(
  limit = 25,
): Promise<{ items: RecruiterJobListItem[]; nextToken: string | null }> {
  const client = generateClient()
  const result = await client.graphql({
    query: LIST_RECRUITER_JOBS,
    variables: { limit },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return { items: [], nextToken: null }
  }

  const payload = (result.data as ListRecruiterJobsQueryData | undefined)?.listRecruiterJobs
  if (!payload?.items) {
    return { items: [], nextToken: payload?.nextToken ?? null }
  }

  return {
    items: payload.items,
    nextToken: payload.nextToken ?? null,
  }
}

export async function fetchJobCatalogQuery(
  limit = 50,
): Promise<{ items: JobCatalogListItem[]; nextToken: string | null }> {
  const client = generateClient()
  const result = await client.graphql({
    query: LIST_JOB_CATALOG,
    variables: { limit },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return { items: [], nextToken: null }
  }

  const payload = (result.data as ListJobCatalogQueryData | undefined)?.listJobCatalog
  if (!payload?.items) {
    return { items: [], nextToken: payload?.nextToken ?? null }
  }

  return {
    items: payload.items,
    nextToken: payload.nextToken ?? null,
  }
}
