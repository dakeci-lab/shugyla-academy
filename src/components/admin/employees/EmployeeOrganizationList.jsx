import { useEffect, useState } from 'react'
import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import StatusBadge from '../StatusBadge'
import IconActionButton from '../IconActionButton'
import EmployeeAvatar from '../../EmployeeAvatar'
import { ChevronDownIcon, PencilIcon } from '../../icons/PlatformIcons'
import {
  getEmploymentStatusLabel,
  getEmploymentStatusBadgeType,
} from '../../../utils/employeeData'
import { UNASSIGNED_GROUP_ID } from '../../../utils/employeeOrganizationStructure'
import '../IconActionButton.css'
import './EmployeeOrganizationList.css'

function groupPanelId(groupId) {
  return `employee-org-group-${String(groupId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function displayValue(value) {
  if (value == null || value === '') return '—'
  return value
}

function handleCardKeyDown(event, onOpen, employee) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen(employee)
  }
}

/**
 * Grouped employees list with unified column layout per group.
 */
export default function EmployeeOrganizationList({
  groups = [],
  rowOffset = 0,
  getRoleLabelForEmployee,
  canEdit = false,
  onEdit,
  onOpen,
  emptyCopy = null,
  onClearSearch,
  searchActive = false,
  loading = false,
}) {
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
      const nextCollapsed = !currentlyCollapsed
      if (!searchActive) {
        setCollapseBaseline((baseline) => ({
          ...baseline,
          [groupId]: nextCollapsed,
        }))
      }
      return { ...current, [groupId]: nextCollapsed }
    })
  }

  function openProfile(employee, event) {
    event?.stopPropagation?.()
    onOpen?.(employee)
  }

  function openEdit(employee, event) {
    event?.stopPropagation?.()
    onEdit?.(employee)
  }

  if (loading && groups.length === 0) {
    return (
      <div className="employee-org" aria-busy="true" aria-live="polite">
        {[0, 1, 2].map((index) => (
          <section key={index} className="employee-org__group employee-org__group--skeleton">
            <div className="employee-org__skeleton-block employee-org__skeleton-group" />
            <div className="employee-org__skeleton-block employee-org__skeleton-position" />
            <div className="employee-org__skeleton-block employee-org__skeleton-row" />
            <div className="employee-org__skeleton-block employee-org__skeleton-row" />
          </section>
        ))}
      </div>
    )
  }

  if (!groups.length) {
    return (
      <div className="employee-org-empty" role="status">
        <div className="employee-org-empty__icon" aria-hidden="true">
          ⌕
        </div>
        <h3 className="employee-org-empty__title">
          {emptyCopy?.title || 'Сотрудники не найдены'}
        </h3>
        <p className="employee-org-empty__description">
          {emptyCopy?.description || 'По выбранным условиям сотрудники не найдены.'}
        </p>
        {emptyCopy?.showClearSearch && typeof onClearSearch === 'function' ? (
          <button type="button" className="btn btn--outline" onClick={onClearSearch}>
            Очистить поиск
          </button>
        ) : null}
      </div>
    )
  }

  let runningIndex = rowOffset

  return (
    <div className={`employee-org${loading ? ' employee-org--loading' : ''}`}>
      {loading ? (
        <p className="employee-org__loading-hint" role="status">
          Обновление списка…
        </p>
      ) : null}

      {groups.map((group) => {
        const expanded = isExpanded(group.groupId)
        const panelId = groupPanelId(group.groupId)
        const archivedGroup = group.isGroupActive === false
        const unassigned = group.isUnassignedGroup || group.groupId === UNASSIGNED_GROUP_ID
        const groupEmployeeCount = group.employeeCount || 0

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
                aria-label={`Группа: ${group.groupName}. ${groupEmployeeCount} сотрудников.`}
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
              </button>
            </h2>

            <div
              id={panelId}
              className="employee-org__group-body"
              hidden={!expanded}
              role="region"
              aria-label={`Группа: ${group.groupName}`}
            >
              <div className="employee-org__desktop">
                <table className="employee-org-table">
                  <colgroup>
                    <col className="employee-org-table__col-num" />
                    <col className="employee-org-table__col-name" />
                    <col className="employee-org-table__col-login" />
                    <col className="employee-org-table__col-role" />
                    <col className="employee-org-table__col-status" />
                    <col className="employee-org-table__col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">№</th>
                      <th scope="col">Сотрудник</th>
                      <th scope="col">Логин</th>
                      <th scope="col">Роль</th>
                      <th scope="col">Статус</th>
                      <th scope="col" className="employee-org-table__actions-head">
                        <span className="visually-hidden">Действия</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.positions.map((position) => {
                      const archivedPosition = position.isPositionActive === false
                      return (
                        <FragmentPosition
                          key={`${group.groupId}:${position.positionId}`}
                          groupName={group.groupName}
                          position={position}
                          archivedPosition={archivedPosition}
                          startIndex={(() => {
                            const start = runningIndex
                            runningIndex += position.employeeCount
                            return start
                          })()}
                          getRoleLabelForEmployee={getRoleLabelForEmployee}
                          canEdit={canEdit}
                          onEdit={onEdit}
                          onOpen={onOpen}
                          openProfile={openProfile}
                          openEdit={openEdit}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )
      })}

      <MobileCards
        groups={groups}
        rowOffset={rowOffset}
        isExpanded={isExpanded}
        getRoleLabelForEmployee={getRoleLabelForEmployee}
        canEdit={canEdit}
        onEdit={onEdit}
        onOpen={onOpen}
        openEdit={openEdit}
      />
    </div>
  )
}

function FragmentPosition({
  groupName,
  position,
  archivedPosition,
  startIndex,
  getRoleLabelForEmployee,
  canEdit,
  onEdit,
  onOpen,
  openProfile,
  openEdit,
}) {
  return (
    <>
      <tr className="employee-org-table__position-row">
        <td colSpan={6}>
          <div className="employee-org-table__position-cell">
            <span className="employee-org-table__position-name">{position.positionName}</span>
            {archivedPosition ? (
              <span className="employee-org__badge">Архивная должность</span>
            ) : null}
          </div>
          <span className="visually-hidden">
            Группа: {groupName}. Должность: {position.positionName}.{' '}
            {position.employeeCount} сотрудников.
          </span>
        </td>
      </tr>
      {position.employees.map((employee, index) => (
        <tr
          key={employee.id}
          className={`employee-org-table__row${onOpen ? ' employee-org-table__row--clickable' : ''}`}
          onClick={onOpen ? () => onOpen(employee) : undefined}
        >
          <td className="employee-org-table__num">{startIndex + index + 1}</td>
          <td className="employee-org-table__name">
            {onOpen ? (
              <button
                type="button"
                className="employee-name-link"
                onClick={(event) => openProfile(employee, event)}
              >
                <span className="employee-table-cell">
                  <EmployeeAvatar
                    name={employee.name}
                    avatarUrl={employee.avatarUrl}
                    size="sm"
                  />
                  <strong title={employee.name}>{employee.name}</strong>
                </span>
              </button>
            ) : (
              <span className="employee-table-cell">
                <EmployeeAvatar
                  name={employee.name}
                  avatarUrl={employee.avatarUrl}
                  size="sm"
                />
                <strong title={employee.name}>{employee.name}</strong>
              </span>
            )}
          </td>
          <td>
            <code className="admin-code employee-org-table__login" title={employee.login || ''}>
              {displayValue(employee.login)}
            </code>
          </td>
          <td>
            <span
              className="employee-org-table__role"
              title={displayValue(getRoleLabelForEmployee(employee))}
            >
              {displayValue(getRoleLabelForEmployee(employee))}
            </span>
          </td>
          <td>
            <StatusBadge
              label={getEmploymentStatusLabel(employee.employmentStatus)}
              type={getEmploymentStatusBadgeType(employee.employmentStatus)}
            />
          </td>
          <td
            className="employee-org-table__actions"
            onClick={(event) => event.stopPropagation()}
          >
            <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
              {canEdit && onEdit ? (
                <IconActionButton
                  label="Редактировать сотрудника"
                  variant="primary"
                  onClick={(event) => openEdit(employee, event)}
                >
                  <PencilIcon />
                </IconActionButton>
              ) : null}
            </Can>
          </td>
        </tr>
      ))}
    </>
  )
}

function MobileCards({
  groups,
  rowOffset,
  isExpanded,
  getRoleLabelForEmployee,
  canEdit,
  onEdit,
  onOpen,
  openEdit,
}) {
  let runningIndex = rowOffset
  return (
    <div className="employee-org__mobile">
      {groups.map((group) => {
        const expanded = isExpanded(group.groupId)
        const block = (
          <div key={`mobile-${group.groupId}`} className="employee-org__mobile-group" hidden={!expanded}>
            {group.positions.map((position) => {
              const archivedPosition = position.isPositionActive === false
              const start = runningIndex
              runningIndex += position.employeeCount
              const cards = position.employees.map((employee, index) => {
                const num = start + index + 1
                const interactive = Boolean(onOpen)
                return (
                  <li
                    key={employee.id}
                    className={`employee-org-card${interactive ? ' employee-org-card--clickable' : ''}`}
                    {...(interactive
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          'aria-label': `Открыть карточку сотрудника ${employee.name}`,
                          onClick: () => onOpen(employee),
                          onKeyDown: (event) => handleCardKeyDown(event, onOpen, employee),
                        }
                      : {})}
                  >
                    <div className="employee-org-card__head">
                      <div className="employee-org-card__identity">
                        <span className="employee-org-card__num">{num}</span>
                        <EmployeeAvatar
                          name={employee.name}
                          avatarUrl={employee.avatarUrl}
                          size="sm"
                        />
                        <div className="employee-org-card__titles">
                          <h3 className="employee-org-card__name">{employee.name}</h3>
                          <p className="employee-org-card__position">{position.positionName}</p>
                        </div>
                      </div>
                      <div className="employee-org-card__actions">
                        <StatusBadge
                          label={getEmploymentStatusLabel(employee.employmentStatus)}
                          type={getEmploymentStatusBadgeType(employee.employmentStatus)}
                        />
                        <Can permission={PERMISSION_CODES.EMPLOYEES_EDIT}>
                          {canEdit && onEdit ? (
                            <IconActionButton
                              label="Редактировать сотрудника"
                              variant="primary"
                              onClick={(event) => openEdit(employee, event)}
                            >
                              <PencilIcon />
                            </IconActionButton>
                          ) : null}
                        </Can>
                      </div>
                    </div>
                    <div className="employee-org-card__meta">
                      <p>
                        <span className="employee-org-card__meta-label">Роль:</span>{' '}
                        {displayValue(getRoleLabelForEmployee(employee))}
                      </p>
                      <p>
                        <span className="employee-org-card__meta-label">Логин:</span>{' '}
                        {displayValue(employee.login)}
                      </p>
                    </div>
                  </li>
                )
              })
              return (
                <div key={`mobile-pos-${group.groupId}:${position.positionId}`}>
                  <div className="employee-org__position-label">
                    <span>{position.positionName}</span>
                    {archivedPosition ? (
                      <span className="employee-org__badge">Архивная должность</span>
                    ) : null}
                  </div>
                  <ul className="employee-org__card-list">{cards}</ul>
                </div>
              )
            })}
          </div>
        )
        return block
      })}
    </div>
  )
}
