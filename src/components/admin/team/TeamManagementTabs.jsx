import { TEAM_TABS } from './teamManagementUtils'

export default function TeamManagementTabs({
  tabs = TEAM_TABS,
  activeTab,
  onChange,
}) {
  return (
    <div className="team-mgmt__tabs" role="tablist" aria-label="Разделы управления командой">
      {tabs.map((tab) => {
        const selected = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`team-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`team-panel-${tab.id}`}
            aria-disabled={tab.disabled ? 'true' : undefined}
            disabled={Boolean(tab.disabled)}
            className={`team-mgmt__tab${selected ? ' team-mgmt__tab--active' : ''}${tab.disabled ? ' team-mgmt__tab--disabled' : ''}`}
            onClick={() => {
              if (!tab.disabled) onChange(tab.id)
            }}
            title={
              tab.disabled
                ? 'Недостаточно прав для просмотра организационной структуры'
                : undefined
            }
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
