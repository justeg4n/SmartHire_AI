import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth'
import { toast } from 'sonner'

interface UseForgotPasswordReturn {
  step: 'REQUEST' | 'CONFIRM'
  pendingEmail: string
  isSubmitting: boolean
  error: string | null
  requestReset: (email: string) => Promise<void>
  confirmReset: (code: string, newPassword: string) => Promise<void>
}

export const useForgotPassword = (): UseForgotPasswordReturn => {
  const navigate = useNavigate()
  const [step, setStep] = useState<'REQUEST' | 'CONFIRM'>('REQUEST')
  const [pendingEmail, setPendingEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestReset = useCallback(async (email: string) => {
    setIsSubmitting(true)
    setError(null)
    try {
      await resetPassword({ username: email })
      setPendingEmail(email)
      setStep('CONFIRM')
      toast.success('Reset code sent to your email.')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send reset code'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const confirmReset = useCallback(
    async (code: string, newPassword: string) => {
      setIsSubmitting(true)
      setError(null)
      try {
        await confirmResetPassword({
          username: pendingEmail,
          confirmationCode: code,
          newPassword,
        })
        toast.success('Password reset successfully. You can now log in.')
        navigate('/login')
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to reset password'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setIsSubmitting(false)
      }
    },
    [pendingEmail, navigate],
  )

  return { step, pendingEmail, isSubmitting, error, requestReset, confirmReset }
}
