import { useLanguage } from '../context/LanguageContext'
import './Hero.css'

/** Hero-блок главной страницы с мягким фоном */
export default function Hero() {
  const { t } = useLanguage()

  const scrollToCourses = () => {
    document.getElementById('courses')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="hero">
      <div className="hero__bg" aria-hidden="true">
        <div className="hero__blob hero__blob--1" />
        <div className="hero__blob hero__blob--2" />
        <div className="hero__blob hero__blob--3" />
      </div>

      <div className="hero__content container">
        <span className="hero__badge">{t.heroBadge}</span>
        <h1 className="hero__title">{t.heroTitle}</h1>
        <p className="hero__subtitle">{t.heroSubtitle}</p>
        <button type="button" className="btn btn--primary btn--lg hero__cta" onClick={scrollToCourses}>
          {t.startLearning}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      </div>
    </section>
  )
}
