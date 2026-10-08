/**
 * JobSuggestions Component for Candidate Dashboard
 * Real-time job suggestions via AppSync subscription
 * Features:
 * - WebSocket connection to AppSync for real-time updates
 * - Displays top matching jobs with scoring breakdown
 * - Responsive card layout with TailwindCSS + Radix UI
 * - Loading and error states
 * - Score visualization and skill badges
 */

import { memo, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Briefcase, MapPin, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { useAuthStore } from '@/store/authStore'
import { useAppSyncSubscription, parseAWSJSON } from '@/hooks/useAppSyncSubscription'
import {
  ON_JOB_SUGGESTIONS,
  type JobSuggestionsResponse,
  type JobSuggestionData,
} from '@/lib/appSyncOperations'
import { fetchJobSuggestionsSnapshot } from '@/lib/fetchJobSuggestionsQuery'
import { buildSkillSummaryView } from '@/lib/jobSuggestionSkillSummary'
import { scoreToPercent } from '@/lib/scoreUtils'
import { useCandidateCv } from '../context/CandidateCvContext'

// UI Components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MatchInsightCard } from '../../shared/MatchInsightCard'

// Job Card Component
const JobSuggestionCard = memo(({ job }: { job: JobSuggestionData }) => {
  const finalScore = scoreToPercent(job.finalScore)
  const skills = buildSkillSummaryView(job)

  return (
    <MatchInsightCard
      score={finalScore}
      title={job.jobTitle || 'Untitled job'}
      subtitle={
        <>
          <span>{job.companyName || 'Unknown company'}</span>
          {job.location ? (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
            </>
          ) : null}
        </>
      }
      rightMeta={
        job.salaryRange ? (
          <p className="text-primary text-base font-semibold whitespace-nowrap">
            ${job.salaryRange.min / 1000}k - ${job.salaryRange.max / 1000}k
          </p>
        ) : undefined
      }
      description={job.matchExplanation || 'No match explanation available.'}
      descriptionClassName="line-clamp-2"
      chips={[
        ...(job.location ? [`Location: ${job.location}`] : []),
        ...(job.jobType ? [`Type: ${job.jobType}`] : []),
        ...(job.salaryRange
          ? [
              `Salary: ${job.salaryRange.min.toLocaleString()} - ${job.salaryRange.max.toLocaleString()} ${job.salaryRange.currency}`,
            ]
          : []),
      ]}
      summarySkills={job.requiredSkills ?? []}
      matchedGroups={skills.matchedGroups}
      missingGroups={skills.missingGroups}
      matchedSkills={skills.matchedSkills}
      missingSkills={skills.missingSkills}
      actions={
        <>
          <Button asChild size="sm">
            <Link to={`/apply/${job.jobId}`}>View Details</Link>
          </Button>
          <Button variant="secondary" size="sm">
            Apply Now
          </Button>
        </>
      }
      footer={
        <>
          Hybrid Score: BI {scoreToPercent(job.biEncoderScore)}% • CE{' '}
          {job.crossEncoderScore != null ? `${scoreToPercent(job.crossEncoderScore)}%` : '—'} •
          Skill{' '}
          {job.skillCompositeScore != null ? ` ${scoreToPercent(job.skillCompositeScore)}%` : ' —'}
        </>
      }
    />
  )
})
JobSuggestionCard.displayName = 'JobSuggestionCard'

// Loading Skeleton
const JobSuggestionSkeleton = memo(() => (
  <Card className="border-border/50 gap-4 border py-5 shadow-sm">
    <CardHeader>
      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
    </CardContent>
  </Card>
))
JobSuggestionSkeleton.displayName = 'JobSuggestionSkeleton'

// Main Component
interface JobSuggestionsProps {
  /**
   * Maximum number of job suggestions to display
   * @default 5
   */
  maxSuggestions?: number
  /**
   * Whether to show subscription status indicator
   * @default true
   */
  showStatus?: boolean
}

export const JobSuggestions = memo(
  ({ maxSuggestions = 5, showStatus = true }: JobSuggestionsProps) => {
    const user = useAuthStore((state) => state.user)
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const { cvReady, pipelinePending } = useCandidateCv()
    const [hydrated, setHydrated] = useState<JobSuggestionData[]>([])
    const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | null>(null)

    useEffect(() => {
      if (!user?.id || !cvReady) {
        return
      }
      let cancelled = false
      fetchJobSuggestionsSnapshot(user.id)
        .then((snapshot) => {
          if (!cancelled) {
            setHydrated(snapshot.suggestions)
            setSnapshotUpdatedAt(snapshot.updatedAt)
          }
        })
        .catch((err) => {
          console.error('getJobSuggestions query failed:', err)
          if (!cancelled) toast.error('Could not load saved job suggestions.')
        })
      return () => {
        cancelled = true
      }
    }, [user?.id, cvReady])

    // Memoize subscription options to prevent infinite loops
    const subscriptionOptions = useMemo(
      () => ({
        skip: !isAuthenticated || !user?.id || !cvReady || pipelinePending,
        onError: (err: Error) => {
          console.error('Job suggestions subscription error:', err.message)
          toast.error(`Failed to load job suggestions: ${err.message}`)
        },
      }),
      [isAuthenticated, user?.id, cvReady, pipelinePending],
    )

    const subscriptionVariables = useMemo(() => ({ candidateId: user?.id || '' }), [user?.id])

    // Subscribe to job suggestions
    const { data, loading, error } = useAppSyncSubscription<JobSuggestionsResponse>(
      ON_JOB_SUGGESTIONS,
      subscriptionVariables,
      subscriptionOptions,
    )

    // Subscription payload (realtime) overrides hydrated Query result — including empty lists after publish
    const suggestions = useMemo(() => {
      const live = data?.onJobSuggestions
      if (live) {
        const raw = live.suggestions
        if (Array.isArray(raw)) {
          return raw.slice(0, maxSuggestions) as JobSuggestionData[]
        }
        if (typeof raw === 'string') {
          try {
            const parsed = parseAWSJSON<JobSuggestionData[]>(raw)
            if (Array.isArray(parsed)) {
              return parsed.slice(0, maxSuggestions)
            }
          } catch (err) {
            console.error('Failed to parse job suggestions:', err)
            toast.error('Failed to parse job suggestions')
          }
        }
      }
      return hydrated.slice(0, maxSuggestions)
    }, [data, hydrated, maxSuggestions])

    const liveUpdatedAt = data?.onJobSuggestions?.updatedAt ?? null
    const updatedAtLabel = liveUpdatedAt || snapshotUpdatedAt

    if (!cvReady || pipelinePending) {
      return null
    }

    // Not authenticated
    if (!isAuthenticated) {
      return (
        <Card className="gap-0 border border-amber-200/90 bg-amber-50/90 py-4 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-0 sm:px-6">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">Authentication Required</p>
              <p className="text-sm text-amber-700">
                Please log in to view personalized job suggestions.
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Error state
    if (error && !loading) {
      return (
        <Card className="gap-0 border border-red-200/90 bg-red-50/90 py-4 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-0 sm:px-6">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-900">Connection Error</p>
              <p className="text-sm text-red-700">
                {error.message ||
                  'Failed to connect to real-time suggestions. Please refresh the page.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <section className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Sparkles className="h-5 w-5 text-amber-500" />
              AI-Matched Jobs
            </h2>
            <p className="text-muted-foreground text-sm">
              Personalized recommendations based on your CV analysis
            </p>
            {updatedAtLabel ? (
              <p className="text-muted-foreground text-xs">
                Last synced: {new Date(updatedAtLabel).toLocaleString()}
              </p>
            ) : null}
          </div>
          {showStatus && (
            <div className="border-border/60 flex shrink-0 items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs sm:self-center">
              <div className={`h-2 w-2 rounded-full ${loading ? 'bg-amber-500' : 'bg-primary'}`} />
              <span className="text-muted-foreground">
                {loading ? 'Updating...' : 'Real-time Matches'}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        {loading && !suggestions.length ? (
          <div className="grid auto-rows-max gap-5">
            {[1, 2, 3].map((i) => (
              <JobSuggestionSkeleton key={i} />
            ))}
          </div>
        ) : suggestions.length > 0 ? (
          <div className="grid auto-rows-max gap-5">
            {suggestions.map((job) => (
              <JobSuggestionCard key={job.jobId} job={job} />
            ))}
          </div>
        ) : (
          <Card className="border-border/50 gap-0 border py-8 shadow-sm">
            <CardContent className="px-4 py-0 text-center sm:px-6">
              <Briefcase className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                {isAuthenticated
                  ? 'No AI matches yet. Upload your CV to get scored job recommendations.'
                  : 'No suggestions to display'}
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    )
  },
)

JobSuggestions.displayName = 'JobSuggestions'
