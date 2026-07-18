import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useSession } from '../../context/SessionContext'
import { PLATFORM_NAV, isNavItemActive, isPathInGroup } from '../../platform/platformNav'
import { filterPlatformNav } from '../../platform/platformAccess'
import './PlatformDesktopNav.css'

const CLOSE_DELAY_MS = 160
const MORE_ID = '__more__'

function CaretIcon() {
  return (
    <svg className="platform-desktop-nav__caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M2.2 3.6 L5 6.4 L7.8 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NavLeafLink({ item, onNavigate, className = '' }) {
  const { pathname } = useLocation()
  const active = isNavItemActive(pathname, item)

  return (
    <NavLink
      to={item.path}
      end={Boolean(item.end)}
      className={({ isActive }) =>
        [
          className,
          'platform-desktop-nav__link',
          active || isActive ? 'platform-desktop-nav__link--active' : '',
        ]
          .filter(Boolean)
          .join(' ')
      }
      onClick={onNavigate}
    >
      {item.label}
    </NavLink>
  )
}

function DropdownPanel({ children, labelledBy }) {
  return (
    <div className="platform-desktop-nav__dropdown" role="menu" aria-labelledby={labelledBy}>
      {children}
    </div>
  )
}

function GroupDropdownLinks({ group, onNavigate }) {
  return group.children.map((child) => (
    <NavLeafLink
      key={child.id}
      item={child}
      onNavigate={onNavigate}
      className="platform-desktop-nav__dropdown-link"
    />
  ))
}

/**
 * Desktop (≥901px) horizontal platform navigation with group dropdowns
 * and an overflow “Ещё” menu when space is tight.
 */
export default function PlatformDesktopNav() {
  const { user } = useSession()
  const { pathname } = useLocation()
  const navItems = useMemo(() => filterPlatformNav(PLATFORM_NAV, user), [user])

  const rootRef = useRef(null)
  const measureRef = useRef(null)
  const closeTimerRef = useRef(null)
  const [openId, setOpenId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(navItems.length)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setOpenId(null)
      closeTimerRef.current = null
    }, CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  const openMenu = useCallback(
    (id) => {
      clearCloseTimer()
      setOpenId(id)
    },
    [clearCloseTimer]
  )

  const closeMenu = useCallback(() => {
    clearCloseTimer()
    setOpenId(null)
  }, [clearCloseTimer])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  useEffect(() => {
    closeMenu()
  }, [pathname, closeMenu])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        closeMenu()
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') closeMenu()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [closeMenu])

  const recomputeOverflow = useCallback(() => {
    const row = rootRef.current
    const measure = measureRef.current
    if (!row || !measure) return

    const available = row.clientWidth
    const itemNodes = [...measure.querySelectorAll('[data-measure-item]')]
    const moreNode = measure.querySelector('[data-measure-more]')
    if (itemNodes.length === 0) {
      setVisibleCount(0)
      return
    }

    const widths = itemNodes.map((node) => node.getBoundingClientRect().width)
    const moreWidth = moreNode ? moreNode.getBoundingClientRect().width : 48
    const gap = 4
    const totalWithGaps = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0)

    if (totalWithGaps <= available) {
      setVisibleCount(widths.length)
      return
    }

    let used = moreWidth
    let count = 0
    for (let i = 0; i < widths.length; i += 1) {
      const next = used + (count > 0 ? gap : gap) + widths[i]
      if (next > available) break
      used = next
      count += 1
    }

    setVisibleCount(Math.max(0, count))
  }, [])

  useLayoutEffect(() => {
    setVisibleCount(navItems.length)
  }, [navItems])

  useLayoutEffect(() => {
    recomputeOverflow()
    const row = rootRef.current
    if (!row || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => {
      recomputeOverflow()
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [navItems, recomputeOverflow])

  const visibleItems = navItems.slice(0, visibleCount)
  const overflowItems = navItems.slice(visibleCount)
  const moreActive = overflowItems.some((item) =>
    item.children?.length ? isPathInGroup(pathname, item) : isNavItemActive(pathname, item)
  )

  function renderTopItem(item) {
    const isGroup = Boolean(item.children?.length)
    const groupActive = isGroup && isPathInGroup(pathname, item)
    const isOpen = openId === item.id

    if (!isGroup) {
      return (
        <div key={item.id} className="platform-desktop-nav__item">
          <NavLeafLink item={item} onNavigate={closeMenu} className="platform-desktop-nav__top-link" />
        </div>
      )
    }

    return (
      <div
        key={item.id}
        className={`platform-desktop-nav__item platform-desktop-nav__item--group${
          groupActive ? ' platform-desktop-nav__item--active' : ''
        }${isOpen ? ' platform-desktop-nav__item--open' : ''}`}
        onMouseEnter={() => openMenu(item.id)}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          id={`platform-nav-trigger-${item.id}`}
          className={`platform-desktop-nav__trigger${
            groupActive ? ' platform-desktop-nav__trigger--active' : ''
          }`}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => (isOpen ? closeMenu() : openMenu(item.id))}
          onFocus={() => openMenu(item.id)}
        >
          <span>{item.label}</span>
          <CaretIcon />
        </button>
        {isOpen && (
          <DropdownPanel labelledBy={`platform-nav-trigger-${item.id}`}>
            <GroupDropdownLinks group={item} onNavigate={closeMenu} />
          </DropdownPanel>
        )}
      </div>
    )
  }

  return (
    <nav className="platform-desktop-nav" aria-label="Разделы платформы" ref={rootRef}>
      <div className="platform-desktop-nav__measure" aria-hidden="true" ref={measureRef}>
        {navItems.map((item) => (
          <span key={item.id} data-measure-item className="platform-desktop-nav__measure-item">
            {item.label}
            {item.children?.length ? ' ▾' : ''}
          </span>
        ))}
        <span data-measure-more className="platform-desktop-nav__measure-item">
          Ещё ▾
        </span>
      </div>

      <div className="platform-desktop-nav__row">
        {visibleItems.map(renderTopItem)}

        {overflowItems.length > 0 && (
          <div
            className={`platform-desktop-nav__item platform-desktop-nav__item--group${
              moreActive ? ' platform-desktop-nav__item--active' : ''
            }${openId === MORE_ID ? ' platform-desktop-nav__item--open' : ''}`}
            onMouseEnter={() => openMenu(MORE_ID)}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              id="platform-nav-trigger-more"
              className={`platform-desktop-nav__trigger${
                moreActive ? ' platform-desktop-nav__trigger--active' : ''
              }`}
              aria-expanded={openId === MORE_ID}
              aria-haspopup="menu"
              onClick={() => (openId === MORE_ID ? closeMenu() : openMenu(MORE_ID))}
              onFocus={() => openMenu(MORE_ID)}
            >
              <span>Ещё</span>
              <CaretIcon />
            </button>
            {openId === MORE_ID && (
              <DropdownPanel labelledBy="platform-nav-trigger-more">
                {overflowItems.map((item) => {
                  if (!item.children?.length) {
                    return (
                      <NavLeafLink
                        key={item.id}
                        item={item}
                        onNavigate={closeMenu}
                        className="platform-desktop-nav__dropdown-link"
                      />
                    )
                  }

                  return (
                    <div key={item.id} className="platform-desktop-nav__overflow-group">
                      <p className="platform-desktop-nav__overflow-label">{item.label}</p>
                      <GroupDropdownLinks group={item} onNavigate={closeMenu} />
                    </div>
                  )
                })}
              </DropdownPanel>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

export function PlatformDesktopLogo() {
  return (
    <Link to="/platform" className="platform-layout__logo" aria-label="Главная">
      <span className="platform-layout__logo-mark" aria-hidden="true">
        S
      </span>
    </Link>
  )
}
