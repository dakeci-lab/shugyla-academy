import { useEffect, useMemo, useState } from 'react'
import { ChevronDownIcon } from '../../icons/PlatformIcons'
import {
  summarizeEmployeeOrganization,
  UNASSIGNED_GROUP_ID,
} from '../../../utils/employeeOrganizationStructure'
import EmployeeListTable from './EmployeeListTable'
import './EmployeeOrganizationList.css'

function employeeCountLabel(count) {
  const n = Number(count) || 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} сотрудник`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} сотрудника`
  return `${n} сотрудников`
}

function positionCountLabel(count) {
  const n = Number(count) || 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} должность`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} должности`
  return `${n} должностей`
}

function groupPanelId(groupId) {
  return `employee-org-group-${String(groupId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

/**
 * Grouped employees list: Group → Position → existing table/cards.
 */
export default function EmployeeOrganizationList({
  groups = [],
  rowOffset = 0,
  getRoleLabelForEmployee,
  canEdit = false,
  onEdit,
  onOpen,
  emptyMessage,
  searchActive = false,
  loading = false,
}) {
  const summary = useMemo(() => summarizeEmployeeOrganization(groups), [groups])
  const [collapsedByGroup, setCollapsedByGroup] = useState({})
  const [collapseBaseline, setCollapseBaseline] = useState({})

  useEffect(() => {
    if (!searchActive) return
    setCollapsedByGroup((current) => {
      const next = { ...current }
      for (const group of groups) {
        next[group.groupId] = false
      }
      return next
    })
  }, [searchActive, groups])

  useEffect(() => {
    if (searchActive) return
    setCollapsedByGroup((current) => {
      const next = { ...current }
      for (const group of groups) {
        if (next[group.groupId] === undefined) {
          next[group.groupId] = collapseBaseline[group.groupId] ?? false
        }
      }
      return next
    })
  }, [searchActive, groups, collapseBaseline])

  function isExpanded(groupId) {
    if (collapsedByGroup[groupId] === undefined) return true
    return collapsedByGroup[groupId] !== true
  }

  function toggleGroup(groupId) {
    setCollapsedByGroup((current) => {
      const currentlyCollapsed = current[groupId] === true
      const nextCollapsed = !currentlyCollapsed ? true : false
      // When user toggles outside search, remember baseline for restore after search clear.
      if (!searchActive) {
        setCollapseBaseline((baseline) => ({
          ...baseline,
          [groupId]: nextCollapsed,
        }))
      }
      return { ...current, [groupId]: nextCollapsed }
    })
  }

  if (loading) {
    return (
      <div className="employee-org" aria-busy="true" aria-live="polite">
        <p className="employee-org__summary employee-org__summary--skeleton">Загрузка структуры…</p>
        {[0, 1, 2].map((index) => (
          <section key={index} className="employee-org__group employee-org__group--skeleton">
            <div className="employee-org__group-header employee-org__skeleton-block" />
            <div className="employee-org__position-header employee-org__skeleton-block" />
            <div className="employee-org__skeleton-cards">
              <div className="employee-org__skeleton-block employee-org__skeleton-card" />
              <div className="employee-org__skeleton-block employee-org__skeleton-card" />
            </div>
          </section>
        ))}
      </div>
    )
  }

  if (!groups.length) {
    return (
      <EmployeeListTable
        employees={[]}
        rowOffset={rowOffset}
        getRoleLabelForEmployee={getRoleLabelForEmployee}
        canEdit={canEdit}
        onEdit={onEdit}
        onOpen={onOpen}
        emptyMessage={emptyMessage}
      />
    )
  }

  let runningIndex = rowOffset
  let headerRendered = false

  return (
    <div className="employee-org">
      <p className="employee-org__summary" role="status">
        Показано: {summary.employeeCount} · Групп: {summary.groupCount} · Должностей:{' '}
        {summary.positionCount}
      </p>

      {groups.map((group) => {
        const expanded = isExpanded(group.groupId)
        const panelId = groupPanelId(group.groupId)
        const archivedGroup = group.isGroupActive === false
        const unassigned = group.isUnassignedGroup || group.groupId === UNASSIGNED_GROUP_ID

        return (
          <section
            key={group.groupId}
            className={`employee-org__group${unassigned ? ' employee-org__group--unassigned' : ''}${
              archivedGroup ? ' employee-org__group--archived' : ''
            }`}
            aria-labelledby={`${panelId}-title`}
          >
            <h2 className="employee-org__group-heading" id={`${panelId}-title`}>
              <button
                type="button"
                className="employee-org__group-toggle"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.groupId)}
              >
                <span
                  className={`employee-org__chevron${expanded ? ' employee-org__chevron--open' : ''}`}
                  aria-hidden="true"
                >
                  <ChevronDownIcon size={18} />
                </span>
                <span className="employee-org__group-title-wrap">
                  <span className="employee-org__group-name">{group.groupName}</span>
                  {archivedGroup ? (
                    <span className="employee-org__badge">Архивная группа</span>
                  ) : null}
                  {unassigned ? (
                    <span className="employee-org__badge employee-org__badge--warn">
                      Требует назначения
                    </span>
                  ) : null}
                </span>
                <span className="employee-org__group-meta">
                  {employeeCountLabel(group.employeeCount)} ·{' '}
                  {positionCountLabel(group.positionCount)}
                </span>
              </button>
            </h2>

            <div
              id={panelId}
              className="employee-org__group-body"
              hidden={!expanded}
              role="region"
              aria-label={`Группа: ${group.groupName}`}
            >
              {group.positions.map((position) => {
                const startIndex = runningIndex
                runningIndex += position.employeeCount
                const archivedPosition = position.isPositionActive === false
                const showHeader = expanded && !headerRendered
                if (showHeader) headerRendered = true

                return (
                  <div
                    key={`${group.groupId}:${position.positionId}`}
                    className="employee-org__position"
                  >
                    <h3 className="employee-org__position-header">
                      <span className="employee-org__position-name">{position.positionName}</span>
                      {archivedPosition ? (
                        <span className="employee-org__badge">Архивная должность</span>
                      ) : null}
                      <span className="employee-org__position-count">
                        {employeeCountLabel(position.employeeCount)}
                      </span>
                    </h3>
                    <p className="visually-hidden">
                      Группа: {group.groupName}. Должность: {position.positionName}.{' '}
                      {employeeCountLabel(position.employeeCount)}.
                    </p>
                    <EmployeeListTable
                      employees={position.employees}
                      rowOffset={startIndex}
                      getRoleLabelForEmployee={getRoleLabelForEmployee}
                      canEdit={canEdit}
                      onEdit={onEdit}
                      onOpen={onOpen}
                      emptyMessage={emptyMessage}
                      showHeader={showHeader}
                      compactSection
                    />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
