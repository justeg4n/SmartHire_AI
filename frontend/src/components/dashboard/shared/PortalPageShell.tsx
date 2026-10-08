import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PortalPageShellProps = {
  portalLabel: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function PortalPageShell({
  portalLabel,
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: PortalPageShellProps) {
  return (
    <div className={cn('flex flex-1 flex-col gap-4 py-6', className)}>
      <section className="space-y-2">
        <p className="text-primary text-xs font-semibold tracking-[0.12rem] uppercase">
          {portalLabel}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
            {description ? (
              <p className="text-muted-foreground text-base md:text-lg">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </section>

      <div className={bodyClassName}>{children}</div>
    </div>
  )
}
