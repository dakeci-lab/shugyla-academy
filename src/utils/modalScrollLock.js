const MOBILE_QUERY = '(max-width: 900px)'

let lockCount = 0
/** @type {null | { scrollY: number, body: Record<string, string>, html: Record<string, string> }} */
let savedState = null

function readInlineStyles(element) {
  return {
    overflow: element.style.overflow,
    position: element.style.position,
    top: element.style.top,
    left: element.style.left,
    right: element.style.right,
    width: element.style.width,
    paddingRight: element.style.paddingRight,
  }
}

function getScrollbarWidth() {
  if (typeof window === 'undefined') return 0
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_QUERY).matches
}

/** Блокирует прокрутку страницы под модальным окном */
export function lockModalScroll() {
  if (typeof document === 'undefined') return

  if (lockCount === 0) {
    const scrollY = window.scrollY || window.pageYOffset || 0
    const body = document.body
    const html = document.documentElement

    savedState = {
      scrollY,
      body: readInlineStyles(body),
      html: readInlineStyles(html),
    }

    if (isMobileViewport()) {
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
      html.style.overflow = 'hidden'
    } else {
      body.style.overflow = 'hidden'
      const scrollbarWidth = getScrollbarWidth()
      if (scrollbarWidth > 0) {
        const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0
        body.style.paddingRight = `${currentPadding + scrollbarWidth}px`
      }
    }
  }

  lockCount += 1
}

/** Снимает блокировку прокрутки, если нет других активных модалок */
export function unlockModalScroll() {
  if (lockCount <= 0) return

  lockCount -= 1
  if (lockCount > 0 || !savedState) return

  const { scrollY, body, html } = savedState
  const bodyEl = document.body
  const htmlEl = document.documentElement

  bodyEl.style.overflow = body.overflow
  bodyEl.style.position = body.position
  bodyEl.style.top = body.top
  bodyEl.style.left = body.left
  bodyEl.style.right = body.right
  bodyEl.style.width = body.width
  bodyEl.style.paddingRight = body.paddingRight

  htmlEl.style.overflow = html.overflow
  htmlEl.style.paddingRight = html.paddingRight

  savedState = null
  window.scrollTo(0, scrollY)
}

/** Сброс счётчика (только для тестов) */
export function resetModalScrollLockForTests() {
  lockCount = 0
  savedState = null
}
