import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import DataModeBadge from '../admin/DataModeBadge'
import { useSession } from '../../context/SessionContext'
import {
  PLATFORM_NAV,
  getAutoExpandedGroupIds,
  isNavItemActive,
} from '../../platform/platformNav'
import { filterPlatformNav } from '../../platform/platformAccess'
import PlatformSidebarMobileProfile from './PlatformSidebarMobileProfile'
import './PlatformSidebar.css'

const MOBILE_QUERY = '(max-width: 900px)'
const HOVER_COLLAPSE_DELAY_MS = 220

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * Боковое меню Shugyla Platform
 * Desktop: hover-раскрытие + активный раздел всегда открыт
 * Mobile: drawer со всеми разделами сразу раскрытыми
 */
export default function PlatformSidebar({ isOpen = false, onClose, onNavigate }) {
  const { user } = useSession()
  const { pathname } = useLocation()
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const navItems = useMemo(
    () => filterPlatformNav(PLATFORM_NAV, user),
    [user]
  )

  const pinnedGroupIds = useMemo(
    () => new Set(getAutoExpandedGroupIds(pathname, navItems)),
    [pathname, navItems]
  )

  const [hoveredGroupId, setHoveredGroupId] = useState(null)
  const collapseTimerRef = useRef(null)

  useEffect(
    () => () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current)
      }
    },
    []
  )

  useEffect(() => {
    if (isMobile) {
      setHoveredGroupId(null)
    }
  }, [isMobile])

  function isGroupOpen(groupId) {
    if (isMobile && isOpen) return true
    if (pinnedGroupIds.has(groupId)) return true
    if (!isMobile && hoveredGroupId === groupId) return true
    return false
  }

  function handleGroupEnter(groupId) {
    if (isMobile) return
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
    setHoveredGroupId(groupId)
  }

  function handleGroupLeave(groupId) {
    if (isMobile) return
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current)
    }
    collapseTimerRef.current = window.setTimeout(() => {
      setHoveredGroupId((current) => (current === groupId ? null : current))
      collapseTimerRef.current = null
    }, HOVER_COLLAPSE_DELAY_MS)
  }

  function handleNavClick() {
    onNavigate?.()
  }

  return (
    <aside className={`platform-sidebar ${isOpen ? 'platform-sidebar--open' : ''}`}>
      <div className="platform-sidebar__header">
        {isMobile ? (
          <PlatformSidebarMobileProfile user={user} onNavigate={handleNavClick} />
        ) : (
          <div className="platform-sidebar__brand-row">
            <span className="platform-sidebar__logo-icon">S</span>
            <div className="platform-sidebar__brand">
              <span className="platform-sidebar__title">Shugyla Platform</span>
              <span className="platform-sidebar__subtitle">Внутренняя платформа</span>
            </div>
          </div>
        )}
        <button
          type="button"
          className="platform-sidebar__close"
          onClick={onClose}
          aria-label="Закрыть меню"
        >
          ×
        </button>
      </div>

      <nav className="platform-sidebar__nav" aria-label="Разделы платформы">
        {navItems.map((item) =>
          item.children ? (
            <div
              key={item.id}
              className={`platform-sidebar__group${
                isGroupOpen(item.id) ? ' platform-sidebar__group--open' : ''
              }${pinnedGroupIds.has(item.id) ? ' platform-sidebar__group--pinned' : ''}`}
              onMouseEnter={() => handleGroupEnter(item.id)}
              onMouseLeave={() => handleGroupLeave(item.id)}
            >
              <div
                className="platform-sidebar__group-toggle"
                aria-expanded={isGroupOpen(item.id)}
              >
                <span className="platform-sidebar__group-label">
                  {item.icon && (
                    <span className="platform-sidebar__icon" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </span>
                <span className="platform-sidebar__caret" aria-hidden="true" />
              </div>

              <div
                className={`platform-sidebar__subnav${
                  isGroupOpen(item.id) ? ' platform-sidebar__subnav--open' : ''
                }`}
              >
                <div className="platform-sidebar__subnav-inner">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.id}
                      to={child.path}
                      end={child.end}
                      onClick={handleNavClick}
                      className={() =>
                        [
                          'platform-sidebar__link',
                          'platform-sidebar__link--sub',
                          isNavItemActive(pathname, child)
                            ? 'platform-sidebar__link--active'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              onClick={handleNavClick}
              className={({ isActive }) =>
                [
                  'platform-sidebar__link',
                  isActive ? 'platform-sidebar__link--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {item.icon && (
                <span className="platform-sidebar__icon" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div className="platform-sidebar__footer">
        <DataModeBadge />
      </div>
    </aside>
  )
}
