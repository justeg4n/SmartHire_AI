/**
 * Shared Candidate Layout
 * Provides a shared sidebar shell for all candidate pages.
 * Pages render inside <Outlet />.
 */

import { useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { CandidateAppSidebar } from '../components/CandidateAppSidebar'
import { CandidateCvProvider } from '../context/CandidateCvContext'
import { ThemeToggle } from '@/components/theme'
import { Separator } from '@/components/ui/separator'

export function CandidateLayout() {
  const location = useLocation()

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith('/apply/')) return 'Job Details'
    if (location.pathname.startsWith('/apply')) return 'Open Jobs'
    if (location.pathname.startsWith('/applications')) return 'Applications'
    if (location.pathname.startsWith('/profile')) return 'Profile'
    if (location.pathname.startsWith('/resume')) return 'Resume'
    return 'Candidate Dashboard'
  }, [location.pathname])

  return (
    <CandidateCvProvider>
      <SidebarProvider>
        <CandidateAppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex w-full items-center gap-4 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <h1 className="font-display text-base font-semibold tracking-tight md:text-lg">
                {pageTitle}
              </h1>
              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle variant="dropdown" />
              </div>
            </div>
          </header>
          <main className="flex flex-1 flex-col gap-6 p-4 pt-2 md:px-6 md:pb-8">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </CandidateCvProvider>
  )
}
