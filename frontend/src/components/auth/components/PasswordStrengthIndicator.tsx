/**
 * Password Strength Indicator Component
 * Displays visual feedback for password strength
 * Optimized with React.memo
 */

import { memo } from 'react'
import { usePasswordStrength } from '../hooks'

interface PasswordStrengthIndicatorProps {
  password: string
  showLabel?: boolean
  className?: string
}

export const PasswordStrengthIndicator = memo<PasswordStrengthIndicatorProps>(
  ({ password, showLabel = false, className = '' }) => {
    const { strength, strengthLabel, strengthColor } = usePasswordStrength(password)

    if (!password) return null

    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < strength ? strengthColor : 'bg-muted'
              }`}
              role="presentation"
            />
          ))}
        </div>
        {showLabel && (
          <p className="text-muted-foreground text-xs" aria-live="polite" aria-atomic="true">
            Password strength: <span className="font-medium">{strengthLabel}</span>
          </p>
        )}
      </div>
    )
  },
)

PasswordStrengthIndicator.displayName = 'PasswordStrengthIndicator'
