import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Github, Globe, Linkedin, Mail, Phone, User } from 'lucide-react'
import { toast } from 'sonner'

import { PortalPageShell } from '../../shared/PortalPageShell'
import { MatchInsightCard } from '../../shared/MatchInsightCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import type { CandidateSuggestionData, JobMetadataDetail } from '@/lib/appSyncOperations'
import {
  fetchCandidateRankingSnapshot,
  fetchJobMetadataQuery,
} from '@/lib/fetchRecruiterAppSyncQuery'
import {
  fetchCandidateProfileForRecruiterQuery,
  type CandidateCvStatusSnapshot,
} from '@/lib/fetchCandidateCvStatusQuery'

function displayCandidateTitle(c: CandidateSuggestionData) {
  return c.contactInfo?.fullName?.trim() || `Candidate #${c.rank}`
}

function interviewGuideLabel(item: unknown, index: number): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    if (typeof o.question === 'string' && o.question.trim()) return o.question.trim()
    if (typeof o.topic === 'string' && o.topic.trim()) return o.topic.trim()
  }
  return `Interview topic ${index + 1}`
}

export const RankedCandidateProfilePage = () => {
  const { jobId = '', candidateId = '' } = useParams()
  const decodedCandidateId = useMemo(() => {
    try {
      return decodeURIComponent(candidateId)
    } catch {
      return candidateId
    }
  }, [candidateId])

  const [jobMeta, setJobMeta] = useState<JobMetadataDetail | null>(null)
  const [candidate, setCandidate] = useState<CandidateSuggestionData | null>(null)
  const [candidateProfile, setCandidateProfile] = useState<CandidateCvStatusSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    if (!jobId || !decodedCandidateId) {
      setLoading(false)
      setNotFound(true)
      return
    }
    setLoading(true)
    setNotFound(false)
    try {
      const [snapshot, meta] = await Promise.all([
        fetchCandidateRankingSnapshot(jobId),
        fetchJobMetadataQuery(jobId),
      ])
      setJobMeta(meta)
      const row = snapshot.rows.find((r) => r.candidateId === decodedCandidateId) ?? null
      if (!row) {
        setCandidate(null)
        setCandidateProfile(null)
        setNotFound(true)
      } else {
        setCandidate(row)
        setNotFound(false)
        const profile = await fetchCandidateProfileForRecruiterQuery(jobId, decodedCandidateId)
        setCandidateProfile(profile)
      }
    } catch (e) {
      console.error(e)
      toast.error('Could not load candidate profile for this job.')
      setCandidate(null)
      setCandidateProfile(null)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [jobId, decodedCandidateId])

  useEffect(() => {
    void load()
  }, [load])

  const backHref = `/recruiter/jobs/${encodeURIComponent(jobId)}`

  if (loading) {
    return (
      <div className="w-full space-y-6 py-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (notFound || !candidate) {
    return (
      <PortalPageShell
        portalLabel="Recruiter Portal"
        title="Candidate not found"
        description="This person is not in the saved ranking for this job, or data is still processing."
        className="w-full py-6"
        bodyClassName="space-y-6"
      >
        <Button variant="outline" asChild>
          <Link to={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to job
          </Link>
        </Button>
      </PortalPageShell>
    )
  }

  const interviewItems = candidate.interviewGuide ?? []
  const matched = candidate.matchedSkills ?? []
  const missing = candidate.missingSkills ?? []
  const profile = candidateProfile?.parsedProfile
  const projects = Array.isArray(profile?.projects) ? profile.projects : []
  const professionalExperience = Array.isArray(profile?.professionalExperience)
    ? profile.professionalExperience
    : []
  const domainEvidence = Array.isArray(profile?.domainExperience) ? profile.domainExperience : []
  const seniorityEvidence = Array.isArray(profile?.seniorityEvidence)
    ? profile.seniorityEvidence
    : []

  return (
    <PortalPageShell
      portalLabel="Recruiter Portal"
      title={
        <span className="flex flex-wrap items-center gap-3">
          <User className="text-muted-foreground h-8 w-8 shrink-0" aria-hidden />
          {displayCandidateTitle(candidate)}
        </span>
      }
      description={
        <>
          {jobMeta?.jobTitle ? (
            <span>{jobMeta.jobTitle}</span>
          ) : (
            <span className="font-mono text-sm">Job {jobId}</span>
          )}
          <span className="text-muted-foreground"> · </span>
          <span>
            Rank #{candidate.rank} · Match {Math.round(candidate.finalScore)}%
          </span>
        </>
      }
      actions={
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          {candidate.profileUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={candidate.profileUrl} target="_blank" rel="noreferrer">
                External profile
              </a>
            </Button>
          ) : null}
          <Button variant="default" size="sm" asChild>
            <Link to={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to job
            </Link>
          </Button>
        </div>
      }
      className="w-full py-6"
      bodyClassName="space-y-8"
    >
      <section className="space-y-4">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Candidate overview</CardTitle>
            <CardDescription>
              High-level context and score summary for this candidate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile?.headline || profile?.summary ? (
              <div className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
                <p className="font-medium">{profile?.headline || 'Parsed profile'}</p>
                {profile?.summary ? (
                  <p className="text-muted-foreground mt-1">{profile.summary}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="mb-1 flex justify-between text-sm">
                  <span>Final</span>
                  <span className="font-semibold">{Math.round(candidate.finalScore)}%</span>
                </div>
                <Progress
                  value={Math.min(100, Math.max(0, candidate.finalScore))}
                  className="h-2"
                />
                <div className="text-muted-foreground space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Bi-encoder</span>
                    <span>{Math.round(candidate.biEncoderScore)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cross-encoder</span>
                    <span>
                      {candidate.crossEncoderScore != null
                        ? `${Math.round(candidate.crossEncoderScore)}%`
                        : '—'}
                    </span>
                  </div>
                  {candidate.skillGapScore != null ? (
                    <div className="flex justify-between">
                      <span>JD skills match</span>
                      <span>{Math.round(candidate.skillGapScore)}%</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{candidate.seniority}</Badge>
                  <Badge variant="outline">{candidate.yearsExperience} years experience</Badge>
                  {candidate.applicationStatus ? (
                    <Badge variant="outline">{candidate.applicationStatus}</Badge>
                  ) : null}
                  {candidate.schemaVersion ? (
                    <Badge variant="outline">Schema {candidate.schemaVersion}</Badge>
                  ) : null}
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {candidate.contactInfo?.email ? (
                    <a
                      href={`mailto:${candidate.contactInfo.email}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Mail className="h-4 w-4" />
                      {candidate.contactInfo.email}
                    </a>
                  ) : null}
                  {candidate.contactInfo?.phone ? (
                    <a
                      href={`tel:${candidate.contactInfo.phone}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      {candidate.contactInfo.phone}
                    </a>
                  ) : null}
                  {candidate.contactInfo?.githubUrl ? (
                    <a
                      href={candidate.contactInfo.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Github className="h-4 w-4" />
                      GitHub
                    </a>
                  ) : null}
                  {candidate.contactInfo?.linkedinUrl ? (
                    <a
                      href={candidate.contactInfo.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Linkedin className="h-4 w-4" />
                      LinkedIn
                    </a>
                  ) : null}
                  {candidate.contactInfo?.portfolioUrl ? (
                    <a
                      href={candidate.contactInfo.portfolioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Globe className="h-4 w-4" />
                      Portfolio
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">AI summary</CardTitle>
            <CardDescription>Snapshot lines produced for this match</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            {candidate.candidateSnapshot.length ? (
              candidate.candidateSnapshot.map((line, i) => <p key={i}>{line}</p>)
            ) : (
              <p className="text-muted-foreground">No summary lines yet.</p>
            )}
          </CardContent>
        </Card>

        {matched.length > 0 ||
        missing.length > 0 ||
        (candidate.matchedGroups && candidate.matchedGroups.length > 0) ||
        (candidate.missingGroups && candidate.missingGroups.length > 0) ? (
          <div className="space-y-4">
            <MatchInsightCard
              score={candidate.finalScore ?? 0}
              title="Skill match analysis"
              description="Detailed breakdown of required skills from the job description vs candidate profile."
              summarySkills={jobMeta?.requiredSkills ?? []}
              matchedGroups={candidate.matchedGroups}
              missingGroups={candidate.missingGroups}
              matchedSkills={matched}
              missingSkills={missing}
              showCanonicalBadge={true}
              footer={
                <>
                  Matched skills: {matched.length} • Missing skills: {missing.length}
                  {candidate.skillGapScore != null
                    ? ` • JD skills match: ${Math.round(candidate.skillGapScore)}%`
                    : ''}
                </>
              }
            />

            {candidate.matchedGroups?.length || candidate.missingGroups?.length ? (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Requirement breakdown</CardTitle>
                  <CardDescription>Group-level reasoning for recruiter review</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {candidate.matchedGroups?.length ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase">
                        Matched groups
                      </p>
                      <div className="grid gap-3">
                        {candidate.matchedGroups.map((group) => (
                          <div
                            key={`recruiter-mg-${group.label}`}
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
                                  <Badge
                                    key={`recruiter-mg-option-${group.label}-${option}`}
                                    variant="secondary"
                                  >
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

                  {candidate.missingGroups?.length ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold tracking-wide text-rose-600 uppercase">
                        Missing groups
                      </p>
                      <div className="grid gap-3">
                        {candidate.missingGroups.map((group) => (
                          <div
                            key={`recruiter-xg-${group.label}`}
                            className="space-y-2 rounded-lg border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20"
                          >
                            <p className="font-medium text-rose-900 dark:text-rose-200">
                              {group.label}
                            </p>
                            {group.options.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {group.options.map((option) => (
                                  <Badge
                                    key={`recruiter-xg-option-${group.label}-${option}`}
                                    variant="outline"
                                  >
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
          </div>
        ) : null}

        {profile?.strengths ||
        profile?.gaps ||
        domainEvidence.length > 0 ||
        seniorityEvidence.length > 0 ||
        projects.length > 0 ||
        professionalExperience.length > 0 ? (
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Deep candidate metadata</CardTitle>
              <CardDescription>Loaded on demand from candidate CV metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {profile?.strengths || profile?.gaps ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {profile?.strengths ? (
                    <div className="space-y-2 rounded-lg border p-4">
                      <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase">
                        Strengths
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {profile.strengths}
                      </p>
                    </div>
                  ) : null}
                  {profile?.gaps ? (
                    <div className="space-y-2 rounded-lg border p-4">
                      <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase">
                        Gaps
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {profile.gaps}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {domainEvidence.length > 0 || seniorityEvidence.length > 0 ? (
                <div className="space-y-4">
                  {domainEvidence.length > 0 ? (
                    <div className="space-y-2 rounded-lg border p-4">
                      <p className="text-xs font-semibold tracking-wide uppercase">
                        Domain experience
                      </p>
                      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                        {domainEvidence.map((item) => (
                          <li key={`domain-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {seniorityEvidence.length > 0 ? (
                    <div className="space-y-2 rounded-lg border p-4">
                      <p className="text-xs font-semibold tracking-wide uppercase">
                        Seniority evidence
                      </p>
                      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                        {seniorityEvidence.map((item) => (
                          <li key={`seniority-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {projects.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold tracking-wide uppercase">Projects</p>
                  <div className="grid gap-3">
                    {projects.map((item, idx) => {
                      const project =
                        item && typeof item === 'object' ? (item as Record<string, unknown>) : null
                      return (
                        <div key={`project-${idx}`} className="rounded-lg border p-4">
                          <p className="font-medium">
                            {String(project?.name ?? `Project ${idx + 1}`)}
                          </p>
                          {project?.role ? (
                            <p className="text-muted-foreground text-sm">{String(project.role)}</p>
                          ) : null}
                          {Array.isArray(project?.stack) && project.stack.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {project.stack.map((stackItem) => (
                                <Badge key={`stack-${idx}-${String(stackItem)}`} variant="outline">
                                  {String(stackItem)}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          {project?.outcome ? (
                            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                              {String(project.outcome)}
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {professionalExperience.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold tracking-wide uppercase">
                    Professional experience
                  </p>
                  <div className="grid gap-3">
                    {professionalExperience.map((item, idx) => {
                      const exp =
                        item && typeof item === 'object' ? (item as Record<string, unknown>) : null
                      return (
                        <div key={`experience-${idx}`} className="rounded-lg border p-4">
                          <p className="font-medium">
                            {String(exp?.title ?? 'Role')}
                            {exp?.company ? ` at ${String(exp.company)}` : ''}
                          </p>
                          {exp?.start || exp?.end ? (
                            <p className="text-muted-foreground text-sm">
                              {String(exp?.start ?? 'Unknown')} - {String(exp?.end ?? 'Present')}
                            </p>
                          ) : null}
                          {Array.isArray(exp?.responsibilities) &&
                          exp.responsibilities.length > 0 ? (
                            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
                              {exp.responsibilities.map((responsibility) => (
                                <li key={`responsibility-${idx}-${String(responsibility)}`}>
                                  {String(responsibility)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {exp?.impact ? (
                            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                              {String(exp.impact)}
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {candidate.evidenceHighlights?.length ? (
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Evidence highlights</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {candidate.evidenceHighlights.map((line, idx) => (
                  <li key={`${idx}-${line.slice(0, 64)}`}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {interviewItems.length > 0 ? (
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Interview guide</CardTitle>
              <CardDescription>Suggested topics from the ranking engine</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {interviewItems.map((item, i) => (
                  <AccordionItem value={`q-${i}`} key={i}>
                    <AccordionTrigger className="text-left text-sm">
                      {interviewGuideLabel(item, i)}
                    </AccordionTrigger>
                    <AccordionContent>
                      <pre className="text-muted-foreground bg-muted/30 overflow-x-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                        {typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </PortalPageShell>
  )
}
