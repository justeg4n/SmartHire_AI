import { memo } from 'react'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
  iconOnly?: boolean
  showText?: boolean
  size?: number | string
}

/**
 * SmartHire AI - Official "Mission Control" SVG Logo (Refined V4 - Clean)
 *
 * Features:
 * - Precise Clinical Cloud Silhouette
 * - Central Pulsing Neural Node (Intelligence)
 * - Minimalist Network Accents
 * - No Lambda/Serverless branding per user request
 */
export const BrandLogo = memo(({ className, size = 32 }: BrandLogoProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('select-none', className)}
      aria-label="SmartHire AI Logo"
    >
      {/* ── Outer Cloud Container ── */}
      <path
        d="M28 72C16 72 8 64 8 54C8 45 14 37 23 36C26 24 36 15 49 15C62 15 72 24 75 36C84 37 90 45 90 54C90 64 82 72 72 72H28Z"
        fill="currentColor"
        className="text-primary opacity-10"
      />
      <path
        d="M28 72C16 72 8 64 8 54C8 45 14 37 23 36C26 24 36 15 49 15C62 15 72 24 75 36C84 37 90 45 90 54C90 64 82 72 72 72H28Z"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary shadow-sm"
      />

      {/* ── Central Neural Intelligence Node ── */}
      <circle
        cx="49"
        cy="48"
        r="6"
        fill="currentColor"
        className="text-primary animate-pulse"
        style={{ animationDuration: '2s' }}
      />
      <circle
        cx="49"
        cy="48"
        r="12"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 4"
        className="text-primary animate-spin-slow opacity-30"
      />

      {/* ── Network Nodes (Neural Connectivity) ── */}
      <g className="text-primary opacity-60">
        <circle cx="34" cy="44" r="2.5" fill="currentColor" />
        <circle cx="64" cy="44" r="2.5" fill="currentColor" />
        <circle cx="49" cy="28" r="2.5" fill="currentColor" />
        <circle cx="49" cy="62" r="2.5" fill="currentColor" />

        {/* Subtle Connection Lines */}
        <path
          d="M36 44H43M55 44H62M49 31V42M49 54V59"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
})

BrandLogo.displayName = 'BrandLogo'
