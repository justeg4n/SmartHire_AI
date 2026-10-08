/**
 * GuestPageHeader — Neon Protocol
 *
 * Sticky nav: dark glass panel, Electric Teal logo mark
 * Stitch: "SmartHire AI Landing Page" header design
 */

import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#about' },
]

export const GuestPageHeader = memo(function GuestPageHeader() {
  return (
    <header
      className="border-border/10 bg-background/80 sticky top-0 z-50 flex w-full items-center justify-between border-b px-6 py-4 backdrop-blur-xl transition-all duration-300 md:px-12"
      role="banner"
    >
      {/* ── Brand wordmark ── */}
      <Link to="/" aria-label="SmartHire AI Home" className="group flex items-center gap-3">
        {/* Logo mark: gradient teal box */}
        <BrandLogo
          size={36}
          className="rounded-lg shadow-[0_0_15px_rgba(15,255,224,0.2)] transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(15,255,224,0.4)]"
        />
        <span className="font-display text-foreground/90 text-xl font-bold tracking-tight transition-colors">
          SmartHire <span className="text-primary">AI</span>
        </span>
      </Link>

      {/* ── Nav links (Stitch: Features, Pricing, About) ── */}
      <NavigationMenu viewport={false} className="hidden md:flex" aria-label="Main navigation">
        <NavigationMenuList className="gap-2">
          {NAV_ITEMS.map((item) => (
            <NavigationMenuItem key={item.label}>
              <NavigationMenuLink
                href={item.href}
                className="hover:text-primary text-muted-foreground rounded-full px-3 py-2 text-sm font-semibold tracking-wider uppercase transition-colors"
              >
                {item.label}
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3">
        <ThemeToggle variant="dropdown" />
        <Button asChild variant="outline" className="hidden rounded-full text-sm sm:inline-flex">
          <Link to="/login">Sign In</Link>
        </Button>
        <Button asChild className="hidden rounded-full text-sm sm:inline-flex">
          <Link to="/register">Get Started</Link>
        </Button>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="sm:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[88%] max-w-xs">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Explore SmartHire AI pages.</SheetDescription>
            </SheetHeader>

            <nav className="mt-8 flex flex-col gap-2" aria-label="Mobile navigation">
              {NAV_ITEMS.map((item) => (
                <SheetClose asChild key={item.label}>
                  <a
                    href={item.href}
                    className="hover:text-primary text-muted-foreground hover:bg-accent rounded-lg px-3 py-3 text-sm font-semibold tracking-wider uppercase transition-colors"
                  >
                    {item.label}
                  </a>
                </SheetClose>
              ))}

              <div className="mt-3 grid grid-cols-1 gap-2">
                <SheetClose asChild>
                  <Button asChild variant="outline" className="w-full rounded-full text-sm">
                    <Link to="/login">Sign In</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild className="w-full rounded-full text-sm">
                    <Link to="/register">Get Started</Link>
                  </Button>
                </SheetClose>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
})
