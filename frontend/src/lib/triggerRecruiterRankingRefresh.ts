import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'

/** Invokes backend to re-run JD + candidate ranking pipeline for a job (AppSync updates follow). */
export async function triggerRecruiterRankingRefresh(
  apiBase: string,
  jobId: string,
): Promise<void> {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString() || ''
  await axios.post(
    `${apiBase.replace(/\/$/, '')}/api/recruiter/jobs/${encodeURIComponent(jobId)}/refresh-ranking`,
    {},
    { headers: { Authorization: `Bearer ${token}` } },
  )
}
