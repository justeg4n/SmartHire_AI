import { memo, useMemo, useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Briefcase,
  Calendar,
  FileText,
  Home,
  LogOut,
  Moon,
  Settings,
  Sun,
  User,
  Video,
  Menu,
  X,
} from 'lucide-react'
import { signOut } from 'aws-amplify/auth'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'
import { useTheme } from '@/components/theme'

import { Button } from '@/components/ui/button'
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
    title: 'Apply Jobs',
    url: '/apply',
    icon: Briefcase,
  },
  {
    id: 'interviews',
    title: 'Interviews',
    url: '/interview',
    icon: Video,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    url: '/schedule',
    icon: Calendar,
  },
  {
    id: 'resume',
    title: 'Resume',
    url: '/resume',
    icon: FileText,
  },
] as const

const CandidateNavBarComponent = ({ children }: { children?: React.ReactNode }) => {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const { resolvedTheme, toggleTheme } = useTheme()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

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

  const userDisplayName = useMemo(() => {
    return user?.name || user?.email || 'User'
  }, [user])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch (err) {
      console.error('Error signing out:', err)
      toast.error('Failed to sign out. Please try again.')
    }
  }, [])

  const navigationItems = useMemo(() => navigationConfig, [])

  return (
    <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container flex h-20 max-w-screen-2xl items-center px-4 md:px-8">
        {/* Brand */}
        <div className="mr-10 hidden md:flex">
          <Link to="/" className="flex items-center space-x-3">
            <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20">
              <span className="text-lg font-bold">SH</span>
            </div>
            <span className="hidden text-xl font-bold tracking-tight sm:inline-block">
              SmartHire
            </span>
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle Menu"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {/* Brand Mobile */}
        <div className="flex flex-1 md:hidden">
          <Link to="/" className="flex items-center space-x-2">
            <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
              <span className="text-sm font-bold">SH</span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden flex-1 items-center space-x-8 text-[15px] font-semibold md:flex">
          {navigationItems.map((item) => {
            const isActive =
              location.pathname === item.url || location.pathname.startsWith(item.url)
            return (
              <Link
                key={item.id}
                to={item.url}
                className={`hover:text-foreground/80 transition-all ${
                  isActive ? 'text-foreground' : 'text-foreground/60'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-emerald-500' : ''}`} />
                  {item.title}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center space-x-3 md:space-x-6">
          {children && <div className="hidden items-center gap-3 md:flex">{children}</div>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 w-10 rounded-full transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Avatar className="border-border/50 h-10 w-10 border">
                  <AvatarImage src={user?.email} alt={userDisplayName} />
                  <AvatarFallback className="bg-emerald-500/10 font-bold text-emerald-500">
                    {getUserInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm leading-none font-medium">{userDisplayName}</p>
                  <p className="text-muted-foreground text-xs leading-none">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme}>
                {resolvedTheme === 'dark' ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur md:hidden">
          <nav className="flex flex-col gap-2 p-4">
            {navigationItems.map((item) => {
              const isActive =
                location.pathname === item.url || location.pathname.startsWith(item.url)
              return (
                <Link
                  key={item.id}
                  to={item.url}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50 text-foreground/60 hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </Link>
              )
            })}

            {/* Mobile Actions from children if any */}
            {children && (
              <div className="border-border/40 mt-2 flex items-center gap-2 border-t pt-2">
                {children}
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

export const CandidateNavBar = memo(CandidateNavBarComponent)
