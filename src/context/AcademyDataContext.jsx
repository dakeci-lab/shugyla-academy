import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { isCloudMode } from '../lib/dataMode'
import { initializeData } from '../services/academyDataService'
import './AcademyDataContext.css'

const AcademyDataContext = createContext({
  ready: true,
  loading: false,
  version: 0,
  reload: async () => {},
})

function DataLoadingScreen() {
  return (
    <div className="academy-data-loading">
      <div className="academy-data-loading__card">
        <div className="academy-data-loading__logo" aria-hidden="true">S</div>
        <h1 className="academy-data-loading__brand">Shugyla Academy</h1>
        <span className="academy-data-loading__spinner" aria-hidden />
        <p>Загрузка…</p>
      </div>
    </div>
  )
}

export function AcademyDataProvider({ children }) {
  const [ready, setReady] = useState(!isCloudMode())
  const [loading, setLoading] = useState(isCloudMode())
  const [version, setVersion] = useState(0)

  const reload = useCallback(async () => {
    if (isCloudMode()) {
      await initializeData()
    }
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!isCloudMode()) {
        setReady(true)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        await initializeData()
        if (!cancelled) setReady(true)
      } catch (error) {
        console.error('Academy data load failed:', error)
        if (!cancelled) setReady(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || !ready) {
    return <DataLoadingScreen />
  }

  return (
    <AcademyDataContext.Provider value={{ ready, loading, version, reload }}>
      {children}
    </AcademyDataContext.Provider>
  )
}

export function useAcademyData() {
  return useContext(AcademyDataContext)
}
