import { useRef, useState, useEffect } from 'react'
import PlatformSearchToolbar, {
  PlatformFilterButton,
  PlatformToolbarActionWrap,
} from '../platform/PlatformSearchToolbar'
import CandidateFiltersPopover from './CandidateFiltersPopover'
import CandidateFiltersSheet from './CandidateFiltersSheet'
import CandidateFilterChips from './CandidateFilterChips'
import CandidateStatusSegmentedControl from './CandidateStatusSegmentedControl'
import {
  AGE_SORT,
  countActiveCandidateFilters,
  createDefaultCandidateFilters,
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
  draftResultCount,
  statusValue,
  onStatusChange,
  statusCounts,
}) {
  const filterButtonRef = useRef(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const isMobile = useIsMobileViewport()

  useEffect(() => {
    // При переходе на desktop закрываем мобильный sheet/popover
    setFilterOpen(false)
  }, [isMobile])

  const activeFilterCount = countActiveCandidateFilters(appliedFilters)
  const filtersActive = hasActiveCandidateFilters(appliedFilters)
  const defaultStatus = createDefaultCandidateFilters().status
  const showReset =
    searchInput.trim() ||
    filtersActive ||
    appliedFilters.ageSort !== AGE_SORT.DEFAULT ||
    appliedFilters.status !== defaultStatus

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

  // Status is always an active filter now, so the list is never "everything
  // unfiltered" — always show the concrete result count.
  const countLabel = `Найдено: ${resultCount}`

  return (
    <div className="candidates-page">
      <CandidateStatusSegmentedControl
        value={statusValue}
        onChange={onStatusChange}
        counts={statusCounts}
      />

      <PlatformSearchToolbar
        value={searchInput}
        onChange={(event) => onSearchInputChange(event.target.value)}
        placeholder="Поиск по ФИО или телефону"
        ariaLabel="Поиск по ФИО или телефону"
        showClear
        onClear={onSearchClear}
        actions={
          <PlatformToolbarActionWrap>
            <PlatformFilterButton
              buttonRef={filterButtonRef}
              active={filtersActive}
              count={activeFilterCount > 0 ? activeFilterCount : null}
              onClick={toggleFilters}
              ariaExpanded={filterOpen}
              ariaLabel={
                activeFilterCount > 0 ? `Фильтр, активно ${activeFilterCount}` : 'Фильтр'
              }
              title="Фильтр"
            />
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
          </PlatformToolbarActionWrap>
        }
      />

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
          resultCount={draftResultCount ?? resultCount}
          onChange={onDraftChange}
          onApply={applyFilters}
          onReset={onResetFilters}
          onClose={() => setFilterOpen(false)}
          returnFocusRef={filterButtonRef}
        />
      )}
    </div>
  )
}
