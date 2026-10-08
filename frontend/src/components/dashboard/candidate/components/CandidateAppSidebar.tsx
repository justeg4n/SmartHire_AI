import { memo, useMemo, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BriefcaseBusiness, FileText, Home, LogOut, Settings, Upload, User } from 'lucide-react'
import { signOut } from 'aws-amplify/auth'
import { toast } from 'sonner'

import { useAuthStore } from '@/store/authStore'
import {
  PortalSidebarBrandHeader,
  PortalSidebarNavLink,
  portalSidebarContentClassName,
  portalSidebarFooterClassName,
  portalSidebarFooterMenuClassName,
  portalSidebarFooterMenuItemClassName,
  portalSidebarMenuClassName,
  portalSidebarNavGroupClassName,
  portalSidebarNavGroupContentClassName,
} from '@/components/dashboard/shared/portal-sidebar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const navigationConfig = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    url: '/dashboard',
    icon: Home,
  },
  {
    id: 'apply',
    title: 'Open Jobs',
    url: '/apply',
    icon: BriefcaseBusiness,
  },
  {
    id: 'resume',
    title: 'Upload CV',
    url: '/resume',
    icon: Upload,
  },
  {
    id: 'applications',
    title: 'Applications',
    url: '/applications',
    icon: FileText,
  },
  {
    id: 'profile',
    title: 'Profile',
    url: '/profile',
    icon: User,
  },
] as const

const CandidateAppSidebarComponent = () => {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)

  const userInitials = useMemo(() => {
    if (user?.name) {
      return user.name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    }

    return user?.email?.[0].toUpperCase() || 'U'
  }, [user])

  const userDisplayName = useMemo(() => user?.name || user?.email || 'Candidate', [user])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch (err) {
      console.error('Error signing out:', err)
      toast.error('Failed to sign out. Please try again.')
    }
  }, [])

  return (
    <Sidebar collapsible="icon" className="border-border/30 border-r">
      <PortalSidebarBrandHeader homeTo="/dashboard" subtitle="AI Powered" />

      <SidebarContent className={portalSidebarContentClassName}>
        <SidebarGroup className={portalSidebarNavGroupClassName}>
          <SidebarGroupContent className={portalSidebarNavGroupContentClassName}>
            <SidebarMenu className={portalSidebarMenuClassName}>
              {navigationConfig.map((item) => {
                const isActive =
                  location.pathname === item.url || location.pathname.startsWith(`${item.url}/`)

                return (
                  <PortalSidebarNavLink
                    key={item.id}
                    to={item.url}
                    title={item.title}
                    icon={item.icon}
                    isActive={isActive}
                  />
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={portalSidebarFooterClassName}>
        <SidebarMenu className={portalSidebarFooterMenuClassName}>
          <SidebarMenuItem className={portalSidebarFooterMenuItemClassName}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="bg-secondary/50 text-foreground hover:bg-secondary h-14 justify-between rounded-lg px-3 transition-all duration-200 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:w-auto! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user?.email} alt={userDisplayName} />
                    <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-semibold">{userDisplayName}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      Software Engineer
                    </span>
                  </div>
                  <Settings
                    aria-hidden="true"
                    className="text-muted-foreground size-4 group-data-[collapsible=icon]:hidden"
                  />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.email} alt={userDisplayName} />
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{userDisplayName}</span>
                      <span className="truncate text-xs">Candidate</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <User aria-hidden="true" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

export const CandidateAppSidebar = memo(CandidateAppSidebarComponent)
