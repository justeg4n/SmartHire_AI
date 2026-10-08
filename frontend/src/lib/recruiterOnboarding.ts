import axios from 'axios'

export interface RecruiterOnboardingPayload {
  companyName: string
  taxCode?: string
}

export interface CurrentUserResponse {
  id: string
  email: string
  role: 'candidate' | 'recruiter' | 'admin'
  createdAt: string
  hasRecruiterProfile?: boolean
}

function getApiBaseUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!apiBase) {
    throw new Error('API base URL is not configured.')
  }
  return apiBase.replace(/\/$/, '')
}

export async function postRecruiterOnboarding(
  payload: RecruiterOnboardingPayload,
  token: string,
): Promise<void> {
  if (!token) {
    throw new Error('Missing auth token. Please login again.')
  }
  const apiBase = getApiBaseUrl()
  await axios.post(`${apiBase}/api/user/recruiter/onboarding`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function fetchCurrentUser(token: string): Promise<CurrentUserResponse> {
  if (!token) {
    throw new Error('Missing auth token. Please login again.')
  }
  const apiBase = getApiBaseUrl()
  const { data } = await axios.get<CurrentUserResponse>(`${apiBase}/api/user/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return data
}
