import { useEffect } from 'react'
import { lockModalScroll, unlockModalScroll } from '../utils/modalScrollLock'

/** Блокирует прокрутку body с учётом вложенных модалок */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined

    lockModalScroll()
    return () => {
      unlockModalScroll()
    }
  }, [active])
}
