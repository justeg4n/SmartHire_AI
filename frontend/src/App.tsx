import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './lib/cognito' // Initialize AWS Amplify
import { InterviewWorkspace } from './components/interview/InterviewWorkspace'
import { JobCreation } from './components/dashboard/recruiter/pages/JobCreation'
import { CandidateReport } from './components/dashboard/recruiter/pages/CandidateReport'
import { RecruiterShell } from './components/dashboard/recruiter/layouts/RecruiterShell'

import { GuestDashboard } from './components/dashboard/guest/GuestDashboard'
import { CandidateLayout } from './components/dashboard/candidate/layouts/CandidateLayout'
import { CandidateDashboard } from './components/dashboard/candidate/pages/CandidateDashboard'
import { CandidateApplyPage } from './components/dashboard/candidate/pages/CandidateApplyPage'
import { CandidateJobDetailsPage } from './components/dashboard/candidate/pages/CandidateJobDetailsPage'
import { CandidateApplicationsPage } from './components/dashboard/candidate/pages/CandidateApplicationsPage'
import { CandidateProfilePage } from './components/dashboard/candidate/pages/CandidateProfilePage'
import { CandidateResumePage } from './components/dashboard/candidate/pages/CandidateResumePage'
import { RecruiterDashboard } from './components/dashboard/recruiter/pages/RecruiterDashboard'
import { RecruiterAnalytics } from './components/dashboard/recruiter/pages/RecruiterAnalytics'
import { RecruiterJobDetailsPage } from './components/dashboard/recruiter/pages/RecruiterJobDetailsPage'
import { RecruiterJobEditPage } from './components/dashboard/recruiter/pages/RecruiterJobEditPage'
import { RankedCandidateProfilePage } from './components/dashboard/recruiter/pages/RankedCandidateProfilePage'
import { RecruiterSetupCompanyPage } from './components/dashboard/recruiter/pages/RecruiterSetupCompanyPage'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { Login } from './components/auth/Login'
import { Register, RecruiterRegister } from './components/auth/Register'
import { ForgotPassword } from './components/auth/ForgotPassword'
import { Loader2 } from 'lucide-react'
import { useAuthStore, type User } from './store/authStore'
import { Toaster } from '@/components/ui/sonner'
import { useEffect } from 'react'
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { ThemeProvider } from '@/components/theme'
import { ScrollToTop } from '@/components/ScrollToTop'
import { DocumentTitle } from '@/components/DocumentTitle'
import { fetchCurrentUser } from '@/lib/recruiterOnboarding'

// Root Route handler to direct users based on role
const RootRoute: React.FC = () => {
  const user = useAuthStore((state) => state.user)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0e0e14]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-10 w-10 animate-spin" />
          <span className="font-display text-muted-foreground text-xs font-semibold tracking-[0.15rem] uppercase">
            Initializing...
          </span>
        </div>
      </div>
    )
  }

  // Not authenticated - show guest dashboard
  if (!user) {
    return <GuestDashboard />
  }

  // Route based on user role
  switch (user.role) {
    case 'candidate':
      return <Navigate to="/candidate" replace />

    case 'recruiter':
      if (user.hasRecruiterProfile === false) {
        return <Navigate to="/recruiter/setup-company" replace />
      }
      return <Navigate to="/recruiter" replace />

    case 'admin':
      return <Navigate to="/recruiter" replace />

    default:
      return <GuestDashboard />
  }
}

// AuthInitializer synchronizes Amplify auth state with Zustand
function normalizeRole(raw?: string): User['role'] {
  const r = (raw ?? '').toLowerCase()
  return r === 'recruiter' || r === 'admin' || r === 'candidate' ? r : 'candidate'
}

const AuthInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    const checkUserSession = async () => {
      try {
        const session = await fetchAuthSession()
        if (session.tokens) {
          const attributes = await fetchUserAttributes()
          const token = session.tokens.idToken?.toString() || ''

          const loggedUser: User = {
            id: attributes.sub || '',
            email: attributes.email || '',
            name: attributes.name || 'User',
            role: normalizeRole(attributes['custom:role']),
          }
          try {
            const currentUser = await fetchCurrentUser(token)
            loggedUser.hasRecruiterProfile = currentUser.hasRecruiterProfile
          } catch (err) {
            console.warn('Failed to sync user profile state from API:', err)
          }
          login(loggedUser, token)
        } else {
          logout()
        }
      } catch (error) {
        console.error('Auth session check failed:', error)
        logout()
      }
    }

    // Check session on component mount
    checkUserSession()

    // Listen to Amplify Auth Hub events (login/logout from other tabs/components)
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
          checkUserSession()
          break
        case 'signedOut':
          logout()
          break
        case 'tokenRefresh_failure':
          logout()
          break
      }
    })

    return unsubscribe
  }, [login, logout])

  return <>{children}</>
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <Toaster />
      <AuthInitializer>
        <BrowserRouter>
          <DocumentTitle />
          <ScrollToTop />
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/register/recruiter" element={<RecruiterRegister />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Root Conditional Route - Routes based on role */}
            <Route path="/" element={<RootRoute />} />

            {/* Recruiter/Admin Dashboard Routes (Protected) */}
            <Route
              path="/recruiter"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterDashboard />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/setup-company"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterSetupCompanyPage />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/create-job"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <JobCreation />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/jobs"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterDashboard />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/jobs/:jobId/candidates/:candidateId"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RankedCandidateProfilePage />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/jobs/:jobId/edit"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterJobEditPage />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/jobs/:jobId"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterJobDetailsPage />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/candidates"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterDashboard />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/schedule"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterDashboard />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/report/:id"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <CandidateReport />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter/analytics"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <RecruiterAnalytics />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />

            {/* Candidate Routes – share CandidateLayout (single NavBar header) */}
            <Route
              element={
                <ProtectedRoute allowedRoles={['candidate']}>
                  <CandidateLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/candidate" element={<Navigate to="/dashboard" replace />} />
              <Route path="/candidate/matches" element={<Navigate to="/apply" replace />} />
              <Route
                path="/candidate/applications"
                element={<Navigate to="/applications" replace />}
              />
              <Route path="/candidate/profile" element={<Navigate to="/profile" replace />} />
              <Route path="/dashboard" element={<CandidateDashboard />} />
              <Route path="/apply" element={<CandidateApplyPage />} />
              <Route path="/apply/:jobId" element={<CandidateJobDetailsPage />} />
              <Route path="/applications" element={<CandidateApplicationsPage />} />
              <Route path="/profile" element={<CandidateProfilePage />} />
              <Route path="/resume" element={<CandidateResumePage />} />
            </Route>

            {/* Backward-compatible recruiter aliases */}
            <Route path="/create-job" element={<Navigate to="/recruiter/create-job" replace />} />
            <Route path="/analytics" element={<Navigate to="/recruiter/analytics" replace />} />
            <Route
              path="/report/:id"
              element={
                <ProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterShell>
                    <CandidateReport />
                  </RecruiterShell>
                </ProtectedRoute>
              }
            />

            {/* Candidate Interview Route (Public & Isolated Layout) */}
            <Route path="/interview" element={<InterviewWorkspace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthInitializer>
    </ThemeProvider>
  )
}

export default App
