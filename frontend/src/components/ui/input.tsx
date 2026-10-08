import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Neon Protocol Input
 * Dark mode: surface_container_highest background (#25252e)
 * Focus: Electric Teal ring
 * Ghost border at rest
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
        'h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        // Light mode
        'border-input bg-transparent',
        // Dark mode: surface_container_highest (#25252e) background
        'dark:text-foreground dark:border-[rgba(72,71,79,0.3)] dark:bg-[#25252e]',
        // Focus: Electric Teal ring
        'focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-[3px]',
        // Invalid state
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
