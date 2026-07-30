/**
 * Temporary store work-hours config for schedule timeline.
 * No centralized branch/platform hours source exists yet — single place for 08:45–00:00.
 * Replace when store hours land in settings/DB.
 */
export const STORE_WORK_HOURS = Object.freeze({
  startTime: '08:45',
  /** End of timeline on next calendar day (store closes at midnight). */
  endTime: '00:00',
  source: 'temporary-project-default',
})

/** Minimum timeline track width (px) so the day stays readable on narrow screens. */
export const SCHEDULE_DAY_TIMELINE_MIN_WIDTH_PX = 1200
