/**
 * Shared shadcn Sidebar layout primitives aligned with registry block **sidebar-07**
 * (collapsible icon rail). Use with `@/components/ui/sidebar` — add/refresh via:
 * `npx shadcn@latest add @shadcn/sidebar`
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export const portalSidebarHeaderClassName =
  'border-border/30 border-b px-4 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:py-4'

export const portalSidebarContentClassName =
  'px-4 py-4 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center'

export const portalSidebarNavGroupClassName =
  'px-0 py-0 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:items-center'

export const portalSidebarNavGroupContentClassName =
  'group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center'

export const portalSidebarMenuClassName =
  'gap-2 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:items-center'

export const portalSidebarFooterClassName =
  'border-t border-[#48474f]/30 p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:py-2'

export const portalSidebarFooterMenuClassName = 'group-data-[collapsible=icon]:items-center'

export const portalSidebarFooterMenuItemClassName =
  'group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center'

const brandButtonClassName =
  'h-auto rounded-none bg-transparent p-0 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:w-auto! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:rounded-lg! group-data-[collapsible=icon]:p-0! hover:bg-transparent data-[active=true]:bg-transparent'

const navButtonClassName =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-primary relative h-11 rounded-lg px-3 transition-all duration-200 group-data-[collapsible=icon]:justify-center data-[active=true]:font-semibold'

const navLinkClassName =
  'flex w-full items-center gap-3 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0'

type PortalSidebarBrandHeaderProps = {
  homeTo: string
  subtitle: ReactNode
}

export function PortalSidebarBrandHeader({ homeTo, subtitle }: PortalSidebarBrandHeaderProps) {
  return (
    <SidebarHeader className={portalSidebarHeaderClassName}>
      <div className="flex w-full items-start justify-between gap-2 group-data-[collapsible=icon]:justify-center">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <SidebarMenuButton size="lg" asChild className={brandButtonClassName}>
              <Link
                to={homeTo}
                className="group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center"
              >
                <div className="bg-surface-low flex size-8 items-center justify-center overflow-hidden rounded-lg shadow-sm">
                  <BrandLogo size={24} />
                </div>
                <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="font-display text-foreground/90 text-2xl font-bold tracking-tight">
                    SmartHire
                  </span>
                  <span className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
                    {subtitle}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
    </SidebarHeader>
  )
}

type PortalSidebarNavLinkProps = {
  to: string
  title: string
  icon: LucideIcon
  isActive: boolean
  tooltip?: string
}

export function PortalSidebarNavLink({
  to,
  title,
  icon: Icon,
  isActive,
  tooltip,
}: PortalSidebarNavLinkProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={tooltip ?? title}
        className={navButtonClassName}
      >
        <Link to={to} className={navLinkClassName}>
          {isActive ? (
            <span
              aria-hidden="true"
              className="bg-primary absolute inset-y-2 left-0 w-1 rounded-r-full group-data-[collapsible=icon]:hidden"
            />
          ) : null}
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-sm group-data-[collapsible=icon]:hidden">{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
