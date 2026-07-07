import { useLanguage } from '../context/LanguageContext'
import './LangSwitch.css'

/** Переключатель языка RU / KZ */
export default function LangSwitch() {
  const { lang, switchLang } = useLanguage()

  return (
    <div className="lang-switch">
      <button
        className={`lang-switch__btn ${lang === 'ru' ? 'lang-switch__btn--active' : ''}`}
        onClick={() => switchLang('ru')}
      >
        RU
      </button>
      <button
        className={`lang-switch__btn ${lang === 'kz' ? 'lang-switch__btn--active' : ''}`}
        onClick={() => switchLang('kz')}
      >
        KZ
      </button>
    </div>
  )
}
