/**
 * Optimized Register Component
 * - Split into confirmation and registration sub-components
 * - Uses custom hooks for auth logic separation
 * - Implements memoization for performance
 * - Better accessibility and type safety
 */

import { memo, useCallback, useMemo } from 'react'
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
import { Mail, User as UserIcon, Loader2 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

// Import custom hooks and components
import { useAuthRegister } from './hooks'
import { PasswordInput, PasswordStrengthIndicator, MobileLogo } from './components'
import type { RegisterFormData, ConfirmFormData } from './types'
import type { User } from '@/store/authStore'

const candidateFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Full name must be at least 2 characters.',
  }),
  email: z.string().email({
    message: 'Please enter a valid email address.',
  }),
  password: z
    .string()
    .min(8, {
      message: 'Password must be at least 8 characters.',
    })
    .regex(/[a-z]/, { message: 'Must contain at least one lowercase letter.' })
    .regex(/[A-Z]/, { message: 'Must contain at least one uppercase letter.' })
    .regex(/[0-9]/, { message: 'Must contain at least one number.' })
    .regex(/[^A-Za-z0-9]/, {
      message: 'Must contain at least one special character.',
    }),
  companyName: z.string().optional(),
  taxCode: z.string().optional(),
})

const recruiterFormSchema = candidateFormSchema.extend({
  companyName: z.string().min(2, {
    message: 'Company name must be at least 2 characters.',
  }),
  taxCode: z.string().optional(),
})

const confirmSchema = z.object({
  code: z.string().length(6, { message: 'Verification code must be 6 digits.' }),
})

// Confirmation Step Component
interface ConfirmationStepProps {
  registeredEmail: string
  isSubmitting: boolean
  onConfirm: (data: ConfirmFormData) => Promise<void>
}

const ConfirmationStep = memo<ConfirmationStepProps>(
  ({ registeredEmail, isSubmitting, onConfirm }) => {
    const confirmForm = useForm<ConfirmFormData>({
      resolver: zodResolver(confirmSchema),
      defaultValues: {
        code: '',
      },
    })

    const handleConfirmSubmit = useCallback(
      (values: ConfirmFormData) => {
        onConfirm(values)
      },
      [onConfirm],
    )

    return (
      <>
        <div className="mb-8 flex flex-col gap-2 text-center md:text-left">
          <h2 className="text-foreground font-display text-3xl font-bold tracking-tight">
            Check your email
          </h2>
          <p className="text-muted-foreground text-sm">
            We've sent a 6-digit verification code to{' '}
            <span className="text-foreground font-medium">{registeredEmail}</span>.
          </p>
        </div>

        <Form {...confirmForm}>
          <form
            onSubmit={confirmForm.handleSubmit(handleConfirmSubmit)}
            className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-5 duration-500"
            noValidate
          >
            <FormField
              control={confirmForm.control}
              name="code"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel htmlFor="code" className="text-foreground ml-1">
                    Verification Code
                  </FormLabel>
                  <FormControl>
                    <Input
                      id="code"
                      placeholder="123456"
                      className="border-input bg-background focus-visible:ring-primary/40 text-center text-lg tracking-widest"
                      maxLength={6}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-invalid={!!confirmForm.formState.errors.code}
                      aria-describedby={
                        confirmForm.formState.errors.code ? 'code-error' : undefined
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage id="code-error" className="ml-1 text-red-400" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="default"
              disabled={isSubmitting}
              className="mt-4 h-11 w-full font-bold"
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Verifying...</span>
                </>
              ) : (
                'Verify Account'
              )}
            </Button>
          </form>
        </Form>
      </>
    )
  },
)
ConfirmationStep.displayName = 'ConfirmationStep'

interface RegisterVariant {
  role: User['role']
  title: string
  subtitle: string
  submitLabel: string
  footerLead: string
  footerCta: string
  footerHref: string
}

interface RegistrationHeaderProps {
  title: string
  subtitle: string
}

// Registration Header Component
const RegistrationHeader = memo<RegistrationHeaderProps>(({ title, subtitle }) => (
  <div className="mb-8 flex flex-col gap-2 text-center md:text-left">
    <h2 className="text-foreground font-display text-3xl font-bold tracking-tight">{title}</h2>
    <p className="text-muted-foreground text-sm">{subtitle}</p>
  </div>
))
RegistrationHeader.displayName = 'RegistrationHeader'

// Registration Footer Component
interface RegistrationFooterProps {
  lead: string
  cta: string
  href: string
}

const RegistrationFooter = memo<RegistrationFooterProps>(({ lead, cta, href }) => (
  <div className="text-muted-foreground mt-6 text-center text-sm">
    {lead}{' '}
    <Link to={href} className="text-primary font-medium transition-colors hover:underline">
      {cta}
    </Link>
  </div>
))
RegistrationFooter.displayName = 'RegistrationFooter'

interface RegistrationPageProps {
  variant: RegisterVariant
}

const RegistrationPage = memo<RegistrationPageProps>(({ variant }) => {
  const { isSubmitting, isConfirming, registeredEmail, onSubmit, onConfirm } = useAuthRegister(
    variant.role,
  )
  const activeSchema = useMemo(
    () => (variant.role === 'recruiter' ? recruiterFormSchema : candidateFormSchema),
    [variant.role],
  )

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(activeSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      companyName: '',
      taxCode: '',
    },
    mode: 'onChange',
  })

  // Watch password field for strength indicator using useWatch (React Compiler compatible)
  const passwordValue = useWatch({
    control: form.control,
    name: 'password',
    defaultValue: '',
  })

  const handleFormSubmit = useCallback(
    (values: RegisterFormData) => {
      onSubmit(values)
    },
    [onSubmit],
  )

  // Render confirmation step if in confirming state
  if (isConfirming) {
    return (
      <AuthLayout>
        <ConfirmationStep
          registeredEmail={registeredEmail}
          isSubmitting={isSubmitting}
          onConfirm={onConfirm}
        />
      </AuthLayout>
    )
  }

  // Render registration form
  return (
    <AuthLayout>
      <MobileLogo />
      <RegistrationHeader title={variant.title} subtitle={variant.subtitle} />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-5 duration-500"
          noValidate
        >
          {/* Full Name Input */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="name" className="text-foreground ml-1">
                  Full Name
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <UserIcon
                      className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <Input
                      id="name"
                      placeholder="Jane Doe"
                      autoComplete="name"
                      className="border-input bg-background focus-visible:ring-primary/40 pl-10"
                      aria-invalid={!!form.formState.errors.name}
                      aria-describedby={form.formState.errors.name ? 'name-error' : undefined}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage id="name-error" className="ml-1 text-red-400" />
              </FormItem>
            )}
          />

          {/* Email Input */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="email" className="text-foreground ml-1">
                  Work Email
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail
                      className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      autoComplete="email"
                      className="border-input bg-background focus-visible:ring-primary/40 pl-10"
                      aria-invalid={!!form.formState.errors.email}
                      aria-describedby={form.formState.errors.email ? 'email-error' : undefined}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage id="email-error" className="ml-1 text-red-400" />
              </FormItem>
            )}
          />

          {/* Password Input with Strength Indicator */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="password" className="text-foreground ml-1">
                  Password
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    id="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-invalid={!!form.formState.errors.password}
                    aria-describedby={
                      form.formState.errors.password || passwordValue.length > 0
                        ? 'password-error password-strength'
                        : undefined
                    }
                    {...field}
                  />
                </FormControl>
                <FormMessage id="password-error" className="ml-1 text-red-400" />

                {/* Password Strength Indicator */}
                <PasswordStrengthIndicator password={passwordValue} className="px-1 pt-1" />
              </FormItem>
            )}
          />

          {variant.role === 'recruiter' ? (
            <>
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel htmlFor="companyName" className="text-foreground ml-1">
                      Company Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="companyName"
                        placeholder="Your company name"
                        autoComplete="organization"
                        className="border-input bg-background focus-visible:ring-primary/40"
                        aria-invalid={!!form.formState.errors.companyName}
                        aria-describedby={
                          form.formState.errors.companyName ? 'company-name-error' : undefined
                        }
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage id="company-name-error" className="ml-1 text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="taxCode"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel htmlFor="taxCode" className="text-foreground ml-1">
                      Tax Code (optional)
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="taxCode"
                        placeholder="Company tax code"
                        className="border-input bg-background focus-visible:ring-primary/40"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage className="ml-1 text-red-400" />
                  </FormItem>
                )}
              />
            </>
          ) : null}

          <Button
            type="submit"
            variant="default"
            disabled={isSubmitting}
            className="mt-4 h-11 w-full font-bold"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                <span className="sr-only">Creating account...</span>
              </>
            ) : (
              variant.submitLabel
            )}
          </Button>

          <RegistrationFooter
            lead={variant.footerLead}
            cta={variant.footerCta}
            href={variant.footerHref}
          />
        </form>
      </Form>
    </AuthLayout>
  )
})
RegistrationPage.displayName = 'RegistrationPage'

const candidateVariant: RegisterVariant = {
  role: 'candidate',
  title: 'Create an account',
  subtitle: 'Enter your details below to request early access.',
  submitLabel: 'Create Account',
  footerLead: 'Already have an account?',
  footerCta: 'Sign In Instead',
  footerHref: '/login',
}

const recruiterVariant: RegisterVariant = {
  role: 'recruiter',
  title: 'Create recruiter account',
  subtitle: 'Sign up with your work email to start recruiter verification.',
  submitLabel: 'Create Recruiter Account',
  footerLead: 'Looking for candidate sign-up?',
  footerCta: 'Register as candidate',
  footerHref: '/register',
}

// Main Register Components
export const Register = memo(() => <RegistrationPage variant={candidateVariant} />)
export const RecruiterRegister = memo(() => <RegistrationPage variant={recruiterVariant} />)

Register.displayName = 'Register'
RecruiterRegister.displayName = 'RecruiterRegister'
