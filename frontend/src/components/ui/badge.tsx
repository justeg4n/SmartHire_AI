import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        /* DEFAULT — Electric Teal (AI-driven insights) */
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90 font-semibold',

        /* NEON — Glowing teal badge for top AI matches */
        neon: 'bg-primary/10 text-primary border border-primary/30 shadow-[0_0_8px_rgba(15,255,224,0.3)] [a&]:hover:bg-primary/20',

        /* SECONDARY */
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',

        /* DESTRUCTIVE / ERROR */
        destructive:
          'bg-destructive/15 text-destructive border border-destructive/30 [a&]:hover:bg-destructive/20 dark:bg-destructive/20',

        /* OUTLINE — Ghost border */
        outline:
          'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',

        /* GHOST */
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',

        /* TERTIARY — Purple accent */
        tertiary:
          'bg-[#ac89ff]/10 text-[#ac89ff] border border-[#ac89ff]/30 [a&]:hover:bg-[#ac89ff]/20',

        /* SUCCESS — For verified/matched states */
        success:
          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 dark:text-emerald-400',

        /* LINK */
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
