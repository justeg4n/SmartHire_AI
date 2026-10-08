/**
 * Recruiter/Admin App Sidebar Component
 * Sidebar navigation for recruiter/admin dashboard using shadcn/ui Sidebar
 */

import { memo, useMemo, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Briefcase,
  Calendar,
  Home,
  LogOut,
  Moon,
  PlusCircle,
  Settings,
  Sun,
  User,
  Users,
  BarChart3,
} from 'lucide-react'
import { signOut } from 'aws-amplify/auth'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'
import { useTheme } from '@/components/theme'
import { cn } from '@/lib/utils'
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
  SidebarGroupLabel,
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

// Navigation items configuration
// Structured format with role-based access
const navigationConfig = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    url: '/recruiter',
    icon: Home,
    description: 'Overview and analytics',
    roles: ['recruiter', 'admin'],
  },
  {
    id: 'jobs',
    title: 'Jobs',
    url: '/recruiter/jobs',
    icon: Briefcase,
    description: 'Manage job postings',
    roles: ['recruiter', 'admin'],
  },
  {
    id: 'create-job',
    title: 'Create Job',
    url: '/recruiter/create-job',
    icon: PlusCircle,
    description: 'Post a new job opening',
    roles: ['recruiter', 'admin'],
  },
  {
    id: 'candidates',
    title: 'Candidates',
    url: '/recruiter/candidates',
    icon: Users,
    description: 'View candidate pipeline',
    roles: ['recruiter', 'admin'],
  },
  {
    id: 'schedule',
    title: 'Schedule',
    url: '/recruiter/schedule',
    icon: Calendar,
    description: 'Interview scheduling',
    roles: ['recruiter', 'admin'],
  },
  {
    id: 'reports',
    title: 'Reports',
    url: '/recruiter/report/demo',
    icon: BarChart3,
    description: 'View reports and metrics',
    roles: ['recruiter', 'admin'],
  },
] as const

const RecruiterAppSidebarComponent = () => {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const isAdmin = user?.role === 'admin'

  // Memoize user initials for performance
  const getUserInitials = useMemo(() => {
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

  // Memoize user display name
  const userDisplayName = useMemo(() => {
    return user?.name || user?.email || 'User'
  }, [user])

  // Memoize role label
  const roleLabel = useMemo(() => {
    return isAdmin ? 'Admin Panel' : 'Recruiter Portal'
  }, [isAdmin])

  // Optimized sign out handler with feedback
  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch (err) {
      console.error('Error signing out:', err)
      toast.error('Failed to sign out. Please try again.')
    }
  }, [])

  const { resolvedTheme, toggleTheme } = useTheme()

  // Memoize navigation items to prevent unnecessary re-renders
  const navigationItems = useMemo(() => navigationConfig, [])

  return (
    <Sidebar
      collapsible="icon"
      className="border-border/30 border-r transition-colors duration-300"
    >
      <PortalSidebarBrandHeader homeTo="/recruiter" subtitle={roleLabel} />

      <SidebarContent className={portalSidebarContentClassName}>
        <SidebarGroup className={portalSidebarNavGroupClassName}>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent className={portalSidebarNavGroupContentClassName}>
            <SidebarMenu className={portalSidebarMenuClassName}>
              {navigationItems.map((item) => {
                const isActive =
                  location.pathname === item.url ||
                  (item.url === '/recruiter/jobs' &&
                    location.pathname.startsWith('/recruiter/jobs/'))
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

        <SidebarGroup className={cn(portalSidebarNavGroupClassName, 'mt-auto')}>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent className={portalSidebarNavGroupContentClassName}>
            <SidebarMenu className={portalSidebarMenuClassName}>
              <PortalSidebarNavLink
                to="/settings"
                title="Settings"
                icon={Settings}
                isActive={location.pathname === '/settings'}
              />
              <PortalSidebarNavLink
                to="/profile"
                title="Profile"
                icon={User}
                isActive={location.pathname === '/profile'}
              />
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
                      {getUserInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-semibold">{userDisplayName}</span>
                    <span className="text-muted-foreground truncate text-xs">{user?.email}</span>
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
                      <AvatarFallback>{getUserInitials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{userDisplayName}</span>
                      <span className="truncate text-xs">
                        {isAdmin ? 'Administrator' : 'Recruiter'}
                      </span>
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
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings aria-hidden="true" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={toggleTheme}>
                  {resolvedTheme === 'dark' ? (
                    <Sun aria-hidden="true" />
                  ) : (
                    <Moon aria-hidden="true" />
                  )}
                  {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
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

export const RecruiterAppSidebar = memo(RecruiterAppSidebarComponent)
