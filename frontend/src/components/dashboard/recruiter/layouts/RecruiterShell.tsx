import React, { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { RecruiterAppSidebar } from '../components/RecruiterAppSidebar'
import { ThemeToggle } from '@/components/theme'
import { useAuthStore } from '@/store/authStore'

type RecruiterShellProps = {
  children: React.ReactNode
}

export const RecruiterShell: React.FC<RecruiterShellProps> = ({ children }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (user?.role !== 'recruiter') return
    if (user.hasRecruiterProfile !== false) return
    if (location.pathname === '/recruiter/setup-company') return
    navigate('/recruiter/setup-company', { replace: true })
  }, [location.pathname, navigate, user?.hasRecruiterProfile, user?.role])

  const pageLabel = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/recruiter/create-job') || path.startsWith('/create-job')) {
      return isAdmin ? 'Admin: Create Job' : 'Create Job'
    }
    if (path.startsWith('/recruiter/report/') || path.startsWith('/report/')) {
      return isAdmin ? 'Admin: Candidate Report' : 'Candidate Report'
    }
    if (path.startsWith('/recruiter/analytics') || path.startsWith('/analytics')) {
      return isAdmin ? 'Admin: Analytics' : 'Analytics Dashboard'
    }
    if (/^\/recruiter\/jobs\/[^/]+\/candidates\/[^/]+/.test(path)) {
      return isAdmin ? 'Admin: Ranked candidate' : 'Ranked candidate'
    }
    if (/^\/recruiter\/jobs\/[^/]+\/edit\/?$/.test(path)) {
      return isAdmin ? 'Admin: Edit job' : 'Edit job'
    }
    if (path.startsWith('/recruiter/jobs/')) {
      return isAdmin ? 'Admin: Job detail' : 'Job detail'
    }
    return isAdmin ? 'Admin Dashboard' : 'Recruiter Dashboard'
  }, [isAdmin, location.pathname])

  return (
    <SidebarProvider>
      <RecruiterAppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex w-full items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link to="/">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle variant="dropdown" />
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
