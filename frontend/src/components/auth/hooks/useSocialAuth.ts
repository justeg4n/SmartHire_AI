/**
 * Custom hook for social authentication (Google, Facebook, etc.)
 * Handles OAuth redirect flow
 */

import { useCallback, useState } from 'react'
import { signInWithRedirect } from 'aws-amplify/auth'
import type { SocialProvider } from '../types'

interface UseSocialAuthReturn {
  isLoading: boolean
  signInWithProvider: (provider: SocialProvider) => Promise<void>
  error: string | null
}

export const useSocialAuth = (): UseSocialAuthReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    setIsLoading(true)
    setError(null)

    try {
      await signInWithRedirect({ provider })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : `Failed to sign in with ${provider}`
      setError(errorMessage)
      console.error(`Error signing in with ${provider}:`, err)
    } finally {
      // Note: This finally might not execute if redirect happens immediately
      setIsLoading(false)
    }
  }, [])

  return {
    isLoading,
    signInWithProvider,
    error,
  }
}
