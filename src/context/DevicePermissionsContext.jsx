import { createContext, useContext } from 'react'
import useDevicePermissions from '../hooks/useDevicePermissions'

const DevicePermissionsContext = createContext(null)

export function DevicePermissionsProvider({ children, enabled = true }) {
  const value = useDevicePermissions({ enabled })
  return (
    <DevicePermissionsContext.Provider value={value}>
      {children}
    </DevicePermissionsContext.Provider>
  )
}

export function useDevicePermissionsContext() {
  const value = useContext(DevicePermissionsContext)
  if (!value) {
    throw new Error('useDevicePermissionsContext must be used within DevicePermissionsProvider')
  }
  return value
}
