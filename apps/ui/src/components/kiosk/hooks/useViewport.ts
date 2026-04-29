import { useState, useEffect } from 'react'

export function useViewport() {
  const [isSidebarMode, setIsSidebarMode] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024,
  )

  useEffect(() => {
    const handleResize = () => setIsSidebarMode(window.innerWidth >= 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return { isSidebarMode }
}
