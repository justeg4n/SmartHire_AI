/**
 * Custom hook for password visibility toggle
 * Encapsulates password show/hide logic for better reusability
 */

import { useState, useCallback } from 'react'
import type { UsePasswordToggleReturn } from '../types'

export const usePasswordToggle = (): UsePasswordToggleReturn => {
  const [showPassword, setShowPassword] = useState(false)

  const togglePassword = useCallback(() => {
    setShowPassword((prev) => !prev)
  }, [])

  return {
    showPassword,
    togglePassword,
  }
}
