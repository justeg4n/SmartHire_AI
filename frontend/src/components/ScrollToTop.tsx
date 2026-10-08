import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Resets window scroll on client-side navigation (SPA default keeps prior scroll). */
export function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, search])

  return null
}
