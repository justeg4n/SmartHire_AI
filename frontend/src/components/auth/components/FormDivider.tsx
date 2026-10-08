/**
 * Form Divider Component
 * Reusable divider with "Or continue with" text
 * Optimized with React.memo
 */

import { memo } from 'react'

interface FormDividerProps {
  text?: string
  className?: string
}

export const FormDivider = memo<FormDividerProps>(
  ({ text = 'Or continue with', className = '' }) => {
    return (
      <div className={`relative my-4 ${className}`}>
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="border-border w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card text-muted-foreground px-2">{text}</span>
        </div>
      </div>
    )
  },
)

FormDivider.displayName = 'FormDivider'
