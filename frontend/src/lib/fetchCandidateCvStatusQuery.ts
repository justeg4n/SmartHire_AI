import { generateClient } from 'aws-amplify/api'

import {
  GET_CANDIDATE_CV_STATUS,
  GET_CANDIDATE_PROFILE_FOR_RECRUITER,
  type CandidateParsedProfileData,
  type GetCandidateCvStatusQueryData,
  type GetCandidateProfileForRecruiterQueryData,
} from '@/lib/appSyncOperations'

export type CandidateCvStatusSnapshot = {
  candidateId: string
  hasCv: boolean
  status: string | null
  parseStatus: string | null
  errorMessage: string | null
  updatedAt: string | null
  cvVersion: string | null
  latestCvKey: string | null
  latestSuggestionCount: number | null
  latestSuggestionAt: string | null
  contactInfo: {
    fullName: string | null
    email: string | null
    phone: string | null
    linkedinUrl: string | null
    githubUrl: string | null
    portfolioUrl: string | null
  } | null
  parsedProfile: {
    headline: string | null
    summary: string | null
    yearsExperience: number | null
    skills: string[]
    education: string[]
    certifications: string[]
    languages: string[]
    projects: unknown[]
    professionalExperience: unknown[]
    domainExperience: string[]
    seniorityEvidence: string[]
    recencySignals: Record<string, unknown> | null
    strengths: string | null
    gaps: string | null
  } | null
}

function normalizeParsedProfile(
  parsedProfile: CandidateParsedProfileData | null | undefined,
): CandidateCvStatusSnapshot['parsedProfile'] {
  if (!parsedProfile) return null

  const projects = Array.isArray(parsedProfile.projects) ? parsedProfile.projects : []
  const professionalExperience = Array.isArray(parsedProfile.professionalExperience)
    ? parsedProfile.professionalExperience
    : []
  const recencySignals =
    parsedProfile.recencySignals && typeof parsedProfile.recencySignals === 'object'
      ? (parsedProfile.recencySignals as Record<string, unknown>)
      : null

  return {
    headline: parsedProfile.headline ?? null,
    summary: parsedProfile.summary ?? null,
    yearsExperience: parsedProfile.yearsExperience ?? null,
    skills: Array.isArray(parsedProfile.skills) ? parsedProfile.skills.map(String) : [],
    education: Array.isArray(parsedProfile.education) ? parsedProfile.education.map(String) : [],
    certifications: Array.isArray(parsedProfile.certifications)
      ? parsedProfile.certifications.map(String)
      : [],
    languages: Array.isArray(parsedProfile.languages) ? parsedProfile.languages.map(String) : [],
    projects,
    professionalExperience,
    domainExperience: Array.isArray(parsedProfile.domainExperience)
      ? parsedProfile.domainExperience.map(String)
      : [],
    seniorityEvidence: Array.isArray(parsedProfile.seniorityEvidence)
      ? parsedProfile.seniorityEvidence.map(String)
      : [],
    recencySignals,
    strengths: parsedProfile.strengths ?? null,
    gaps: parsedProfile.gaps ?? null,
  }
}

/**
 * Reads CV presence from DynamoDB via AppSync (SK prefix CV# under CANDIDATE#<id>).
 */
export async function fetchCandidateCvStatusQuery(
  candidateId: string,
): Promise<CandidateCvStatusSnapshot> {
  const client = generateClient()
  const result = await client.graphql({
    query: GET_CANDIDATE_CV_STATUS,
    variables: { candidateId },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return {
      candidateId,
      hasCv: false,
      status: null,
      parseStatus: null,
      errorMessage: null,
      updatedAt: null,
      cvVersion: null,
      latestCvKey: null,
      latestSuggestionCount: null,
      latestSuggestionAt: null,
      contactInfo: null,
      parsedProfile: null,
    }
  }

  const data = result.data as GetCandidateCvStatusQueryData | undefined
  const payload = data?.getCandidateCvStatus
  if (!payload) {
    return {
      candidateId,
      hasCv: false,
      status: null,
      parseStatus: null,
      errorMessage: null,
      updatedAt: null,
      cvVersion: null,
      latestCvKey: null,
      latestSuggestionCount: null,
      latestSuggestionAt: null,
      contactInfo: null,
      parsedProfile: null,
    }
  }

  return {
    candidateId: payload.candidateId,
    hasCv: payload.hasCv === true,
    status: payload.status ?? null,
    parseStatus: payload.parseStatus ?? null,
    errorMessage: payload.errorMessage ?? null,
    updatedAt: payload.updatedAt ?? null,
    cvVersion: payload.cvVersion ?? null,
    latestCvKey: payload.latestCvKey ?? null,
    latestSuggestionCount: payload.latestSuggestionCount ?? null,
    latestSuggestionAt: payload.latestSuggestionAt ?? null,
    contactInfo: payload.contactInfo
      ? {
          fullName: payload.contactInfo.fullName ?? null,
          email: payload.contactInfo.email ?? null,
          phone: payload.contactInfo.phone ?? null,
          linkedinUrl: payload.contactInfo.linkedinUrl ?? null,
          githubUrl: payload.contactInfo.githubUrl ?? null,
          portfolioUrl: payload.contactInfo.portfolioUrl ?? null,
        }
      : null,
    parsedProfile: normalizeParsedProfile(payload.parsedProfile),
  }
}

export async function fetchCandidateProfileForRecruiterQuery(
  jobId: string,
  candidateId: string,
): Promise<CandidateCvStatusSnapshot> {
  const client = generateClient()
  const result = await client.graphql({
    query: GET_CANDIDATE_PROFILE_FOR_RECRUITER,
    variables: { jobId, candidateId },
    authMode: 'userPool',
  })

  if (!('data' in result)) {
    return {
      candidateId,
      hasCv: false,
      status: null,
      parseStatus: null,
      errorMessage: null,
      updatedAt: null,
      cvVersion: null,
      latestCvKey: null,
      latestSuggestionCount: null,
      latestSuggestionAt: null,
      contactInfo: null,
      parsedProfile: null,
    }
  }

  const data = result.data as GetCandidateProfileForRecruiterQueryData | undefined
  const payload = data?.getCandidateProfileForRecruiter
  if (!payload) {
    return {
      candidateId,
      hasCv: false,
      status: null,
      parseStatus: null,
      errorMessage: null,
      updatedAt: null,
      cvVersion: null,
      latestCvKey: null,
      latestSuggestionCount: null,
      latestSuggestionAt: null,
      contactInfo: null,
      parsedProfile: null,
    }
  }

  return {
    candidateId: payload.candidateId,
    hasCv: payload.hasCv === true,
    status: payload.status ?? null,
    parseStatus: payload.parseStatus ?? null,
    errorMessage: payload.errorMessage ?? null,
    updatedAt: payload.updatedAt ?? null,
    cvVersion: payload.cvVersion ?? null,
    latestCvKey: payload.latestCvKey ?? null,
    latestSuggestionCount: payload.latestSuggestionCount ?? null,
    latestSuggestionAt: payload.latestSuggestionAt ?? null,
    contactInfo: payload.contactInfo
      ? {
          fullName: payload.contactInfo.fullName ?? null,
          email: payload.contactInfo.email ?? null,
          phone: payload.contactInfo.phone ?? null,
          linkedinUrl: payload.contactInfo.linkedinUrl ?? null,
          githubUrl: payload.contactInfo.githubUrl ?? null,
          portfolioUrl: payload.contactInfo.portfolioUrl ?? null,
        }
      : null,
    parsedProfile: normalizeParsedProfile(payload.parsedProfile),
  }
}
