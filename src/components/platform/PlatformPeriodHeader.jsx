import { ChevronLeftIcon, ChevronRightIcon } from '../icons/PlatformIcons'
import './PlatformPeriodHeader.css'

/**
 * Единый верхний блок выбора периода Shugyla Platform.
 * День / неделя / месяц — меняется только текст title.
 */
export default function PlatformPeriodHeader({
  title,
  onPrev,
  onNext,
  onToday,
  prevLabel = 'Предыдущий период',
  nextLabel = 'Следующий период',
  todayLabel = 'Сегодня',
  prevDisabled = false,
  nextDisabled = false,
  todayDisabled = false,
  'aria-label': ariaLabel = 'Выбор периода',
}) {
  return (
    <div className="platform-period-header" aria-label={ariaLabel}>
      <button
        type="button"
        className="platform-period-header__nav"
        onClick={onPrev}
        disabled={prevDisabled}
        aria-label={prevLabel}
      >
        <ChevronLeftIcon size={18} />
      </button>

      <div className="platform-period-header__main">
        <h2 className="platform-period-header__title">{title}</h2>
        <button
          type="button"
          className="platform-period-header__today"
          onClick={onToday}
          disabled={todayDisabled}
        >
          {todayLabel}
        </button>
      </div>

      <button
        type="button"
        className="platform-period-header__nav"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
      >
        <ChevronRightIcon size={18} />
      </button>
    </div>
  )
}
