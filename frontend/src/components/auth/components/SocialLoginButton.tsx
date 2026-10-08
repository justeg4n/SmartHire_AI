/**
 * Social Login Button Component
 * Reusable button for OAuth providers
 * Optimized with React.memo
 */

import React, { memo } from 'react'
import { Button } from '@/components/ui/button'
import type { SocialProvider } from '../types'

interface SocialLoginButtonProps {
  provider: SocialProvider
  onClick: () => void
  isLoading?: boolean
  className?: string
}

const ProviderIcons: Record<SocialProvider, React.ReactNode> = {
  Google: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.25024 6.65L5.25524 9.765C6.20524 6.845 8.86028 4.75 12.0003 4.75Z"
        fill="#EA4335"
      />
      <path
        d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z"
        fill="#4285F4"
      />
      <path
        d="M5.25498 14.235C5.01498 13.505 4.86998 12.725 4.86998 11.925C4.86998 11.125 5.01498 10.345 5.25498 9.615L1.23998 6.51C0.43998 8.1 0 9.945 0 11.925C0 13.905 0.43998 15.75 1.23998 17.34L5.25498 14.235Z"
        fill="#FBBC05"
      />
      <path
        d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.86037 19.245 6.20537 17.155 5.25537 14.235L1.25037 17.35C3.25537 21.31 7.31037 24.0001 12.0004 24.0001Z"
        fill="#34A853"
      />
    </svg>
  ),
  Facebook: null, // Add Facebook icon if needed
  Apple: null, // Add Apple icon if needed
}

export const SocialLoginButton = memo<SocialLoginButtonProps>(
  ({ provider, onClick, isLoading = false, className = '' }) => {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={isLoading}
        className={`border-border bg-card text-foreground hover:bg-accent flex h-11 w-full items-center justify-center gap-2 ${className}`}
        aria-label={`Sign in with ${provider}`}
      >
        {ProviderIcons[provider]}
        {provider}
      </Button>
    )
  },
)

SocialLoginButton.displayName = 'SocialLoginButton'
