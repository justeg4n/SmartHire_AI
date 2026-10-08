import { memo } from 'react'

import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PortalPageShell } from '../../shared/PortalPageShell'

export const CandidateProfilePage = memo(() => {
  const user = useAuthStore((state) => state.user)

  return (
    <PortalPageShell
      portalLabel="Candidate Portal"
      title="Profile"
      description="Keep your profile information up to date for better match quality."
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground text-sm">Full name</p>
            <p className="font-medium">{user?.name || 'Candidate'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Email</p>
            <p className="font-medium">{user?.email || 'No email available'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Role</p>
            <p className="font-medium capitalize">{user?.role || 'candidate'}</p>
          </div>
        </CardContent>
      </Card>
    </PortalPageShell>
  )
})

CandidateProfilePage.displayName = 'CandidateProfilePage'
