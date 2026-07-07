import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import './Hero.css'

/** Hero-блок главной страницы с мягким фоном */
export default function Hero() {
  const { t } = useLanguage()

  return (
    <section className="hero">
      <div className="hero__bg" aria-hidden="true" />
      <div className="hero__content container">
        <h1 className="hero__title">{t.heroTitle}</h1>
        <p className="hero__subtitle">{t.heroSubtitle}</p>
        <Link to="/login" className="btn btn--primary btn--lg hero__cta">
          {t.startLearning}
        </Link>
      </div>
    </section>
  )
}
