import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import DataModeBadge from '../admin/DataModeBadge'
import { useSession } from '../../context/SessionContext'
import {
  PLATFORM_NAV,
  getAutoExpandedGroupIds,
} from '../../platform/platformNav'
import { filterPlatformNav } from '../../platform/platformAccess'
import './PlatformSidebar.css'

/**
 * Боковое меню Shugyla Platform
 * Desktop: постоянный sidebar слева
 * Mobile: drawer, открывается бургером
 */
export default function PlatformSidebar({ isOpen = false, onClose, onNavigate }) {
  const { user } = useSession()
  const { pathname } = useLocation()
  const navItems = useMemo(
    () => filterPlatformNav(PLATFORM_NAV, user),
    [user]
  )
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())

  useEffect(() => {
    const autoIds = getAutoExpandedGroupIds(pathname, navItems)
    if (autoIds.length === 0) return
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      autoIds.forEach((id) => next.add(id))
      return next
    })
  }, [pathname, navItems])

  function toggleGroup(groupId) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function handleNavClick() {
    onNavigate?.()
  }

  return (
    <aside className={`platform-sidebar ${isOpen ? 'platform-sidebar--open' : ''}`}>
      <div className="platform-sidebar__header">
        <div className="platform-sidebar__brand-row">
          <span className="platform-sidebar__logo-icon">S</span>
          <div className="platform-sidebar__brand">
            <span className="platform-sidebar__title">Shugyla Platform</span>
            <span className="platform-sidebar__subtitle">Внутренняя платформа</span>
          </div>
        </div>
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
            <div key={item.id} className="platform-sidebar__group">
              <button
                type="button"
                className={`platform-sidebar__group-toggle ${
                  expandedGroups.has(item.id) ? 'platform-sidebar__group-toggle--open' : ''
                }`}
                onClick={() => toggleGroup(item.id)}
                aria-expanded={expandedGroups.has(item.id)}
              >
                <span>{item.label}</span>
                <span className="platform-sidebar__caret" aria-hidden="true" />
              </button>
              {expandedGroups.has(item.id) && (
                <div className="platform-sidebar__subnav">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.id}
                      to={child.path}
                      end={child.end}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        [
                          'platform-sidebar__link',
                          'platform-sidebar__link--sub',
                          isActive ? 'platform-sidebar__link--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
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
