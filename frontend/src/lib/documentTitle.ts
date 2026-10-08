import { matchPath } from 'react-router-dom'

const APP_NAME = 'SmartHire AI'

/**
 * Patterns in order: first match wins. Put more specific paths before generic ones.
 */
const ROUTE_TITLE_PATTERNS: { path: string; title: string }[] = [
  { path: '/recruiter/jobs/:jobId/candidates/:candidateId', title: 'Ranked candidate' },
  { path: '/recruiter/jobs/:jobId/edit', title: 'Edit job' },
  { path: '/recruiter/jobs/:jobId', title: 'Job details' },
  { path: '/recruiter/setup-company', title: 'Setup company' },
  { path: '/recruiter/create-job', title: 'Create job' },
  { path: '/recruiter/jobs', title: 'Jobs' },
  { path: '/recruiter/candidates', title: 'Candidates' },
  { path: '/recruiter/schedule', title: 'Schedule' },
  { path: '/recruiter/report/:id', title: 'Candidate report' },
  { path: '/recruiter/analytics', title: 'Analytics' },
  { path: '/recruiter', title: 'Recruiter dashboard' },
  { path: '/report/:id', title: 'Candidate report' },
  { path: '/apply/:jobId', title: 'Job details' },
  { path: '/dashboard', title: 'Candidate dashboard' },
  { path: '/apply', title: 'Open jobs' },
  { path: '/applications', title: 'Applications' },
  { path: '/profile', title: 'Profile' },
  { path: '/resume', title: 'Upload CV' },
  { path: '/interview', title: 'Interview' },
  { path: '/login', title: 'Sign in' },
  { path: '/register/recruiter', title: 'Recruiter registration' },
  { path: '/register', title: 'Create account' },
  { path: '/forgot-password', title: 'Forgot password' },
  { path: '/', title: 'Home' },
]

export function getTitleForPathname(pathname: string): string {
  for (const { path, title } of ROUTE_TITLE_PATTERNS) {
    if (matchPath({ path, end: true }, pathname)) {
      return `${title} · ${APP_NAME}`
    }
  }
  return APP_NAME
}
