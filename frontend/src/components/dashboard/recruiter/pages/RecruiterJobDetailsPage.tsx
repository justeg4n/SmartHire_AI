import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { ArrowLeft, PencilLine, RefreshCw } from 'lucide-react'

import { CandidateRankings } from '../components/CandidateRankings'
import { fetchJobMetadataQuery } from '@/lib/fetchRecruiterAppSyncQuery'
import { triggerRecruiterRankingRefresh } from '@/lib/triggerRecruiterRankingRefresh'
import type { JobMetadataDetail } from '@/lib/appSyncOperations'
import { employmentDisplayLabel, experienceDisplayLabel } from '../lib/recruiterJobFieldNormalize'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export const RecruiterJobDetailsPage = () => {
  const { jobId = '' } = useParams()

  const [metaLoadState, setMetaLoadState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [jobMeta, setJobMeta] = useState<JobMetadataDetail | null>(null)

  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  const editHref = `/recruiter/jobs/${encodeURIComponent(jobId)}/edit`

  const loadJobMetadata = useCallback(async () => {
    if (!jobId) {
      setMetaLoadState('done')
      return
    }

    setMetaLoadState('loading')
    try {
      const metadata = await fetchJobMetadataQuery(jobId)
      setJobMeta(metadata)
    } catch (err) {
      console.error(err)
      toast.error('Could not load this job. Try again in a moment.')
      setJobMeta(null)
    } finally {
      setMetaLoadState('done')
    }
  }, [jobId])

  useEffect(() => {
    void loadJobMetadata()
  }, [loadJobMetadata])

  const handleRefreshRanking = useCallback(async () => {
    if (!apiBase || !jobId) {
      toast.error('Saving changes to the job is unavailable in this environment.')
      return
    }
    try {
      await triggerRecruiterRankingRefresh(apiBase, jobId)
      toast.info('We are refreshing the shortlist. Updates can take a minute to show.', {
        duration: 5000,
      })
    } catch (err) {
      console.error(err)
      toast.error('Could not start a shortlist refresh.')
    }
  }, [apiBase, jobId])

  const parseStatus = useMemo(() => {
    return jobMeta?.parseStatus || jobMeta?.status || null
  }, [jobMeta])

  const jdPreview = (jobMeta?.jdMarkdown || jobMeta?.jdText || '').trim()

  if (!jobId) {
    return <p className="text-muted-foreground">Missing job id.</p>
  }

  const isLoadingMeta = metaLoadState === 'loading' || metaLoadState === 'idle'

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 py-4">
      <section className="border-border/70 from-muted/60 to-background rounded-2xl border bg-linear-to-br p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Button asChild variant="ghost" className="h-9 px-3">
              <Link to="/recruiter/jobs">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to jobs
              </Link>
            </Button>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                {jobMeta?.jobTitle?.trim() || 'Job detail'}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm md:text-base">
                {jobMeta?.companyName?.trim() || 'Recruiter job workspace'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadJobMetadata()}
              disabled={isLoadingMeta}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMeta ? 'animate-spin' : ''}`} />
              Refresh job info
            </Button>
            <Button asChild size="sm">
              <Link to={editHref}>
                <PencilLine className="mr-2 h-4 w-4" />
                Edit job
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <Card className="border-border/70 overflow-hidden">
          <CardHeader className="border-border/70 border-b pb-4">
            <CardTitle>Job context</CardTitle>
            <CardDescription>Metadata used by scoring and shortlist generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {!apiBase ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs leading-relaxed">
                Shortlist refresh is unavailable in this preview build. You can still inspect
                metadata and ranked candidates.
              </p>
            ) : null}

            {isLoadingMeta ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : !jobMeta ? (
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>We do not have saved details for this job yet.</p>
                <p>
                  Open{' '}
                  <Link
                    to={editHref}
                    className="text-primary font-medium underline-offset-4 hover:underline"
                  >
                    Edit job
                  </Link>{' '}
                  to add a description or upload a document if your workspace allows it.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-[11px] tracking-[0.12em] uppercase">
                        Role snapshot
                      </p>
                      <p className="text-base font-semibold md:text-lg">
                        {jobMeta.jobTitle?.trim() || 'Untitled role'}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {jobMeta.companyName?.trim() || 'Company not provided'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {parseStatus ? <Badge variant="secondary">{parseStatus}</Badge> : null}
                      {jobMeta.status ? <Badge variant="outline">{jobMeta.status}</Badge> : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <div className="bg-muted/40 rounded-lg border p-3">
                    <p className="text-muted-foreground text-[11px] uppercase">Job id</p>
                    <p className="font-mono text-sm">{jobId}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg border p-3">
                    <p className="text-muted-foreground text-[11px] uppercase">Last updated</p>
                    <p className="font-mono text-sm">{formatDateTime(jobMeta.updatedAt)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg border p-3">
                    <p className="text-muted-foreground text-[11px] uppercase">Location</p>
                    <p className="text-sm font-medium">{jobMeta.location?.trim() || '—'}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg border p-3">
                    <p className="text-muted-foreground text-[11px] uppercase">Employment type</p>
                    <p className="text-sm font-medium">
                      {jobMeta.employmentType
                        ? employmentDisplayLabel(jobMeta.employmentType)
                        : '—'}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded-lg border p-3">
                    <p className="text-muted-foreground text-[11px] uppercase">Experience level</p>
                    <p className="text-sm font-medium">
                      {jobMeta.experienceLevel
                        ? experienceDisplayLabel(jobMeta.experienceLevel)
                        : '—'}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded-lg border p-3">
                    <p className="text-muted-foreground text-[11px] uppercase">Salary range</p>
                    <p className="font-mono text-sm">
                      {jobMeta.salaryRange
                        ? `${jobMeta.salaryRange.currency || 'USD'} ${jobMeta.salaryRange.min ?? '—'} - ${jobMeta.salaryRange.max ?? '—'}`
                        : '—'}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded-lg border p-3 md:col-span-2 xl:col-span-3">
                    <p className="text-muted-foreground text-[11px] uppercase">
                      Document processing
                    </p>
                    <p className="text-sm font-medium">{parseStatus ?? '—'}</p>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => void loadJobMetadata()}>
                Refresh metadata
              </Button>
              <Button type="button" onClick={() => void handleRefreshRanking()} disabled={!apiBase}>
                Refresh shortlist
              </Button>
            </div>
          </CardContent>
        </Card>

        {jobMeta?.requiredSkills?.length ? (
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Required skills</CardTitle>
              <CardDescription>Skills extracted for matching pipeline.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {jobMeta.requiredSkills.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70">
          <CardHeader className="border-border/60 border-b pb-4">
            <CardTitle>Job description</CardTitle>
            <CardDescription>
              Candidate-facing content. You can adjust this in{' '}
              <Link
                to={editHref}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                Edit job
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoadingMeta ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : jdPreview ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{jdPreview}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No job description text is available yet.
              </p>
            )}
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Matched candidates
              </h2>
              <p className="text-muted-foreground text-sm">
                Top candidates for this role, refreshed as scoring pipelines complete.
              </p>
            </div>
          </div>
          <CandidateRankings
            jobId={jobId}
            maxCandidates={15}
            showStatus={true}
            viewMode="card"
            showRankingHeader={false}
            onRefreshRanking={apiBase ? handleRefreshRanking : undefined}
          />
        </section>
      </section>
    </div>
  )
}
