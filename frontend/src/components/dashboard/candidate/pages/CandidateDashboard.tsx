import { memo, useMemo } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Link } from 'react-router-dom'
import { Loader2, Upload } from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { fetchJobSuggestionsQuery } from '@/lib/fetchJobSuggestionsQuery'
import { CandidateStatsGrid } from '../components/CandidateStatsGrid'
import { JobSuggestions } from '../components/JobSuggestions'
import { CandidateApplicationsTable } from '../components/CandidateApplicationsTable'
import { CVUploadWidget } from '../components/CVUploadWidget'
import { applications } from '../components/data'
import { useCandidateCv } from '../context/CandidateCvContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const CandidateDashboard = memo(() => {
  const user = useAuthStore((state) => state.user)
  const { mutate } = useSWRConfig()
  const { cvReady, pipelinePending, isChecking, cvStatus, refreshCvStatus } = useCandidateCv()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const { data: suggestionList } = useSWR(
    user?.id && cvReady ? ['job-suggestions-hydrate', user.id] : null,
    () => fetchJobSuggestionsQuery(user!.id),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const totalMatches = suggestionList?.length ?? 0

  const heroSubtitle = useMemo(() => {
    if (totalMatches > 0) {
      return `You have ${totalMatches} personalized AI match${totalMatches === 1 ? '' : 'es'}. Open the Open Jobs page in the sidebar to browse every role.`
    }
    return 'Upload your CV to unlock AI scoring, then explore roles from Open Jobs.'
  }, [totalMatches])

  if (isChecking) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
        <Loader2 className="text-primary h-10 w-10 animate-spin" />
        <p className="text-muted-foreground text-sm">Checking your profile…</p>
      </div>
    )
  }

  if (!cvReady) {
    return (
      <PortalPageShell
        portalLabel="Candidate Portal"
        title={pipelinePending ? `Hang tight, ${firstName}` : `Welcome, ${firstName}`}
        description={
          pipelinePending
            ? 'Your CV is on file and the matcher is running. This screen updates when job recommendations are ready (AppSync). You can also refresh status below.'
            : 'Upload your CV first so we can run the matcher and load personalized job suggestions. Your data is stored securely in your private S3 folder.'
        }
        bodyClassName="flex flex-col gap-6"
      >
        {pipelinePending ? (
          <div className="text-muted-foreground flex w-full flex-wrap items-center gap-3 text-sm">
            <Loader2 className="text-primary h-6 w-6 shrink-0 animate-spin" />
            <span>Waiting for job recommendations…</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshCvStatus()}
            >
              Refresh status
            </Button>
          </div>
        ) : null}

        <div className="w-full">
          <CVUploadWidget
            onUploadComplete={() => {
              if (user?.id) void mutate(['job-suggestions-hydrate', user.id])
            }}
          />
        </div>

        {cvStatus?.parsedProfile?.summary ? (
          <Card className="border-border/60 bg-card/90 gap-4 border py-5 shadow-sm">
            <CardContent className="space-y-2 px-5 py-0 sm:px-6">
              <p className="text-foreground text-sm font-medium">Parsed CV summary</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {cvStatus.parsedProfile.summary}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </PortalPageShell>
    )
  }

  return (
    <PortalPageShell
      portalLabel="Candidate Portal"
      title={`Welcome back, ${firstName}`}
      description={heroSubtitle}
      bodyClassName="flex flex-col gap-6"
    >
      <CandidateStatsGrid totalMatches={totalMatches} totalApplications={applications.length} />

      {cvStatus?.parsedProfile ? (
        <Card className="border-border/60 bg-card/90 gap-4 border py-5 shadow-sm">
          <CardContent className="space-y-2 px-5 py-0 sm:px-6">
            <p className="text-foreground text-sm font-medium">Candidate profile metadata</p>
            <p className="text-muted-foreground text-sm">
              {cvStatus.parsedProfile.headline || cvStatus.parsedProfile.summary || 'Profile parsed.'}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 bg-card/90 gap-4 border py-5 shadow-sm">
        <CardContent className="flex flex-col gap-4 px-5 py-0 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="space-y-1 text-sm">
            <p className="text-foreground font-medium">Resume & CV</p>
            <p className="text-muted-foreground max-w-xl leading-relaxed">
              View or replace your general CV on the Upload CV page. For a specific role, open the
              job and upload there so the file is tied to that application pipeline.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button className="gradient-cta text-primary-foreground border-0" asChild>
              <Link to="/resume">
                <Upload className="mr-2 h-4 w-4" />
                Upload CV
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <JobSuggestions maxSuggestions={8} />

      <CandidateApplicationsTable applications={applications} />
    </PortalPageShell>
  )
})

CandidateDashboard.displayName = 'CandidateDashboard'
