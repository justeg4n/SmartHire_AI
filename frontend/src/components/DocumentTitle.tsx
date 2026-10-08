import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getTitleForPathname } from '@/lib/documentTitle'

/** Sets `document.title` from the current pathname (sync with router). */
export function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = getTitleForPathname(pathname)
  }, [pathname])

  return null
}
