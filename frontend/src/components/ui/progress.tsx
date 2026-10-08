'use client'

import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Neon Protocol Progress/Skill Bar
 * - Height: 4px (Skill Bars rule)
 * - Track: surface_container_highest (#25252e)
 * - Fill: gradient primary → primary-dim
 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        // Track: surface_container_highest
        'relative h-1 w-full overflow-hidden rounded-full',
        'bg-primary/15 dark:bg-[#25252e]',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-full transition-all duration-500 ease-out"
        style={{
          transform: `translateX(-${100 - (value || 0)}%)`,
          // Gradient fill: primary → primary-dim
          background: 'linear-gradient(90deg, #0fffe0 0%, #00e8cc 100%)',
        }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
