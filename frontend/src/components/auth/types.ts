/**
 * Type definitions for authentication components
 * Centralized types for better type safety and reusability
 */

import type { User } from '@/store/authStore'
import type { FieldValues } from 'react-hook-form'

// Form validation schemas
export interface LoginFormData {
  email: string
  password: string
}

export interface RegisterFormData {
  name: string
  email: string
  password: string
  companyName?: string
  taxCode?: string
}

export interface ConfirmFormData {
  code: string
}

// Component props
export interface AuthLayoutProps {
  children: React.ReactNode
}

export interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  requiredRole?: User['role']
  allowedRoles?: User['role'][]
}

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string
  showStrength?: boolean
}

// Hook return types
export interface UseAuthFormReturn<T extends FieldValues> {
  isSubmitting: boolean
  onSubmit: (data: T) => Promise<void>
  error: string | null
  clearError: () => void
}

export interface UsePasswordToggleReturn {
  showPassword: boolean
  togglePassword: () => void
}

export interface UsePasswordStrengthReturn {
  strength: number
  strengthLabel: string
  strengthColor: string
}

// Authentication error types
export type AuthError = {
  code: string
  message: string
  name: string
}

// Social provider types
export type SocialProvider = 'Google' | 'Facebook' | 'Apple'

// Authentication step types
export type AuthStep =
  | 'SIGN_IN'
  | 'CONFIRM_SIGN_UP'
  | 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'
  | 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION'
  | 'CONFIRM_SIGN_IN_WITH_SMS_MFA_CODE'
  | 'CONFIRM_SIGN_IN_WITH_TOTP_CODE'
  | 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP'
  | 'DONE'

// Cognito attribute mapping
export interface CognitoUserAttributes {
  sub?: string
  email?: string
  email_verified?: string
  given_name?: string
  family_name?: string
  name?: string
  phone_number?: string
  [key: string]: string | undefined
}
