import { memo } from 'react'

export const TechBackground = memo(function TechBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Base surface */}
      <div className="bg-background absolute inset-0" />

      {/* Dot grid – subtle in light, more visible in dark */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#94a3b8_1px,transparent_1px)] bg-size-[28px_28px] opacity-30 dark:bg-[radial-gradient(circle_at_center,rgba(15,255,224,0.35)_1px,transparent_1px)] dark:opacity-[0.18]" />

      {/* Primary ambient blob – electric teal */}
      <div className="bg-primary/15 dark:bg-primary/20 absolute -top-40 -left-40 h-160 w-160 rounded-full blur-[120px]" />

      {/* Secondary ambient blob – indigo/violet, bottom-right */}
      <div className="absolute -right-40 -bottom-40 h-135 w-135 rounded-full bg-indigo-400/20 blur-[100px] dark:bg-violet-600/20" />

      {/* Tertiary accent blob – sky, centre-right */}
      <div className="dark:bg-primary/10 absolute top-1/3 right-1/4 h-80 w-80 rounded-full bg-sky-300/15 blur-[80px]" />

      {/* Dark-only deep glow – centre bottom */}
      <div className="bg-primary/15 absolute bottom-0 left-1/2 hidden h-60 w-120 -translate-x-1/2 rounded-full blur-[90px] dark:block" />

      {/* Dark-only pulse – top-right area */}
      <div className="bg-primary/10 absolute top-20 right-0 hidden h-75 w-75 rounded-full blur-[70px] dark:block" />

      {/* Spinning ring – top-right */}
      <div className="border-primary/35 absolute -top-24 -right-24 h-105 w-105 animate-[spin_90s_linear_infinite] rounded-full border" />

      {/* Dashed orbit ring – bottom-left */}
      <div className="border-primary/25 dark:border-primary/40 absolute -bottom-48 -left-24 h-175 w-175 animate-[spin_150s_linear_infinite_reverse] rounded-full border border-dashed border-slate-200/60" />

      {/* Vertical accent line */}
      <div className="via-primary/25 absolute top-0 left-[38%] h-full w-px bg-linear-to-b from-transparent to-transparent" />

      {/* Horizontal accent line */}
      <div className="via-primary/20 absolute top-[62%] left-0 h-px w-full bg-linear-to-r from-transparent to-transparent" />

      {/* Diamond markers */}
      <div className="border-primary/30 absolute top-20 right-48 h-10 w-10 rotate-45 border-2" />
      <div className="border-primary/25 absolute bottom-32 left-40 h-5 w-5 rotate-45 border border-indigo-400/30" />
      {/* Extra dark-mode diamond */}
      <div className="border-primary/40 absolute top-1/2 right-16 hidden h-3 w-3 rotate-45 border dark:block" />

      {/* Radial vignette for readability */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_30%,rgba(248,250,252,0.55)_100%)] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_20%,rgba(9,9,11,0.85)_100%)]" />
    </div>
  )
})

TechBackground.displayName = 'TechBackground'
