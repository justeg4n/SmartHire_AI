/**
 * CandidateRankings Component for Recruiter Dashboard
 * Real-time ranked candidate list via AppSync subscription
 * Features:
 * - WebSocket connection to AppSync for real-time updates
 * - Shows top candidates ranked by match score
 * - Sort and filter capabilities
 * - Responsive table and card layouts
 * - Score breakdown visualization
 * - Quick action buttons (view profile, schedule interview)
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Users,
  TrendingUp,
  Mail,
  Phone,
  Github,
  Linkedin,
  Globe,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

import { useAppSyncSubscription, parseAWSJSON } from '@/hooks/useAppSyncSubscription'
import {
  ON_CANDIDATE_RANKING,
  normalizeRankedCandidateList,
  type CandidateRankingsResponse,
  type CandidateSuggestionData,
} from '@/lib/appSyncOperations'
import { fetchCandidateRankingSnapshot } from '@/lib/fetchRecruiterAppSyncQuery'

// UI Components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MatchInsightCard } from '../../shared/MatchInsightCard'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Candidate Card Component (Mobile View)
const displayCandidateName = (c: CandidateSuggestionData) =>
  c.contactInfo?.fullName?.trim() || `Candidate #${c.rank}`

const profilePath = (jobId: string, candidateId: string) =>
  `/recruiter/jobs/${encodeURIComponent(jobId)}/candidates/${encodeURIComponent(candidateId)}`

const CandidateCard = memo(
  ({ candidate, jobId }: { candidate: CandidateSuggestionData; jobId: string }) => (
    <MatchInsightCard
      score={Math.round(candidate.finalScore)}
      title={displayCandidateName(candidate)}
      subtitle={
        <>
          <span>{candidate.seniority}</span>
          <span>•</span>
          <span>{candidate.yearsExperience} years experience</span>
        </>
      }
      rightMeta={<Badge variant="outline">Rank #{candidate.rank}</Badge>}
      description={
        candidate.candidateSnapshot[0] ||
        'AI profile summary is being generated for this candidate.'
      }
      descriptionClassName="line-clamp-2"
      matchedGroups={candidate.matchedGroups ?? []}
      missingGroups={candidate.missingGroups ?? []}
      matchedSkills={candidate.matchedSkills ?? []}
      missingSkills={candidate.missingSkills ?? []}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to={profilePath(jobId, candidate.candidateId)}>View Profile</Link>
          </Button>
          <Button size="sm">Schedule Interview</Button>
        </>
      }
      footer={
        <>
          Hybrid Score: BI {Math.round(candidate.biEncoderScore)}% • CE{' '}
          {candidate.crossEncoderScore != null
            ? `${Math.round(candidate.crossEncoderScore)}%`
            : '—'}
          {candidate.interviewGuide?.length
            ? ` • Interview Qs: ${candidate.interviewGuide.length}`
            : ''}
          {candidate.scoreBreakdown?.enrichmentScore != null
            ? ` • Enrichment: ${Math.round(candidate.scoreBreakdown.enrichmentScore)}%`
            : ''}
        </>
      }
    />
  ),
)
CandidateCard.displayName = 'CandidateCard'

// Table Row Component
const CandidateTableRow = memo(
  ({ candidate, jobId }: { candidate: CandidateSuggestionData; jobId: string }) => (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="w-12 text-center font-bold">#{candidate.rank}</TableCell>
      <TableCell className="max-w-[200px]">
        <div className="leading-tight font-medium">{displayCandidateName(candidate)}</div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{candidate.seniority}</span>
          <span className="text-muted-foreground text-xs">({candidate.yearsExperience} yrs)</span>
          {candidate.applicationStatus ? (
            <Badge variant="outline" className="ml-1 text-xs">
              {candidate.applicationStatus}
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="text-sm font-semibold">{Math.round(candidate.finalScore)}%</div>
        <div className="text-muted-foreground flex justify-end gap-1 text-xs">
          <span>BE: {Math.round(candidate.biEncoderScore)}%</span>
          <span>
            CE:{' '}
            {candidate.crossEncoderScore != null
              ? `${Math.round(candidate.crossEncoderScore)}%`
              : '—'}
          </span>
        </div>
        {candidate.skillGapScore != null && (
          <div className="text-muted-foreground mt-0.5 text-xs">
            JD skills: {Math.round(candidate.skillGapScore)}%
          </div>
        )}
      </TableCell>
      <TableCell className="max-w-[360px]">
        <div className="space-y-1">
          <p className="line-clamp-2 text-xs leading-relaxed">
            {candidate.parsedProfile?.summary ||
              candidate.parsedProfile?.headline ||
              candidate.candidateSnapshot[0] ||
              'AI profile summary is being generated for this candidate.'}
          </p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
            <span>Matched: {(candidate.matchedSkills ?? []).length}</span>
            <span>Missing: {(candidate.missingSkills ?? []).length}</span>
            <span>Interview Qs: {(candidate.interviewGuide ?? []).length}</span>
            {candidate.schemaVersion ? <span>Schema: {candidate.schemaVersion}</span> : null}
          </div>
          {candidate.evidenceHighlights?.length ? (
            <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-[11px]">
              {candidate.evidenceHighlights.slice(0, 2).map((line) => (
                <li key={`${candidate.candidateId}-${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
            {candidate.contactInfo?.email ? (
              <a
                href={`mailto:${candidate.contactInfo.email}`}
                className="inline-flex items-center gap-1"
              >
                <Mail className="h-3 w-3" />
                <span>Email</span>
              </a>
            ) : null}
            {candidate.contactInfo?.phone ? (
              <a
                href={`tel:${candidate.contactInfo.phone}`}
                className="inline-flex items-center gap-1"
              >
                <Phone className="h-3 w-3" />
                <span>Phone</span>
              </a>
            ) : null}
            {candidate.contactInfo?.githubUrl ? (
              <a
                href={candidate.contactInfo.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
              >
                <Github className="h-3 w-3" />
                <span>GitHub</span>
              </a>
            ) : null}
            {candidate.contactInfo?.linkedinUrl ? (
              <a
                href={candidate.contactInfo.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
              >
                <Linkedin className="h-3 w-3" />
                <span>LinkedIn</span>
              </a>
            ) : null}
            {candidate.contactInfo?.portfolioUrl ? (
              <a
                href={candidate.contactInfo.portfolioUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                <span>Portfolio</span>
              </a>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={profilePath(jobId, candidate.candidateId)}>View</Link>
          </Button>
          <Button size="sm">Schedule</Button>
        </div>
      </TableCell>
    </TableRow>
  ),
)
CandidateTableRow.displayName = 'CandidateTableRow'

// Loading Skeleton
const CandidateRankingSkeleton = memo(() => (
  <Card>
    <CardHeader>
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-20 w-full" />
    </CardContent>
  </Card>
))
CandidateRankingSkeleton.displayName = 'CandidateRankingSkeleton'

// Main Component
interface CandidateRankingsProps {
  /**
   * Job ID to fetch candidate rankings for (required)
   */
  jobId: string
  /**
   * Maximum number of candidates to display
   * @default 5
   */
  maxCandidates?: number
  /**
   * Whether to show subscription status indicator
   * @default true
   */
  showStatus?: boolean
  /**
   * View mode for candidates (card or table)
   * @default 'table'
   */
  viewMode?: 'card' | 'table'
  /**
   * Callback to trigger a re-ranking pipeline run.
   * Passed from the parent (RecruiterJobDetailsPage) which owns the API token.
   */
  onRefreshRanking?: () => Promise<void>
  /**
   * When false, skips the large “AI-Matched Candidates” title block so the parent section can own the headline (dashboard / job detail pattern).
   * @default true
   */
  showRankingHeader?: boolean
  /**
   * Table results: `card` wraps in Card+CardHeader (“Top N”); `flush` uses a bordered overflow region only (avoids nested cards).
   * @default 'card'
   */
  tableChrome?: 'card' | 'flush'
}

export const CandidateRankings = memo(
  ({
    jobId,
    maxCandidates = 5,
    showStatus = true,
    viewMode = 'table',
    onRefreshRanking,
    showRankingHeader = true,
    tableChrome = 'card',
  }: CandidateRankingsProps) => {
    const [isRefreshing, setIsRefreshing] = useState(false)

    const handleRefreshClick = useCallback(async () => {
      if (!onRefreshRanking || isRefreshing) return
      setIsRefreshing(true)
      try {
        await onRefreshRanking()
      } finally {
        setIsRefreshing(false)
      }
    }, [onRefreshRanking, isRefreshing])
    // Memoize subscription options to prevent infinite loops
    const subscriptionOptions = useMemo(
      () => ({
        skip: !jobId,
        onError: (err: Error) => {
          console.error('Candidate rankings subscription error:', err.message)
          toast.error(`Failed to load candidate rankings: ${err.message}`)
        },
      }),
      [jobId],
    )

    const subscriptionVariables = useMemo(() => ({ jobId: jobId || '' }), [jobId])

    // Subscribe to candidate rankings
    const { data, loading, error } = useAppSyncSubscription<CandidateRankingsResponse>(
      ON_CANDIDATE_RANKING,
      subscriptionVariables,
      subscriptionOptions,
    )

    const [queryCandidates, setQueryCandidates] = useState<CandidateSuggestionData[]>([])
    const [queryLoading, setQueryLoading] = useState(false)
    const [queryUpdatedAt, setQueryUpdatedAt] = useState<string | null>(null)
    const [queryScoredAt, setQueryScoredAt] = useState<string | null>(null)
    const [queryScoringVersion, setQueryScoringVersion] = useState<string | null>(null)

    useEffect(() => {
      if (!jobId) {
        return
      }
      let cancelled = false
      Promise.resolve().then(() => {
        if (!cancelled) setQueryLoading(true)
      })
      fetchCandidateRankingSnapshot(jobId)
        .then((snapshot) => {
          if (!cancelled) {
            setQueryCandidates(snapshot.rows)
            setQueryUpdatedAt(snapshot.updatedAt)
            setQueryScoredAt(snapshot.scoredAt)
            setQueryScoringVersion(snapshot.scoringVersion)
          }
        })
        .catch((err) => {
          console.error('getCandidateRanking query failed:', err)
          if (!cancelled) {
            toast.error('Could not load saved rankings. Realtime updates still apply.')
            setQueryCandidates([])
          }
        })
        .finally(() => {
          if (!cancelled) setQueryLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, [jobId])

    const candidates = useMemo(() => {
      const sub = data?.onCandidateRanking
      if (sub && sub.jobId === jobId && sub.rankedCandidates != null) {
        try {
          const parsed = parseAWSJSON<unknown>(sub.rankedCandidates as string | unknown[])
          const rows = normalizeRankedCandidateList(parsed)
          return rows.slice(0, maxCandidates)
        } catch (err) {
          console.error('Failed to parse subscription candidate rankings:', err)
        }
      }
      return queryCandidates.slice(0, maxCandidates)
    }, [data, jobId, maxCandidates, queryCandidates])

    const liveUpdatedAt = data?.onCandidateRanking?.updatedAt ?? null
    const liveScoredAt = data?.onCandidateRanking?.scoredAt ?? null
    const liveScoringVersion = data?.onCandidateRanking?.scoringVersion ?? null
    const updatedAtLabel = liveUpdatedAt || queryUpdatedAt
    const scoredAtLabel = liveScoredAt || queryScoredAt
    const scoringVersionLabel = liveScoringVersion || queryScoringVersion

    const showLoading = (queryLoading && !candidates.length) || (loading && !candidates.length)
    const stateLabel =
      loading || queryLoading
        ? 'PROCESSING'
        : error && !queryCandidates.length
          ? 'FAILED'
          : !scoringVersionLabel
            ? 'STALE'
            : 'READY'

    // No job ID
    if (!jobId) {
      return (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">No Job Selected</p>
              <p className="text-sm text-amber-700">
                Please select a job posting to view candidate rankings.
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Error state
    if (error && !loading && !queryCandidates.length) {
      return (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-900">Connection Error</p>
              <p className="text-sm text-red-700">
                {error.message ||
                  'Failed to connect to candidate rankings. Please refresh the page.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )
    }

    const statusPill = showStatus ? (
      <div className="border-border/60 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${stateLabel === 'PROCESSING' ? 'bg-amber-500' : stateLabel === 'FAILED' ? 'bg-red-500' : stateLabel === 'STALE' ? 'bg-orange-500' : 'bg-emerald-500'}`}
        />
        <span className="text-muted-foreground">{stateLabel}</span>
      </div>
    ) : null

    const refreshButton = onRefreshRanking ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleRefreshClick()}
        disabled={isRefreshing}
        title="Re-run AI ranking for this job against all candidates in the pool"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        {isRefreshing ? 'Refreshing…' : 'Refresh ranking'}
      </Button>
    ) : null

    return (
      <div className="space-y-4">
        {showRankingHeader ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-2xl font-bold">
                <Users className="h-5 w-5 text-blue-500" />
                AI-Matched Candidates
              </h2>
              <p className="text-muted-foreground text-sm">
                {candidates.length > 0
                  ? `Showing ${candidates.length} top matches for this position`
                  : 'Waiting for ranked candidates...'}
              </p>
              {updatedAtLabel ? (
                <p className="text-muted-foreground text-xs">
                  Last synced: {new Date(updatedAtLabel).toLocaleString()}
                </p>
              ) : null}
              {scoredAtLabel ? (
                <p className="text-muted-foreground text-xs">
                  Scored at: {new Date(scoredAtLabel).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {refreshButton}
              {statusPill}
            </div>
          </div>
        ) : (
          <div className="border-border/40 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground min-w-0 space-y-0.5 text-xs">
              {candidates.length > 0 ? (
                <p className="text-foreground text-sm font-medium">
                  {candidates.length} ranked candidate{candidates.length === 1 ? '' : 's'}
                </p>
              ) : (
                <p className="text-sm">Waiting for ranked candidates…</p>
              )}
              {updatedAtLabel ? (
                <p>Last synced: {new Date(updatedAtLabel).toLocaleString()}</p>
              ) : null}
              {scoredAtLabel ? <p>Scored at: {new Date(scoredAtLabel).toLocaleString()}</p> : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {refreshButton}
              {statusPill}
            </div>
          </div>
        )}

        {/* Content */}
        {showLoading && !candidates.length ? (
          <div className={viewMode === 'card' ? 'grid auto-rows-max gap-4' : ''}>
            {[1, 2, 3].map((i) => (
              <CandidateRankingSkeleton key={i} />
            ))}
          </div>
        ) : candidates.length > 0 ? (
          viewMode === 'card' ? (
            <div className="grid auto-rows-max gap-4">
              {candidates.map((candidate) => (
                <CandidateCard key={candidate.candidateId} candidate={candidate} jobId={jobId} />
              ))}
            </div>
          ) : tableChrome === 'flush' ? (
            <div className="border-border/60 bg-card/30 overflow-hidden rounded-lg border">
              <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium">
                <TrendingUp className="text-muted-foreground h-4 w-4" />
                Top {candidates.length} candidates
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead className="text-right">Match Score</TableHead>
                      <TableHead>Candidate Summary</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => (
                      <CandidateTableRow
                        key={candidate.candidateId}
                        candidate={candidate}
                        jobId={jobId}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Top {candidates.length} Candidates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Rank</TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead className="text-right">Match Score</TableHead>
                        <TableHead>Candidate Summary</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.map((candidate) => (
                        <CandidateTableRow
                          key={candidate.candidateId}
                          candidate={candidate}
                          jobId={jobId}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <Users className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                No candidate rankings available yet. The ranking engine will process applications
                soon.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  },
)

CandidateRankings.displayName = 'CandidateRankings'
