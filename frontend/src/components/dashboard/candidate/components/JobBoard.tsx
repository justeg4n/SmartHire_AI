import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Briefcase, Building2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import type { JobItem } from './types'
import { fetchJobCatalogQuery } from '@/lib/fetchRecruiterAppSyncQuery'
import type { JobCatalogListItem } from '@/lib/appSyncOperations'

export type { JobItem } from './types'

function mapCatalogItemToJob(item: JobCatalogListItem): JobItem {
  const salary = item.salaryRange
  const hasMin = salary?.min != null
  const hasMax = salary?.max != null
  const salaryRange =
    hasMin && hasMax
      ? {
          min: Number(salary?.min),
          max: Number(salary?.max),
          currency: salary?.currency ?? undefined,
        }
      : undefined

  return {
    jobId: item.jobId,
    jobTitle: item.jobTitle?.trim() || 'Untitled role',
    companyName: item.companyName?.trim() || 'SmartHire Network',
    requiredSkills: item.requiredSkills?.filter(Boolean) as string[] | undefined,
    jdText: undefined,
    parseStatus: item.parseStatus ?? undefined,
    updatedAt: item.updatedAt ?? undefined,
    location: item.location ?? undefined,
    employmentType: item.employmentType ?? undefined,
    experienceLevel: item.experienceLevel ?? undefined,
    salaryRange,
  }
}

export type JobBoardLayout = 'grid' | 'full'

interface JobBoardProps {
  /** `full` = single column, full-width cards (Open Jobs page). */
  layout?: JobBoardLayout
}

export function JobBoard({ layout = 'grid' }: JobBoardProps) {
  const navigate = useNavigate()
  const gridClass = layout === 'full' ? 'grid grid-cols-1 gap-4' : 'grid gap-4 md:grid-cols-2'

  const {
    data: fetchedJobs,
    error,
    isLoading,
  } = useSWR<JobItem[]>(
    ['job-catalog-list'],
    async () => {
      const result = await fetchJobCatalogQuery(100)
      return (result.items ?? []).map(mapCatalogItemToJob)
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  )

  const jobs =
    fetchedJobs && Array.isArray(fetchedJobs) && fetchedJobs.length > 0 ? fetchedJobs : []

  if (error) {
    console.error('JobBoard SWR Fetch Error:', error)
    toast.error('Failed to load live jobs.')
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Jobs</CardTitle>
          <CardDescription>Discover and apply to available roles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="text-primary h-5 w-5" />
          Open Jobs
        </CardTitle>
        <CardDescription>Browse and apply to available roles</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {jobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No jobs available right now. Check back later!
          </p>
        ) : (
          <div className={gridClass}>
            {jobs.map((job) => {
              return (
                <div
                  key={job.jobId}
                  className="bg-card/50 hover:border-primary/50 flex flex-col gap-3 rounded-xl border p-4 transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-foreground font-semibold">{job.jobTitle}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-muted-foreground flex items-center gap-1 text-sm">
                          <Building2 className="h-3 w-3" />
                          {job.companyName || 'Company TBD'}
                        </p>
                        {job.seniority && job.seniority !== 'Unknown' && (
                          <span className="bg-muted/80 text-muted-foreground rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                            {job.seniority}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {job.requiredSkills?.map((skill) => (
                          <Badge
                            key={skill}
                            variant="secondary"
                            className="bg-muted text-muted-foreground rounded-full px-2 py-0 text-[10px] font-medium tracking-wide"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="font-semibold"
                        onClick={() => navigate(`/apply/${job.jobId}`)}
                      >
                        Apply Role
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
