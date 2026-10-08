import { memo } from 'react'

import { JobBoard } from '../components/JobBoard'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const CandidateApplyPage = memo(() => {
  return (
    <PortalPageShell
      portalLabel="Candidate Portal"
      title="Open positions"
      description="Browse every role in the catalog. Open a job to see details, tailor your CV, and continue your application."
    >
      <JobBoard layout="full" />
    </PortalPageShell>
  )
})

CandidateApplyPage.displayName = 'CandidateApplyPage'
