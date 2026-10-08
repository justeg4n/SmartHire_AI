import { generateClient } from 'aws-amplify/api'

import {
  GET_CANDIDATE_JOB_METADATA,
  GET_JOB_METADATA,
  type GetCandidateJobMetadataQueryData,
  type GetJobMetadataQueryData,
  type JobMetadataDetail,
} from '@/lib/appSyncOperations'

export async function fetchJobMetadataQuery(jobId: string): Promise<JobMetadataDetail | null> {
  const client = generateClient()
  const result = await client.graphql({
    query: GET_JOB_METADATA,
    variables: { jobId },
    authMode: 'userPool',
  })

  // The client.graphql returns an object with `data`.
  if (!('data' in result)) {
    return null
  }

  const payload = (result.data as GetJobMetadataQueryData | undefined)?.getJobMetadata
  return payload ?? null
}

export async function fetchCandidateJobMetadataQuery(
  candidateId: string,
  jobId: string,
): Promise<JobMetadataDetail | null> {
  const client = generateClient()
  const result = await client.graphql({
    query: GET_CANDIDATE_JOB_METADATA,
    variables: { candidateId, jobId },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return null
  }

  const payload = (result.data as GetCandidateJobMetadataQueryData | undefined)
    ?.getJobMetadataForCandidate
  return payload ?? null
}
