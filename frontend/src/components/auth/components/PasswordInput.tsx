/**
 * Reusable Password Input Component with show/hide toggle
 * Optimized with React.memo for performance
 */

import React, { memo } from 'react'
import { Input } from '@/components/ui/input'
import { Lock, Eye, EyeOff } from 'lucide-react'
import { usePasswordToggle } from '../hooks'

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string
  showIcon?: boolean
  iconClassName?: string
}

export const PasswordInput = memo<PasswordInputProps>(
  ({ value, showIcon = true, iconClassName = '', ...props }) => {
    const { showPassword, togglePassword } = usePasswordToggle()

    return (
      <div className="relative">
        {showIcon && (
          <Lock
            className={`text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 ${iconClassName}`}
          />
        )}
        <Input
          type={showPassword ? 'text' : 'password'}
          className={`${
            showIcon ? 'pl-10' : ''
          } border-input bg-background focus-visible:ring-primary/40 pr-10`}
          value={value}
          {...props}
        />
        <button
          type="button"
          onClick={togglePassword}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 flex -translate-y-1/2 items-center justify-center p-1 transition-colors"
          title={showPassword ? 'Hide password' : 'Show password'}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    )
  },
)

PasswordInput.displayName = 'PasswordInput'
