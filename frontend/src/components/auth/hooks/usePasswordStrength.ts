/**
 * Custom hook for password strength calculation
 * Provides real-time password strength feedback
 */

import { useMemo } from 'react'
import type { UsePasswordStrengthReturn } from '../types'

interface PasswordStrengthConfig {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
}

const defaultConfig: PasswordStrengthConfig = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
}

export const usePasswordStrength = (
  password: string,
  config: Partial<PasswordStrengthConfig> = {},
): UsePasswordStrengthReturn => {
  // Memoize config to prevent recalculation on every render
  const fullConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config])

  const strength = useMemo(() => {
    if (!password) return 0

    let score = 0
    const tests = [
      password.length >= fullConfig.minLength,
      fullConfig.requireUppercase ? /[A-Z]/.test(password) : true,
      fullConfig.requireLowercase ? /[a-z]/.test(password) : true,
      fullConfig.requireNumbers ? /[0-9]/.test(password) : true,
      fullConfig.requireSpecialChars ? /[^A-Za-z0-9]/.test(password) : true,
    ]

    score = tests.filter(Boolean).length
    return Math.min(score, 4)
  }, [password, fullConfig])

  const strengthLabel = useMemo(() => {
    switch (strength) {
      case 0:
        return 'Too weak'
      case 1:
        return 'Weak'
      case 2:
        return 'Fair'
      case 3:
        return 'Good'
      case 4:
        return 'Strong'
      default:
        return ''
    }
  }, [strength])

  const strengthColor = useMemo(() => {
    switch (strength) {
      case 0:
      case 1:
        return 'bg-red-500'
      case 2:
        return 'bg-amber-500'
      case 3:
      case 4:
        return 'bg-primary'
      default:
        return 'bg-muted'
    }
  }, [strength])

  return { strength, strengthLabel, strengthColor }
}
