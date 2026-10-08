export type AppStatus = 'applied' | 'reviewing' | 'interviewing'

/** RDS job catalog + shared job card shape */
export interface JobItem {
  jobId: string
  jobTitle: string
  seniority?: string
  companyName?: string
  requiredSkills?: string[]
  jdText?: string
  jdMarkdown?: string
  parseStatus?: string
  updatedAt?: string
  location?: string
  employmentType?: string
  experienceLevel?: string
  /** Normalized from API salary min/max when both present */
  salaryRange?: { min: number; max: number; currency?: string }
}

export interface JobSuggestion {
  jobId: string
  jobTitle: string
  company: string
  location: string
  biScore: number
  crossScore: number
  finalScore: number
  matchExplanation: string
  requiredSkills: string[]
  salary: string
}

export interface ApplicationItem {
  id: string
  jobTitle: string
  company: string
  status: AppStatus
  appliedDate: string
  matchScore: number
}
