/**
 * Custom hook for login authentication logic
 * Separates business logic from UI components
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth'
import { useAuthStore, type User } from '@/store/authStore'
import { toast } from 'sonner'
import type { LoginFormData, UseAuthFormReturn } from '../types'

export const useAuthLogin = (): UseAuthFormReturn<LoginFormData> => {
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = useCallback(
    async (values: LoginFormData) => {
      setIsSubmitting(true)
      setError(null)
      const normalizedEmail = values.email.trim().toLowerCase()

      try {
        const { isSignedIn, nextStep } = await signIn({
          username: normalizedEmail,
          password: values.password,
        })

        if (isSignedIn) {
          // Fetch JWT Token
          const session = await fetchAuthSession()
          const token = session.tokens?.idToken?.toString() || ''

          // Fetch User Attributes from Cognito
          const attributes = await fetchUserAttributes()

          // Normalize role from Cognito custom attribute
          const rawRole = (attributes['custom:role'] ?? 'CANDIDATE').toLowerCase()
          const userRole: User['role'] =
            rawRole === 'recruiter' || rawRole === 'admin' || rawRole === 'candidate'
              ? rawRole
              : 'candidate'

          const loggedUser: User = {
            id: attributes.sub || '',
            email: attributes.email || normalizedEmail,
            name: attributes.name || 'User',
            role: userRole,
          }

          login(loggedUser, token)
          toast.success('Successfully logged in')
          navigate('/')
        } else {
          // Handle additional authentication steps
          if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
            const errorMsg = 'Please confirm your account via email before logging in.'
            setError(errorMsg)
            toast.error(errorMsg)
          } else {
            toast.info(`Additional step required: ${nextStep.signInStep}`)
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to login'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setIsSubmitting(false)
      }
    },
    [login, navigate],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isSubmitting,
    onSubmit,
    error,
    clearError,
  }
}
