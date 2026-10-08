/**
 * Mobile Logo Component
 * Displays logo on mobile devices
 * Optimized with React.memo
 */

import { memo } from 'react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/brand/BrandLogo'

interface MobileLogoProps {
  appName?: string
  className?: string
}

export const MobileLogo = memo<MobileLogoProps>(({ appName = 'SmartHire AI', className = '' }) => {
  return (
    <Link
      to="/"
      className={`mb-8 flex flex-col items-center md:hidden ${className} group`}
      aria-label="SmartHire AI – go to home"
    >
      <div className="bg-surface mb-4 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl">
        <BrandLogo size={32} />
      </div>
      <h1 className="text-foreground group-hover:text-primary text-2xl font-bold transition-colors">
        {appName}
      </h1>
    </Link>
  )
})

MobileLogo.displayName = 'MobileLogo'
