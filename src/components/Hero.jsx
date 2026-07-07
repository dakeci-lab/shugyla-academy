import { Link } from 'react-router-dom'
import './Hero.css'

/**
 * Hero-блок на главной странице академии
 */
export default function Hero() {
  return (
    <section className="hero">
      <div className="hero__content container">
        <h1 className="hero__title">
          Обучаем сотрудников работать по системе
        </h1>
        <p className="hero__subtitle">
          Платформа корпоративного обучения Shugyla Market — курсы по
          должностям, тесты и аттестация для каждого сотрудника.
        </p>
        <Link to="/login" className="btn btn--primary btn--lg">
          Начать обучение
        </Link>
      </div>
    </section>
  )
}
