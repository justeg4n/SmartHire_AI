import { memo, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import useSWR from 'swr'

import { Badge } from '@/components/ui/badge'
import { Building2, CheckCircle2, MapPin, Wallet, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

import type { JobItem } from '../components/types'
import { useAuthStore } from '@/store/authStore'
import { fetchJobSuggestionForCandidateQuery } from '@/lib/fetchJobSuggestionsQuery'
import { fetchCandidateJobMetadataQuery } from '@/lib/fetchJobMetadataQuery'
import { buildSkillSummaryView } from '@/lib/jobSuggestionSkillSummary'
import { scoreToPercent } from '@/lib/scoreUtils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCandidateCv } from '../context/CandidateCvContext'
import ReactMarkdown from 'react-markdown'
import { PortalPageShell } from '../../shared/PortalPageShell'
import { MatchInsightCard } from '../../shared/MatchInsightCard'

function normalizeJobId(raw?: string): string {
  if (!raw) return ''
  return raw.replace(/^JOB#/i, '').trim()
}

function normalizeSkillList(skills?: Array<string | null | undefined> | null): string[] {
  if (!skills?.length) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const raw of skills) {
    const label = raw?.trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(label)
  }
  return normalized
}

function formatJobDescription(text?: string): string {
  if (!text?.trim()) {
    return 'No job description has been provided for this role yet.'
  }
  return text.length > 12000 ? `${text.slice(0, 12000)}…` : text
}

function formatJobMarkdown(text?: string): string | null {
  const cleaned = text?.split('\0').join('').trim()
  if (!cleaned) return null
  return cleaned.length > 20000 ? `${cleaned.slice(0, 20000)}\n\n…` : cleaned
}

export const CandidateJobDetailsPage = memo(() => {
  const { jobId: rawJobId } = useParams<{ jobId: string }>()
  const user = useAuthStore((state) => state.user)
  const { cvReady, cvStatus } = useCandidateCv()
  const jobId = normalizeJobId(rawJobId)

  const { data: jobRaw, isLoading: catalogLoading } = useSWR(
    user?.id && jobId && cvReady ? ['candidate-job-metadata', user.id, jobId] : null,
    () => fetchCandidateJobMetadataQuery(user!.id, jobId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  )

  const job = useMemo((): JobItem | undefined => {
    if (!jobRaw) return undefined
    return {
      jobId: jobRaw.jobId,
      jobTitle: jobRaw.jobTitle || 'Untitled role',
      companyName: jobRaw.companyName ?? undefined,
      location: jobRaw.location ?? undefined,
      employmentType: jobRaw.employmentType ?? undefined,
      experienceLevel: jobRaw.experienceLevel ?? undefined,
      salaryRange: jobRaw.salaryRange
        ? {
            min: jobRaw.salaryRange.min,
            max: jobRaw.salaryRange.max,
            currency: jobRaw.salaryRange.currency ?? undefined,
          }
        : undefined,
      requiredSkills: jobRaw.requiredSkills ?? undefined,
      jdText: jobRaw.jdText ?? undefined,
      jdMarkdown: jobRaw.jdMarkdown ?? undefined,
      parseStatus: jobRaw.parseStatus ?? undefined,
      updatedAt: jobRaw.updatedAt ?? undefined,
    }
  }, [jobRaw])

  const { data: suggestion } = useSWR(
    user?.id && jobId && cvReady ? ['job-suggestion-item', user.id, jobId] : null,
    () => fetchJobSuggestionForCandidateQuery(user!.id, jobId),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const displayJob = useMemo((): JobItem | undefined => {
    if (job) return job
    if (!suggestion) return undefined
    return {
      jobId: jobId || suggestion.jobId,
      jobTitle: suggestion.jobTitle?.trim() || 'Untitled role',
      companyName: suggestion.companyName ?? undefined,
      requiredSkills: suggestion.requiredSkills ?? undefined,
    }
  }, [job, suggestion, jobId])

  const hasSuggestion = Boolean(suggestion)
  const matchScore = hasSuggestion ? scoreToPercent(suggestion?.finalScore) : 0
  const biScore = hasSuggestion ? scoreToPercent(suggestion?.biEncoderScore) : null
  const crossScore = hasSuggestion ? scoreToPercent(suggestion?.crossEncoderScore) : null
  const markdownContent = formatJobMarkdown(displayJob?.jdMarkdown)

  const skills = useMemo(
    () => (suggestion ? buildSkillSummaryView(suggestion) : null),
    [suggestion],
  )
  const strengths = suggestion?.matchExplanation ? [suggestion.matchExplanation] : []
  const growthAreas = skills?.missingSkills ?? []
  const matchedSkills = skills?.matchedSkills ?? []
  const missingSkills = skills?.missingSkills ?? []
  const cvSkills = normalizeSkillList(suggestion?.candidateSkills)
  // New structured skill breakdown
  const cvHardSkills = normalizeSkillList(skills?.cvHardSkills?.length ? skills.cvHardSkills : suggestion?.hardSkills ?? suggestion?.candidateSkills)
  const cvProcessSkills = normalizeSkillList(skills?.cvProcessSkills?.length ? skills.cvProcessSkills : suggestion?.processSkills)
  const cvSoftSkills = normalizeSkillList(skills?.cvSoftSkills?.length ? skills.cvSoftSkills : suggestion?.softSkills)
  const cvDomainExpertise = normalizeSkillList(skills?.cvDomainExpertise?.length ? skills.cvDomainExpertise : suggestion?.domainExpertise)
  const hasStructuredSkills = cvHardSkills.length > 0 || cvProcessSkills.length > 0
  const profile = cvStatus?.parsedProfile
  const requiredSkills = normalizeSkillList(
    suggestion?.requiredSkills ?? displayJob?.requiredSkills,
  )
  const domainEvidence = normalizeSkillList(profile?.domainExperience)
  const seniorityEvidence = normalizeSkillList(profile?.seniorityEvidence)
  const candidateProjects = Array.isArray(profile?.projects) ? profile.projects : []
  const hasParsedCvEvidence =
    cvHardSkills.length > 0 ||
    cvSkills.length > 0 ||
    domainEvidence.length > 0 ||
    seniorityEvidence.length > 0 ||
    Boolean(profile?.strengths) ||
    Boolean(profile?.gaps) ||
    candidateProjects.length > 0

  const locationLabel =
    suggestion?.location?.trim() || displayJob?.location?.trim() || 'See job description'
  const salaryLabel =
    (suggestion?.salaryRange &&
    typeof suggestion.salaryRange.min === 'number' &&
    typeof suggestion.salaryRange.max === 'number'
      ? `${suggestion.salaryRange.min.toLocaleString()} - ${suggestion.salaryRange.max.toLocaleString()} ${suggestion.salaryRange.currency ?? ''}`.trim()
      : null) ||
    (displayJob?.salaryRange &&
    typeof displayJob.salaryRange.min === 'number' &&
    typeof displayJob.salaryRange.max === 'number'
      ? `${displayJob.salaryRange.min.toLocaleString()} - ${displayJob.salaryRange.max.toLocaleString()} ${displayJob.salaryRange.currency ?? ''}`.trim()
      : null) ||
    'Compensation not listed'
  const jobTypeLabel = suggestion?.jobType?.trim() || displayJob?.employmentType?.trim()

  const matchInsightChips = useMemo(() => {
    const chips: string[] = []
    if (locationLabel && locationLabel !== 'See job description') {
      chips.push(`Location: ${locationLabel}`)
    }
    if (jobTypeLabel) chips.push(`Type: ${jobTypeLabel}`)
    const sr = suggestion?.salaryRange ?? displayJob?.salaryRange
    if (
      sr &&
      typeof sr.min === 'number' &&
      typeof sr.max === 'number' &&
      Number.isFinite(sr.min) &&
      Number.isFinite(sr.max)
    ) {
      chips.push(
        `Salary: ${sr.min.toLocaleString()} - ${sr.max.toLocaleString()} ${sr.currency ?? ''}`.trim(),
      )
    }
    return chips
  }, [locationLabel, jobTypeLabel, suggestion?.salaryRange, displayJob?.salaryRange])

  const matchInsightFooter = useMemo(() => {
    if (!suggestion) return null
    const gap =
      suggestion?.skillGapScore != null ? `${scoreToPercent(suggestion.skillGapScore)}%` : '—'
    return (
      <>
        Hybrid: BI {biScore != null ? `${biScore}%` : '—'} • CE{' '}
        {crossScore != null ? `${crossScore}%` : '—'} • Skill gap {gap}
      </>
    )
  }, [suggestion, biScore, crossScore])

  return (
    <PortalPageShell
      portalLabel="Candidate Portal"
      title={displayJob?.jobTitle || 'Job details'}
      description="Review role details, your AI match analysis, and upload a CV tailored for this position."
      bodyClassName="space-y-8"
    >
      {catalogLoading && !displayJob ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : !displayJob ? (
        <div className="bg-muted/20 rounded-xl border border-dashed p-16 text-center">
          <p className="text-muted-foreground text-lg font-medium">Job position not found.</p>
          <Button className="mt-6" variant="outline" asChild>
            <Link to="/apply">Return to Job Board</Link>
          </Button>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm md:text-base">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                {displayJob.companyName || 'Company TBD'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {locationLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-4 w-4" />
                {salaryLabel}
              </span>
              {jobTypeLabel ? (
                <Badge variant="secondary" className="text-xs">
                  {jobTypeLabel}
                </Badge>
              ) : null}
              <Badge
                variant="outline"
                className="border-primary/70 bg-primary/5 text-primary rounded-md px-3 py-1 text-xs"
              >
                {hasSuggestion ? 'AI Match Analysis' : 'Job details'}
              </Badge>
            </div>
          </section>

          {hasSuggestion && suggestion ? (
            <div className="space-y-4">
              <MatchInsightCard
                score={matchScore}
                title="Overall Match Assessment"
                subtitle={
                  <>
                    <span>{displayJob.companyName || suggestion.companyName || 'Company TBD'}</span>
                    {locationLabel && locationLabel !== 'See job description' ? (
                      <>
                        <span aria-hidden="true">•</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {locationLabel}
                        </span>
                      </>
                    ) : null}
                  </>
                }
                rightMeta={
                  salaryLabel !== 'Compensation not listed' ? (
                    <p className="text-primary text-sm font-semibold whitespace-nowrap sm:text-base">
                      {salaryLabel}
                    </p>
                  ) : undefined
                }
                description={
                  suggestion.matchExplanation?.trim()
                    ? suggestion.matchExplanation
                    : 'This role has a suggestion record, but the explanation is still being generated. Please refresh shortly.'
                }
                chips={matchInsightChips}
                summarySkills={requiredSkills}
                showCanonicalBadge={true}
                matchedGroups={skills?.matchedGroups}
                missingGroups={skills?.missingGroups}
                matchedSkills={matchedSkills}
                missingSkills={missingSkills}
                actions={
                  <div className="flex w-full flex-wrap gap-3 sm:w-auto">
                    <Button size="sm" className="flex-1 sm:min-w-36">
                      Apply Now
                    </Button>
                    <Button variant="secondary" size="sm" className="flex-1 sm:min-w-36">
                      Save Job
                    </Button>
                  </div>
                }
                footer={matchInsightFooter ?? undefined}
              />

              {(skills?.matchedGroups?.length || skills?.missingGroups?.length) ? (
                <Card className="border-border/70 bg-card/80 border">
                  <CardContent className="space-y-5 p-5">
                    <div className="space-y-1">
                      <h4 className="text-foreground text-lg font-semibold">Detailed skill analysis</h4>
                      <p className="text-muted-foreground text-sm">
                        Detailed requirement groups are shown only on the detail page.
                      </p>
                    </div>

                    {skills?.matchedGroups?.length ? (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase">
                          Matched requirement groups
                        </p>
                        <div className="grid gap-3">
                          {skills.matchedGroups.map((group) => (
                            <div
                              key={`detail-mg-${group.label}`}
                              className="space-y-2 rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium text-emerald-900 dark:text-emerald-200">
                                  {group.label}
                                </p>
                                {group.satisfied_by ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                                  >
                                    {group.satisfied_by}
                                  </Badge>
                                ) : null}
                              </div>
                              {group.options.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {group.options.map((option) => (
                                    <Badge key={`detail-mg-option-${group.label}-${option}`} variant="secondary">
                                      {option}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {skills?.missingGroups?.length ? (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-600 uppercase">
                          Missing requirement groups
                        </p>
                        <div className="grid gap-3">
                          {skills.missingGroups.map((group) => (
                            <div
                              key={`detail-xg-${group.label}`}
                              className="space-y-2 rounded-lg border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20"
                            >
                              <p className="font-medium text-rose-900 dark:text-rose-200">{group.label}</p>
                              {group.options.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {group.options.map((option) => (
                                    <Badge key={`detail-xg-option-${group.label}-${option}`} variant="outline">
                                      {option}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {(matchedSkills.length > 0 || missingSkills.length > 0) ? (
                <Card className="border-border/70 bg-card/80 border">
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-1">
                      <h4 className="text-foreground text-lg font-semibold">Match and missing skills</h4>
                      <p className="text-muted-foreground text-sm">
                        Detailed skill outcomes are shown only inside the role detail page.
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                          Matched skills
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {matchedSkills.length > 0 ? (
                            matchedSkills.map((skill) => (
                              <Badge key={`detail-match-${skill}`} variant="secondary">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">No matched skills listed.</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                          Missing skills
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {missingSkills.length > 0 ? (
                            missingSkills.map((skill) => (
                              <Badge key={`detail-missing-${skill}`} variant="outline">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">No missing skills listed.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : (
            <Card className="border-border/70 bg-card/80">
              <CardContent className="space-y-4 p-5">
                <h3 className="font-display text-foreground text-2xl font-bold">
                  Match analysis available after CV upload
                </h3>
                <p className="text-muted-foreground text-sm leading-7 md:text-base">
                  This role is available in the job catalog, but your personalized match data has
                  not been generated for it yet. Upload your CV from the Resume page to unlock
                  strengths, gaps, and matching scores.
                </p>
                <Button variant="secondary" asChild>
                  <Link to="/resume">Go to Resume &amp; CV</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {requiredSkills.length > 0 || hasSuggestion ? (
            <section className="space-y-4">
              <h3 className="font-display text-2xl font-bold tracking-tight">Skills Analysis</h3>

              {requiredSkills.length > 0 ? (
                <Card className="border-border/70 bg-card/80 border">
                  <CardContent className="space-y-3 p-5">
                    <h4 className="text-foreground text-lg font-semibold">
                      Required skills (role)
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {requiredSkills.map((skill) => (
                        <Badge key={`required-${skill}`} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {hasSuggestion ? (
                <>
                  <div className="space-y-4">


                    <Card className="border-border/70 bg-card/80 border">
                      <CardContent className="space-y-4 p-5">
                        <h4 className="text-foreground text-lg font-semibold">
                          Skills from your CV
                        </h4>
                        {hasParsedCvEvidence ? (
                          <div className="space-y-4">
                            {hasStructuredSkills ? (
                              <>
                                {cvHardSkills.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                      Hard Skills
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {cvHardSkills.map((skill) => (
                                        <Badge
                                          key={`hard-${skill}`}
                                          className="border-primary/30 bg-primary/10 text-primary border"
                                        >
                                          {skill}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {cvProcessSkills.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                      Process &amp; Methodology
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {cvProcessSkills.map((skill) => (
                                        <Badge
                                          key={`proc-${skill}`}
                                          className="border-violet-400/30 bg-violet-400/10 text-violet-600 dark:text-violet-400 border"
                                        >
                                          {skill}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {cvDomainExpertise.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                      Domain Expertise
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {cvDomainExpertise.map((skill) => (
                                        <Badge
                                          key={`domain-${skill}`}
                                          className="border-sky-400/30 bg-sky-400/10 text-sky-600 dark:text-sky-400 border"
                                        >
                                          {skill}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {cvSoftSkills.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                      Soft Skills
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {cvSoftSkills.map((skill) => (
                                        <Badge
                                          key={`soft-${skill}`}
                                          variant="secondary"
                                        >
                                          {skill}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : cvSkills.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {cvSkills.map((skill) => (
                                  <Badge
                                    key={`cv-${skill}`}
                                    className="border-primary/30 bg-primary/10 text-primary border"
                                  >
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                            {(domainEvidence.length > 0 || seniorityEvidence.length > 0) ? (
                              <div className="grid gap-4 lg:grid-cols-2">
                                {domainEvidence.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                      Domain evidence
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {domainEvidence.map((item) => (
                                        <Badge key={`domain-${item}`} variant="secondary">
                                          {item}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                {seniorityEvidence.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                      Seniority evidence
                                    </p>
                                    <ul className="text-muted-foreground space-y-1 text-sm">
                                      {seniorityEvidence.map((item) => (
                                        <li key={`seniority-${item}`}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {(profile?.strengths || profile?.gaps) ? (
                              <div className="grid gap-4 lg:grid-cols-2">
                                {profile?.strengths ? (
                                  <div className="space-y-2 rounded-lg border p-3">
                                    <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase">
                                      Strengths
                                    </p>
                                    <p className="text-muted-foreground text-sm leading-relaxed">
                                      {profile.strengths}
                                    </p>
                                  </div>
                                ) : null}
                                {profile?.gaps ? (
                                  <div className="space-y-2 rounded-lg border p-3">
                                    <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase">
                                      Growth gaps
                                    </p>
                                    <p className="text-muted-foreground text-sm leading-relaxed">
                                      {profile.gaps}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {candidateProjects.length > 0 ? (
                              <p className="text-muted-foreground text-sm">
                                {candidateProjects.length} relevant project
                                {candidateProjects.length === 1 ? '' : 's'} extracted from your CV.
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            No CV skill list is stored for this match yet. Re-run matching after
                            your CV is processed, or upload an updated CV.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {hasSuggestion ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/80 border">
                <CardContent className="p-5">
                  <h4 className="text-foreground mb-4 inline-flex items-center gap-2 text-xl font-semibold">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Your Strengths
                  </h4>
                  {strengths.length > 0 ? (
                    <ul className="text-muted-foreground space-y-3 text-sm md:text-base">
                      {strengths.map((item, idx) => (
                        <li key={`strength-${idx}`} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm md:text-base">
                      Match explanation is not available yet for this suggestion.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/80 border">
                <CardContent className="p-5">
                  <h4 className="text-foreground mb-4 inline-flex items-center gap-2 text-xl font-semibold">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    Growth Areas
                  </h4>
                  {growthAreas.length > 0 ? (
                    <ul className="text-muted-foreground space-y-3 text-sm md:text-base">
                      {growthAreas.map((item, idx) => (
                        <li key={`growth-${idx}`} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm md:text-base">
                      No major skill gaps detected for this role yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}

          <section className="space-y-4 pb-4">
            <h3 className="font-display text-2xl font-bold tracking-tight">Full Job Description</h3>
            <Card className="border-border/70 bg-card/80 border">
              <CardContent className="p-5 text-sm md:text-base">
                {markdownContent ? (
                  <div className="markdown-body">
                    <ReactMarkdown>{markdownContent}</ReactMarkdown>
                  </div>
                ) : displayJob.jdText ? (
                  <div className="text-muted-foreground leading-7 whitespace-pre-wrap">
                    {formatJobDescription(displayJob.jdText)}
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    No job description has been provided for this role yet.
                  </span>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </PortalPageShell>
  )
})

CandidateJobDetailsPage.displayName = 'CandidateJobDetailsPage'
