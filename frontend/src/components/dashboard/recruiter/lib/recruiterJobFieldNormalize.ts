/** Values match create-job form (`JobCreation`) and API FormData fields. */

export const EMPLOYMENT_VALUES = ['full-time', 'part-time', 'contract', 'internship'] as const
export type EmploymentValue = (typeof EMPLOYMENT_VALUES)[number]

export const EXPERIENCE_VALUES = ['entry', 'mid', 'senior', 'lead'] as const
export type ExperienceValue = (typeof EXPERIENCE_VALUES)[number]

const EMPLOYMENT_LABELS: Record<EmploymentValue, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

const EXPERIENCE_LABELS: Record<ExperienceValue, string> = {
  entry: 'Entry (0–2 yrs)',
  mid: 'Mid (3–5 yrs)',
  senior: 'Senior (6–10 yrs)',
  lead: 'Lead (10+ yrs)',
}

export function normalizeEmploymentType(raw: string | null | undefined): EmploymentValue {
  const s = (raw ?? '').trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
  if (s === 'fulltime' || s === 'full-time' || s === 'full_time') return 'full-time'
  if (s === 'parttime' || s === 'part-time' || s === 'part_time') return 'part-time'
  if (EMPLOYMENT_VALUES.includes(s as EmploymentValue)) return s as EmploymentValue
  return 'full-time'
}

export function normalizeExperienceLevel(raw: string | null | undefined): ExperienceValue {
  const s = (raw ?? '').trim().toLowerCase()
  if (EXPERIENCE_VALUES.includes(s as ExperienceValue)) return s as ExperienceValue
  if (/\blead\b|principal|staff/i.test(s)) return 'lead'
  if (/\bsenior\b|sr\.?|6\s*-\s*10|8\s*yrs/i.test(s)) return 'senior'
  if (/\bentry\b|junior|graduate|0\s*-\s*2/i.test(s)) return 'entry'
  if (/\bmid\b|intermediate|3\s*-\s*5/i.test(s)) return 'mid'
  return 'mid'
}

export function employmentDisplayLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—'
  const v = normalizeEmploymentType(raw)
  return EMPLOYMENT_LABELS[v]
}

export function experienceDisplayLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—'
  const v = normalizeExperienceLevel(raw)
  return EXPERIENCE_LABELS[v]
}
