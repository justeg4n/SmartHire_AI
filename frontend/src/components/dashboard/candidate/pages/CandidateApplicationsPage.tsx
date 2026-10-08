import { memo } from 'react'

import { CandidateApplicationsTable } from '../components/CandidateApplicationsTable'
import { applications } from '../components/data'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const CandidateApplicationsPage = memo(() => {
  return (
    <PortalPageShell
      portalLabel="Candidate Portal"
      title="Applications"
      description="Track every submitted application and monitor your progress in one place."
    >
      <CandidateApplicationsTable applications={applications} />
    </PortalPageShell>
  )
})

CandidateApplicationsPage.displayName = 'CandidateApplicationsPage'
