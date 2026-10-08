import type { JobMetadataDetail } from '@/lib/appSyncOperations'

import { normalizeEmploymentType, normalizeExperienceLevel } from './recruiterJobFieldNormalize'

export type JobFormState = {
  title: string
  description: string
  location: string
  employmentType: string
  experienceLevel: string
  salaryMin: string
  salaryMax: string
}

export const emptyForm: JobFormState = {
  title: '',
  description: '',
  location: '',
  employmentType: 'full-time',
  experienceLevel: 'mid',
  salaryMin: '',
  salaryMax: '',
}

export function formFromMetadata(meta: JobMetadataDetail): JobFormState {
  const salary = meta.salaryRange
  return {
    title: meta.jobTitle ?? '',
    description: (meta.jdMarkdown || meta.jdText || '').trim(),
    location: meta.location ?? '',
    employmentType: normalizeEmploymentType(meta.employmentType),
    experienceLevel: normalizeExperienceLevel(meta.experienceLevel),
    salaryMin: salary?.min != null ? String(salary.min) : '',
    salaryMax: salary?.max != null ? String(salary.max) : '',
  }
}
