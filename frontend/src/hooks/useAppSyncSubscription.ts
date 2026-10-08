import { useEffect, useState, useRef, useMemo } from 'react'
import { generateClient } from 'aws-amplify/api'

export interface UseAppSyncSubscriptionOptions {
  skip?: boolean
  onError?: (error: Error) => void
  authMode?: 'userPool' | 'iam' | 'apiKey' | 'oidc' | 'lambda'
}

export interface UseAppSyncSubscriptionResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

/**
 * Custom hook for AppSync GraphQL subscriptions
 * Handles subscription setup, cleanup, and error management
 * Automatically parses AWSJSON fields
 */
export function useAppSyncSubscription<T>(
  subscription: string,
  variables?: Record<string, string | number | boolean>,
  options?: UseAppSyncSubscriptionOptions,
): UseAppSyncSubscriptionResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptionRef = useRef<any>(null)

  // Serialize variables to create stable dependency
  const variablesKey = useMemo(() => (variables ? JSON.stringify(variables) : ''), [variables])

  useEffect(() => {
    // Skip if requested - don't trigger any operations or state updates
    if (options?.skip) {
      return
    }

    setError(null)

    let isMounted = true

    const subscribe = async () => {
      try {
        const client = generateClient()
        subscriptionRef.current = client.graphql({
          query: subscription,
          variables: variables || {},
          authMode: options?.authMode ?? 'userPool',
        })

        if (subscriptionRef.current && typeof subscriptionRef.current.subscribe === 'function') {
          subscriptionRef.current.subscribe({
            next: (result: { data: T }) => {
              if (isMounted) {
                try {
                  setData(result.data)
                  setLoading(false)
                } catch (err) {
                  const error = err instanceof Error ? err : new Error(String(err))
                  if (isMounted) {
                    setError(error)
                    options?.onError?.(error)
                  }
                }
              }
            },
            error: (err: unknown) => {
              if (isMounted) {
                const error = err instanceof Error ? err : new Error(JSON.stringify(err))
                setError(error)
                setLoading(false)
                options?.onError?.(error)
              }
            },
            complete: () => {
              if (isMounted) {
                setLoading(false)
              }
            },
          })
          /**
           * Do not tie loading to "first GraphQL payload". Mutations may never arrive
           * (e.g. publish misconfigured); leaving loading true caused infinite skeletons/spinners.
           * Connection is established once subscribe() is registered.
           */
          if (isMounted) {
            setLoading(false)
          }
        }
      } catch (err) {
        if (isMounted) {
          const error = err instanceof Error ? err : new Error(JSON.stringify(err))
          setError(error)
          setLoading(false)
          options?.onError?.(error)
        }
      }
    }

    subscribe()

    return () => {
      isMounted = false
      if (subscriptionRef.current && typeof subscriptionRef.current.unsubscribe === 'function') {
        subscriptionRef.current.unsubscribe()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription, variablesKey, options?.skip, options?.onError])

  return { data, loading, error }
}

/**
 * Helper function to safely parse AWSJSON fields
 * Handles nested JSON strings that come from GraphQL AWSJSON scalar
 */
export function parseAWSJSON<T>(jsonString: string | T): T {
  if (typeof jsonString === 'string') {
    try {
      return JSON.parse(jsonString)
    } catch (err) {
      console.error('Failed to parse AWSJSON:', err, jsonString)
      throw new Error(`Invalid AWSJSON format: ${String(err)}`)
    }
  }
  return jsonString as T
}
