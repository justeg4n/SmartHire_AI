import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        /* PRIMARY — Gradient CTA: linear-gradient(135deg, #0FFFE0 → #00E8CC) */
        default:
          'gradient-cta rounded-md font-semibold tracking-wide hover:opacity-90 active:scale-[0.98] shadow-sm hover:shadow-[0_0_12px_rgba(15,255,224,0.35)]',

        /* DESTRUCTIVE */
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 rounded-md',

        /* OUTLINE — Ghost border: 20% primary, glow on hover */
        outline:
          'border border-primary/20 bg-transparent text-primary hover:border-primary hover:shadow-[inset_0_0_0_1px_rgba(15,255,224,0.4),0_0_8px_rgba(15,255,224,0.2)] dark:bg-transparent rounded-md transition-[border-color,box-shadow]',

        /* SECONDARY */
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md dark:bg-surface-highest dark:text-foreground',

        /* GHOST */
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 rounded-md',

        /* TEXT — All-caps, label style per Neon Protocol */
        link: 'text-primary underline-offset-4 hover:underline uppercase tracking-[0.1rem] text-xs font-semibold',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9 rounded-md',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': 'size-10 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
