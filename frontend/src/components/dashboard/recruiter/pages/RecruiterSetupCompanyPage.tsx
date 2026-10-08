import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PortalPageShell } from '../../shared/PortalPageShell'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { fetchCurrentUser, postRecruiterOnboarding } from '@/lib/recruiterOnboarding'

export const RecruiterSetupCompanyPage: React.FC = () => {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const updateUser = useAuthStore((state) => state.updateUser)
  const [companyName, setCompanyName] = useState('')
  const [taxCode, setTaxCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!companyName.trim()) {
      toast.error('Company name is required.')
      return
    }
    if (!token) {
      toast.error('Missing auth token. Please login again.')
      navigate('/login')
      return
    }

    try {
      setIsSubmitting(true)
      await postRecruiterOnboarding(
        {
          companyName: companyName.trim(),
          taxCode: taxCode.trim() || undefined,
        },
        token,
      )

      const me = await fetchCurrentUser(token)
      updateUser({
        role: me.role,
        hasRecruiterProfile: me.hasRecruiterProfile ?? true,
      })
      toast.success('Company profile created successfully.')
      navigate('/recruiter')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create company profile.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PortalPageShell
      portalLabel="Recruiter Portal"
      title={
        <span className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary border-primary/20 rounded-xl border p-2">
            <Building2 className="h-6 w-6" />
          </span>
          Complete company setup
        </span>
      }
      description="Set up your company profile before posting jobs."
      className="relative py-6"
      bodyClassName="relative space-y-8"
    >
      <div className="relative z-10 mx-auto w-full max-w-2xl">
        <Card className="glass-panel p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. SmartHire Labs"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-code">Tax Code (optional)</Label>
              <Input
                id="tax-code"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder="Company tax code"
                disabled={isSubmitting}
              />
            </div>

            <div className="border-border/30 flex items-center gap-3 border-t pt-5">
              <Button type="submit" disabled={isSubmitting || !companyName.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save company profile'
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Signed in as {user?.email ?? 'recruiter'}.
            </p>
          </form>
        </Card>
      </div>
    </PortalPageShell>
  )
}
