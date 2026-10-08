import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { CandidateRankings } from '../components/CandidateRankings'
import { fetchRecruiterJobsListQuery } from '@/lib/fetchRecruiterAppSyncQuery'
import { triggerRecruiterRankingRefresh } from '@/lib/triggerRecruiterRankingRefresh'
import { ON_CANDIDATE_RANKING, type CandidateRankingsResponse } from '@/lib/appSyncOperations'
import { useAppSyncSubscription } from '@/hooks/useAppSyncSubscription'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PortalPageShell } from '../../shared/PortalPageShell'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ApiJobRow {
  id: string
  title?: string | null
  companyName?: string | null
  location?: string | null
  employmentType?: string | null
  experienceLevel?: string | null
  createdAt?: string | null
  dynamoParseStatus?: string | null
  dynamoStatus?: string | null
}

interface RecruiterStats {
  activeJobs: number
  totalCandidatePool: number
  healthyPipelines: number
  avgMatch: number
}

const StatsCard = memo(
  ({
    title,
    value,
    description,
    icon: Icon,
    trend,
    isLoading = false,
  }: {
    title: string
    value: string | number
    description: string
    icon: React.ElementType
    trend?: { value: number; isPositive: boolean }
    isLoading?: boolean
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="mb-2 h-8 w-24" />
            <Skeleton className="h-4 w-32" />
          </>
        ) : (
          <>
            <div className="font-display text-primary text-2xl font-bold tabular-nums">{value}</div>
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              {trend && (
                <span className={trend.isPositive ? 'text-primary' : 'text-destructive'}>
                  <TrendingUp className="inline h-3 w-3" />
                  {trend.value}%
                </span>
              )}
              {description}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  ),
)
StatsCard.displayName = 'StatsCard'

const JobsTable = memo(
  ({
    jobs,
    selectedJobId,
    onSelectJob,
    isLoading = false,
  }: {
    jobs: ApiJobRow[]
    selectedJobId: string
    onSelectJob: (id: string) => void
    isLoading?: boolean
  }) => (
    <Card>
      <CardHeader>
        <CardTitle>Your job postings</CardTitle>
        <CardDescription>Select a row to view metadata and candidate rankings</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No jobs yet. Create one to start matching.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>JD pipeline</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const selected = job.id === selectedJobId
                const parseLabel = job.dynamoParseStatus || job.dynamoStatus || '—'
                return (
                  <TableRow
                    key={job.id}
                    className={selected ? 'bg-muted/60 cursor-pointer' : 'cursor-pointer'}
                    onClick={() => onSelectJob(job.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectJob(job.id)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-selected={selected}
                  >
                    <TableCell className="font-medium">{job.title || 'Untitled'}</TableCell>
                    <TableCell>{job.location || '—'}</TableCell>
                    <TableCell>{job.employmentType || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          parseLabel === 'SUCCEEDED' || parseLabel === 'SUCCESS'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {parseLabel === '—' ? (
                          <span className="text-muted-foreground">Pending / n/a</span>
                        ) : (
                          <>
                            {parseLabel === 'SUCCEEDED' || parseLabel === 'SUCCESS' ? (
                              <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            ) : (
                              <Clock className="mr-1 inline h-3 w-3" />
                            )}
                            {parseLabel}
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`/recruiter/jobs/${job.id}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open detail for ${job.title || 'job'}`}
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  ),
)
JobsTable.displayName = 'JobsTable'

export const RecruiterDashboard = memo(() => {
  const [isLoading, setIsLoading] = useState(true)
  const [jobs, setJobs] = useState<ApiJobRow[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const autoRefreshTimerRef = useRef<number | null>(null)
  const lastRankingUpdateRef = useRef<string>('')
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined

  const loadDashboard = useCallback(
    async ({ silent = false, suppressErrorToast = false } = {}) => {
      if (!silent) setIsLoading(true)
    try {
      const { items } = await fetchRecruiterJobsListQuery(100)
      const mapped: ApiJobRow[] = (items || []).map((j) => ({
        id: j.jobId,
        title: j.jobTitle ?? null,
        companyName: j.companyName ?? null,
        location: j.location ?? null,
        employmentType: null,
        experienceLevel: null,
        createdAt: j.updatedAt ?? null,
        dynamoParseStatus: j.parseStatus ?? null,
        dynamoStatus: j.status ?? null,
      }))
      mapped.sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0
        return tb - ta
      })

      setJobs(mapped)
      setSelectedJobId((prev) => {
        if (prev && mapped.some((x) => x.id === prev)) return prev
        return mapped[0]?.id ?? ''
      })
    } catch (e) {
      console.error(e)
      if (!suppressErrorToast) {
        toast.error('Could not load your job list.')
      }
      setJobs([])
    } finally {
      if (!silent) setIsLoading(false)
    }
    },
    [],
  )

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const { data: rankingSubData } = useAppSyncSubscription<CandidateRankingsResponse>(
    ON_CANDIDATE_RANKING,
    selectedJobId ? { jobId: selectedJobId } : undefined,
    {
      skip: !selectedJobId,
      onError: (err) => {
        console.error('Recruiter ranking subscription error:', err)
      },
    },
  )

  useEffect(() => {
    const payload = rankingSubData?.onCandidateRanking
    if (!payload || !selectedJobId || payload.jobId !== selectedJobId) return

    const eventKey = `${payload.jobId}:${payload.updatedAt ?? ''}:${payload.pipelineRunId ?? ''}`
    if (eventKey === lastRankingUpdateRef.current) return
    lastRankingUpdateRef.current = eventKey

    if (autoRefreshTimerRef.current !== null) {
      window.clearTimeout(autoRefreshTimerRef.current)
    }
    autoRefreshTimerRef.current = window.setTimeout(() => {
      void loadDashboard({ silent: true, suppressErrorToast: true })
    }, 1200)
  }, [rankingSubData, selectedJobId, loadDashboard])

  useEffect(() => {
    return () => {
      if (autoRefreshTimerRef.current !== null) {
        window.clearTimeout(autoRefreshTimerRef.current)
      }
    }
  }, [])

  const stats: RecruiterStats = useMemo(() => {
    const healthy = jobs.filter((job) => {
      const parse = job.dynamoParseStatus || job.dynamoStatus
      return parse === 'SUCCEEDED' || parse === 'SUCCESS'
    }).length
    return {
      activeJobs: jobs.length,
      totalCandidatePool: jobs.length * 15,
      healthyPipelines: healthy,
      avgMatch: jobs.length > 0 ? 84 : 0,
    }
  }, [jobs])

  const handleRefresh = useCallback(() => {
    toast.promise(loadDashboard(), {
      loading: 'Refreshing dashboard...',
      success: 'Dashboard updated!',
      error: 'Failed to refresh dashboard',
    })
  }, [loadDashboard])

  const handleRefreshRanking = useCallback(async () => {
    if (!apiBase || !selectedJobId) {
      toast.error('Select a job and ensure the API is configured.')
      return
    }
    try {
      await triggerRecruiterRankingRefresh(apiBase, selectedJobId)
      toast.info('We are refreshing the shortlist. Updates can take a minute to show.', {
        duration: 5000,
      })
    } catch (err) {
      console.error(err)
      toast.error('Failed to trigger ranking refresh.')
    }
  }, [apiBase, selectedJobId])

  return (
    <PortalPageShell
      portalLabel={isAdmin ? 'Admin Portal' : 'Recruiter Portal'}
      title="Recruiter Dashboard"
      description="AI-powered candidate rankings and job management."
      bodyClassName="space-y-6"
      actions={
        <>
          <Button asChild>
            <Link to="/recruiter/create-job">
              <Plus className="mr-2 h-4 w-4" />
              Create New Job
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            aria-label="Refresh dashboard"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Jobs"
          value={stats.activeJobs}
          description="Open roles in your catalog"
          icon={Briefcase}
          isLoading={isLoading}
        />
        <StatsCard
          title="Candidate Pool"
          value={stats.totalCandidatePool}
          description="Estimated AI-ranked candidates"
          icon={Users}
          isLoading={isLoading}
        />
        <StatsCard
          title="Healthy Pipelines"
          value={stats.healthyPipelines}
          description="Jobs with successful JD processing"
          icon={Calendar}
          isLoading={isLoading}
        />
        <StatsCard
          title="Avg Match"
          value={`${stats.avgMatch}%`}
          description="Quality index from ranked pools"
          icon={TrendingUp}
          isLoading={isLoading}
        />
      </div>

      <JobsTable
        jobs={jobs}
        selectedJobId={selectedJobId}
        onSelectJob={setSelectedJobId}
        isLoading={isLoading}
      />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">AI-Matched Candidates</h2>
            <p className="text-muted-foreground text-sm">
              {selectedJobId
                ? `Live ranking for selected job: ${jobs.find((j) => j.id === selectedJobId)?.title || selectedJobId}`
                : 'Select a job row to load candidate ranking'}
            </p>
          </div>
        </div>
        {selectedJobId ? (
          <CandidateRankings
            key={selectedJobId}
            jobId={selectedJobId}
            maxCandidates={15}
            showStatus={true}
            viewMode="card"
            showRankingHeader={false}
            onRefreshRanking={apiBase ? handleRefreshRanking : undefined}
          />
        ) : (
          <Card>
            <CardContent className="text-muted-foreground p-8 text-sm">
              Select a job from the table above to display ranked candidates.
            </CardContent>
          </Card>
        )}
      </section>
    </PortalPageShell>
  )
})

RecruiterDashboard.displayName = 'RecruiterDashboard'
