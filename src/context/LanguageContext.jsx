import { createContext, useContext, useState } from 'react'
import { translations } from '../utils/i18n'

const LanguageContext = createContext(null)

/** Контекст языка — RU / KZ, сохраняется в localStorage */
export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('shugyla_lang') || 'ru'
  })

  function switchLang(newLang) {
    setLang(newLang)
    localStorage.setItem('shugyla_lang', newLang)
  }

  const t = translations[lang]

  return (
    <LanguageContext.Provider value={{ lang, switchLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
