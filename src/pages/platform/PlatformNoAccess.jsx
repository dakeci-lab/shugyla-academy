import { Link } from 'react-router-dom'

/** Роль без доступных разделов платформы (платформа — только закуп и взаиморасчёты). */
export default function PlatformNoAccess() {
  return (
    <div className="platform-no-access" role="status" style={{ maxWidth: 520, margin: '48px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Для вашей роли здесь нет разделов</h1>
      <p style={{ lineHeight: 1.6, marginBottom: 12 }}>
        Платформа Shugyla теперь используется только для закупа и взаиморасчётов с поставщиками.
        Учёт прихода и ухода, график и зарплата ведутся в Прополисе.
      </p>
      <p style={{ lineHeight: 1.6 }}>
        Если вам нужен доступ к закупу или расчётам, обратитесь к администратору.{' '}
        <Link to="/platform/profile">Открыть профиль</Link>
      </p>
    </div>
  )
}
