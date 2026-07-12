import { useRef, useState, useEffect } from 'react'
import { FilterIcon } from '../icons/PlatformIcons'
import CandidateSearch from './CandidateSearch'
import CandidateFiltersPopover from './CandidateFiltersPopover'
import CandidateFiltersSheet from './CandidateFiltersSheet'
import CandidateFilterChips from './CandidateFilterChips'
import {
  AGE_SORT,
  countActiveCandidateFilters,
  createDefaultCandidateFilters,
  formatCandidatesCount,
  hasActiveCandidateFilters,
} from '../../utils/candidateListUtils'
import './CandidatesList.css'

const MOBILE_BREAKPOINT = 768

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false
  )

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}

/** Панель поиска и фильтров кандидатов */
export default function CandidatesToolbar({
  searchInput,
  onSearchInputChange,
  onSearchClear,
  appliedFilters,
  draftFilters,
  onDraftChange,
  onApplyFilters,
  onResetFilters,
  onRemoveChip,
  vacancies,
  resultCount,
  totalCount,
}) {
  const filterButtonRef = useRef(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const isMobile = useIsMobileViewport()

  const activeFilterCount = countActiveCandidateFilters(appliedFilters)
  const filtersActive = hasActiveCandidateFilters(appliedFilters)
  const showReset =
    searchInput.trim() ||
    filtersActive ||
    appliedFilters.ageSort !== AGE_SORT.DEFAULT

  function toggleFilters() {
    if (!filterOpen) {
      onDraftChange({ ...appliedFilters })
    }
    setFilterOpen((open) => !open)
  }

  function applyFilters() {
    onApplyFilters()
    setFilterOpen(false)
  }

  function resetAll() {
    onResetFilters(createDefaultCandidateFilters())
    onSearchClear()
    setFilterOpen(false)
  }

  const countLabel =
    searchInput.trim() || filtersActive || appliedFilters.ageSort !== AGE_SORT.DEFAULT
      ? `Найдено: ${resultCount}`
      : formatCandidatesCount(totalCount)

  return (
    <div className="candidates-page">
      <div className="candidates-toolbar">
        <CandidateSearch
          value={searchInput}
          onChange={onSearchInputChange}
          onClear={onSearchClear}
        />

        <div className="candidates-toolbar__filters-wrap">
          <button
            ref={filterButtonRef}
            type="button"
            className={`candidates-toolbar__filter-btn${
              filtersActive ? ' candidates-toolbar__filter-btn--active' : ''
            }`}
            onClick={toggleFilters}
            aria-expanded={filterOpen}
            aria-label={
              activeFilterCount > 0 ? `Фильтры, активно ${activeFilterCount}` : 'Фильтры'
            }
          >
            <FilterIcon size={18} />
            <span className="candidates-toolbar__filter-label">Фильтры</span>
            {activeFilterCount > 0 && (
              <span className="candidates-toolbar__filter-count">{activeFilterCount}</span>
            )}
          </button>

          {!isMobile && (
            <CandidateFiltersPopover
              open={filterOpen}
              draft={draftFilters}
              vacancies={vacancies}
              onChange={onDraftChange}
              onApply={applyFilters}
              onReset={onResetFilters}
              onClose={() => setFilterOpen(false)}
              anchorRef={filterButtonRef}
            />
          )}
        </div>
      </div>

      <div className="candidates-toolbar__meta">
        <p className="candidates-toolbar__count">{countLabel}</p>
        {showReset && (
          <button
            type="button"
            className="btn btn--ghost btn--sm candidates-toolbar__reset"
            onClick={resetAll}
          >
            Сбросить
          </button>
        )}
      </div>

      <CandidateFilterChips filters={appliedFilters} vacancies={vacancies} onChange={onRemoveChip} />

      {isMobile && (
        <CandidateFiltersSheet
          open={filterOpen}
          draft={draftFilters}
          vacancies={vacancies}
          onChange={onDraftChange}
          onApply={applyFilters}
          onReset={onResetFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  )
}
