import type { JobItem } from '@/components/dashboard/candidate/components/types'

/** Backend `JobListItemResponse` JSON (camelCase); catalog responses include `description`. */
export interface JobCatalogApiItem {
  id: string
  title?: string | null
  companyName?: string | null
  description?: string | null
  createdAt?: string | null
  location?: string | null
  employmentType?: string | null
  experienceLevel?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
}

export function normalizeCatalogJob(row: JobCatalogApiItem): JobItem {
  const salaryRange =
    row.salaryMin != null && row.salaryMax != null
      ? { min: Number(row.salaryMin), max: Number(row.salaryMax), currency: 'USD' }
      : undefined

  return {
    jobId: String(row.id),
    jobTitle: row.title?.trim() ? row.title : 'Untitled role',
    companyName: row.companyName ?? undefined,
    jdText: row.description ?? undefined,
    updatedAt: row.createdAt ?? undefined,
    location: row.location ?? undefined,
    employmentType: row.employmentType ?? undefined,
    experienceLevel: row.experienceLevel ?? undefined,
    salaryRange,
  }
}

export function normalizeCatalogJobList(rows: unknown): JobItem[] {
  if (!Array.isArray(rows)) return []
  return rows.map((r) => normalizeCatalogJob(r as JobCatalogApiItem))
}
