const marks = new Map()

export function markDevPerf(label) {
  if (!import.meta.env.DEV) return
  marks.set(label, performance.now())
}

export function logDevPerf(label, sinceLabel = null) {
  if (!import.meta.env.DEV) return
  const end = performance.now()
  const start = sinceLabel ? marks.get(sinceLabel) : marks.get(label)
  if (start == null) return
  const duration = Math.round(end - start)
  console.info(`[perf] ${label}: ${duration}ms`)
}
