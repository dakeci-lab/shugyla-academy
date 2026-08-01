import { TEAM_TABS } from './teamManagementUtils'

export default function TeamManagementTabs({ activeTab, onChange }) {
  return (
    <div className="team-mgmt__tabs" role="tablist" aria-label="Разделы управления командой">
      {TEAM_TABS.map((tab) => {
        const selected = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`team-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`team-panel-${tab.id}`}
            className={`team-mgmt__tab${selected ? ' team-mgmt__tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
