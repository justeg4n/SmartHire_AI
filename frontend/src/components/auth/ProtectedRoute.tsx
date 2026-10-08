/**
 * Optimized ProtectedRoute Component
 * - Memoized to prevent unnecessary re-renders
 * - Added support for role-based access control
 * - Custom fallback loading component
 * - Better separation of loading states
 * - Proper accessibility attributes
 */

import { memo } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Loader2 } from 'lucide-react'
import type { ProtectedRouteProps } from './types'

// Memoized loading component
const LoadingState = memo<{ message?: string }>(({ message }) => (
  <div
    className="flex h-screen w-full items-center justify-center bg-zinc-950 text-emerald-500"
    role="status"
    aria-live="polite"
  >
    <div className="animate-in fade-in flex flex-col items-center gap-4 duration-500">
      <Loader2 className="h-10 w-10 animate-spin" aria-hidden="true" />
      <p className="font-medium text-zinc-400">{message || 'Verifying Session...'}</p>
      <span className="sr-only">Loading, please wait</span>
    </div>
  </div>
))
LoadingState.displayName = 'LoadingState'

// Memoized unauthorized component
const UnauthorizedState = memo<{ allowedRoles?: string[] }>(({ allowedRoles }) => (
  <div className="flex h-screen w-full items-center justify-center bg-zinc-950" role="alert">
    <div className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
        <svg
          className="h-8 w-8 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-zinc-50">Access Denied</h2>
      <p className="text-zinc-400">
        {allowedRoles && allowedRoles.length > 0
          ? `You need one of these roles to access this page: ${allowedRoles.join(', ')}`
          : "You don't have permission to access this page."}
      </p>
    </div>
  </div>
))
UnauthorizedState.displayName = 'UnauthorizedState'

export const ProtectedRoute = memo<ProtectedRouteProps>(
  ({ children, fallback, requiredRole, allowedRoles }) => {
    const user = useAuthStore((state) => state.user)
    const isLoading = useAuthStore((state) => state.isLoading)
    const location = useLocation()

    // Show loading state while verifying authentication
    if (isLoading) {
      return fallback ? <>{fallback}</> : <LoadingState />
    }

    // Redirect to login if not authenticated
    if (!user) {
      return <Navigate to="/login" state={{ from: location }} replace />
    }

    // Check role-based access if required (single role)
    if (requiredRole && user.role !== requiredRole) {
      return <UnauthorizedState allowedRoles={[requiredRole]} />
    }

    // Check role-based access if required (multiple roles)
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return <UnauthorizedState allowedRoles={allowedRoles} />
    }

    // Render protected content
    return <>{children}</>
  },
)

ProtectedRoute.displayName = 'ProtectedRoute'
