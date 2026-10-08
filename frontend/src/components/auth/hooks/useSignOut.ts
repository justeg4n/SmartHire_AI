import { useCallback, useState } from 'react'
import { signOut } from 'aws-amplify/auth'

interface UseSignOutReturn {
  handleSignOut: () => Promise<void>
  isLoading: boolean
}

export const useSignOut = (): UseSignOutReturn => {
  const [isLoading, setIsLoading] = useState(false)

  const handleSignOut = useCallback(async () => {
    setIsLoading(true)
    try {
      await signOut()
      // Hub event 'signedOut' → AuthInitializer.logout() → Zustand clear
    } catch (err) {
      console.error('Sign out failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { handleSignOut, isLoading }
}
