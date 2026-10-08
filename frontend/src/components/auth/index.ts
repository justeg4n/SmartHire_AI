/**
 * Barrel export for all auth components
 * Provides clean imports across the application
 */

// Main components
export { AuthLayout } from './AuthLayout'
export { Login } from './Login'
export { Register, RecruiterRegister } from './Register'
export { ProtectedRoute } from './ProtectedRoute'
export { ForgotPassword } from './ForgotPassword'

// Reusable components
export * from './components'

// Custom hooks
export * from './hooks'

// Types
export * from './types'
