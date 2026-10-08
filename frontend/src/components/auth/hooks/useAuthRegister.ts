/**
 * Custom hook for registration authentication logic
 * Handles signup and email confirmation flow
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  signUp,
  confirmSignUp,
  signIn,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth'
import { toast } from 'sonner'
import type { RegisterFormData, ConfirmFormData } from '../types'
import { useAuthStore, type User } from '@/store/authStore'
import { postRecruiterOnboarding } from '@/lib/recruiterOnboarding'

interface UseAuthRegisterReturn {
  isSubmitting: boolean
  isConfirming: boolean
  registeredEmail: string
  onSubmit: (data: RegisterFormData) => Promise<void>
  onConfirm: (data: ConfirmFormData) => Promise<void>
  error: string | null
  clearError: () => void
}

export const useAuthRegister = (role: User['role'] = 'candidate'): UseAuthRegisterReturn => {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [pendingRecruiterData, setPendingRecruiterData] = useState<{
    password: string
    companyName: string
    taxCode?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const login = useAuthStore((state) => state.login)

  const onSubmit = useCallback(
    async (values: RegisterFormData) => {
      setIsSubmitting(true)
      setError(null)
      const normalizedEmail = values.email.trim().toLowerCase()

      try {
        const { isSignUpComplete, nextStep } = await signUp({
          username: normalizedEmail,
          password: values.password,
          options: {
            userAttributes: {
              email: normalizedEmail,
              name: values.name,
              'custom:role': role,
            },
          },
        })

        if (!isSignUpComplete && nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
          setRegisteredEmail(normalizedEmail)
          if (role === 'recruiter') {
            setPendingRecruiterData({
              password: values.password,
              companyName: values.companyName?.trim() || '',
              taxCode: values.taxCode?.trim() || undefined,
            })
          }
          setIsConfirming(true)
          toast.info('Verification code sent to your email.')
        } else {
          toast.success('Account created successfully!')
          navigate('/login')
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to register'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setIsSubmitting(false)
      }
    },
    [navigate, role],
  )

  const onConfirm = useCallback(
    async (values: ConfirmFormData) => {
      setIsSubmitting(true)
      setError(null)

      try {
        const { isSignUpComplete } = await confirmSignUp({
          username: registeredEmail,
          confirmationCode: values.code,
        })

        if (isSignUpComplete) {
          if (role === 'recruiter') {
            if (!pendingRecruiterData?.companyName || !pendingRecruiterData.password) {
              throw new Error('Missing recruiter onboarding information. Please register again.')
            }

            await signIn({
              username: registeredEmail,
              password: pendingRecruiterData.password,
            })

            const session = await fetchAuthSession()
            const token = session.tokens?.idToken?.toString() || ''
            await postRecruiterOnboarding(
              {
                companyName: pendingRecruiterData.companyName,
                taxCode: pendingRecruiterData.taxCode,
              },
              token,
            )

            const attributes = await fetchUserAttributes()
            const rawRole = (attributes['custom:role'] ?? 'CANDIDATE').toLowerCase()
            const userRole: User['role'] =
              rawRole === 'recruiter' || rawRole === 'admin' || rawRole === 'candidate'
                ? rawRole
                : 'candidate'
            login(
              {
                id: attributes.sub || '',
                email: attributes.email || registeredEmail,
                name: attributes.name || 'User',
                role: userRole,
                hasRecruiterProfile: true,
              },
              token,
            )

            setPendingRecruiterData(null)
            setRegisteredEmail('')
            toast.success('Email verified and recruiter profile created successfully.')
            navigate('/recruiter')
            return
          }

          setRegisteredEmail('')
          toast.success('Email verified successfully! You can now log in.')
          navigate('/login')
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to verify code'
        setError(errorMessage)
        toast.error(errorMessage)
        if (role === 'recruiter') {
          navigate('/login')
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [login, navigate, pendingRecruiterData, registeredEmail, role],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isSubmitting,
    isConfirming,
    registeredEmail,
    onSubmit,
    onConfirm,
    error,
    clearError,
  }
}
