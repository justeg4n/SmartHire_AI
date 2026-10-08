import { memo } from 'react'
import { useSWRConfig } from 'swr'
import { useNavigate } from 'react-router-dom'

import { useAuthStore } from '@/store/authStore'
import { CVUploadWidget } from '../components/CVUploadWidget'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const CandidateResumePage = memo(() => {
  const user = useAuthStore((state) => state.user)
  const { mutate } = useSWRConfig()
  const navigate = useNavigate()

  return (
    <PortalPageShell
      portalLabel="Candidate Portal"
      title="Upload your CV"
      description="Add a general PDF resume to power AI job matching. For a specific role, open the job from Open Jobs and upload there so your file is tied to that position."
    >
      <CVUploadWidget
        onUploadComplete={() => {
          if (user?.id) void mutate(['job-suggestions-hydrate', user.id])
          navigate('/dashboard')
        }}
      />
    </PortalPageShell>
  )
})

CandidateResumePage.displayName = 'CandidateResumePage'
