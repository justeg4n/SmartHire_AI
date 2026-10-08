import { memo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Mail, ArrowLeft, Loader2 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { useForgotPassword } from './hooks'
import { PasswordInput, PasswordStrengthIndicator, MobileLogo } from './components'

const requestSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
})

const confirmSchema = z
  .object({
    code: z.string().length(6, { message: 'Code must be exactly 6 digits.' }),
    newPassword: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters.' })
      .regex(/[a-z]/, { message: 'Must contain at least one lowercase letter.' })
      .regex(/[A-Z]/, { message: 'Must contain at least one uppercase letter.' })
      .regex(/[0-9]/, { message: 'Must contain at least one number.' })
      .regex(/[^A-Za-z0-9]/, { message: 'Must contain at least one special character.' }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

type RequestFormData = z.infer<typeof requestSchema>
type ConfirmFormData = z.infer<typeof confirmSchema>

// Request Step Component
interface RequestStepProps {
  isSubmitting: boolean
  onRequest: (email: string) => Promise<void>
}

const RequestStep = memo<RequestStepProps>(({ isSubmitting, onRequest }) => {
  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
  })

  const handleSubmit = useCallback(
    ({ email }: RequestFormData) => {
      onRequest(email)
    },
    [onRequest],
  )

  return (
    <>
      <div className="mb-8 flex flex-col gap-2 text-center md:text-left">
        <h2 className="text-foreground font-display text-3xl font-bold tracking-tight">
          Forgot password?
        </h2>
        <p className="text-muted-foreground text-sm">
          Enter your email address and we'll send you a reset code.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-5 duration-500"
          noValidate
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="fp-email" className="text-foreground ml-1">
                  Email address
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail
                      className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <Input
                      id="fp-email"
                      type="email"
                      placeholder="name@company.com"
                      autoComplete="email"
                      className="border-input bg-background focus-visible:ring-primary/40 pl-10"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage className="ml-1 text-red-400" />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="default"
            disabled={isSubmitting}
            className="mt-2 h-11 w-full font-bold"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="sr-only">Sending...</span>
              </>
            ) : (
              'Send reset code'
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-6 text-center text-sm">
        <Link
          to="/login"
          className="text-primary inline-flex items-center gap-1 font-medium transition-colors hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </div>
    </>
  )
})
RequestStep.displayName = 'RequestStep'

// Confirm Step Component
interface ConfirmStepProps {
  pendingEmail: string
  isSubmitting: boolean
  onConfirm: (code: string, newPassword: string) => Promise<void>
}

const ConfirmStep = memo<ConfirmStepProps>(({ pendingEmail, isSubmitting, onConfirm }) => {
  const form = useForm<ConfirmFormData>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
    mode: 'onChange',
  })

  const newPasswordValue = useWatch({
    control: form.control,
    name: 'newPassword',
    defaultValue: '',
  })

  const handleSubmit = useCallback(
    ({ code, newPassword }: ConfirmFormData) => {
      onConfirm(code, newPassword)
    },
    [onConfirm],
  )

  return (
    <>
      <div className="mb-8 flex flex-col gap-2 text-center md:text-left">
        <h2 className="text-foreground font-display text-3xl font-bold tracking-tight">
          Set new password
        </h2>
        <p className="text-muted-foreground text-sm">
          Enter the code sent to <span className="text-foreground font-medium">{pendingEmail}</span>{' '}
          and choose a new password.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-5 duration-500"
          noValidate
        >
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="fp-code" className="text-foreground ml-1">
                  Verification code
                </FormLabel>
                <FormControl>
                  <Input
                    id="fp-code"
                    placeholder="123456"
                    className="border-input bg-background focus-visible:ring-primary/40 text-center text-lg tracking-widest"
                    maxLength={6}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="ml-1 text-red-400" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="fp-new-password" className="text-foreground ml-1">
                  New password
                </FormLabel>
                <FormControl>
                  <PasswordInput id="fp-new-password" placeholder="••••••••" {...field} />
                </FormControl>
                <PasswordStrengthIndicator password={newPasswordValue} />
                <FormMessage className="ml-1 text-red-400" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="fp-confirm-password" className="text-foreground ml-1">
                  Confirm password
                </FormLabel>
                <FormControl>
                  <PasswordInput id="fp-confirm-password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage className="ml-1 text-red-400" />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="default"
            disabled={isSubmitting}
            className="mt-2 h-11 w-full font-bold"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="sr-only">Resetting...</span>
              </>
            ) : (
              'Reset password'
            )}
          </Button>
        </form>
      </Form>
    </>
  )
})
ConfirmStep.displayName = 'ConfirmStep'

// Main ForgotPassword Component
export const ForgotPassword = memo(() => {
  const { step, pendingEmail, isSubmitting, requestReset, confirmReset } = useForgotPassword()

  return (
    <AuthLayout>
      <MobileLogo />
      {step === 'REQUEST' ? (
        <RequestStep isSubmitting={isSubmitting} onRequest={requestReset} />
      ) : (
        <ConfirmStep
          pendingEmail={pendingEmail}
          isSubmitting={isSubmitting}
          onConfirm={confirmReset}
        />
      )}
    </AuthLayout>
  )
})
ForgotPassword.displayName = 'ForgotPassword'
