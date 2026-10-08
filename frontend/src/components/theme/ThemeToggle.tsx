import { memo, useCallback } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from './useTheme'

interface ThemeToggleProps {
  /** Render as a plain icon button (default) or inside a dropdown for light/dark/system */
  variant?: 'icon' | 'dropdown'
  className?: string
}

export const ThemeToggle = memo(({ variant = 'icon', className }: ThemeToggleProps) => {
  const { resolvedTheme, setTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const handleToggle = useCallback(() => toggleTheme(), [toggleTheme])

  if (variant === 'dropdown') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={className} aria-label="Toggle theme">
            {isDark ? (
              <Moon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme('light')}>
            <Sun className="mr-2 h-4 w-4" aria-hidden="true" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('dark')}>
            <Moon className="mr-2 h-4 w-4" aria-hidden="true" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('system')}>
            <span className="mr-2 flex h-4 w-4 items-center justify-center text-xs">⚙</span>
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className={className}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Moon className="h-4 w-4 transition-transform duration-300" aria-hidden="true" />
      ) : (
        <Sun className="h-4 w-4 transition-transform duration-300" aria-hidden="true" />
      )}
    </Button>
  )
})

ThemeToggle.displayName = 'ThemeToggle'
