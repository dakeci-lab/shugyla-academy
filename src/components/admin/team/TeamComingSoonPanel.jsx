export default function TeamComingSoonPanel({ title }) {
  return (
    <div className="team-mgmt__coming-soon" role="status">
      <h3 className="team-mgmt__coming-soon-title">{title}</h3>
      <p className="team-mgmt__coming-soon-text">Интерфейс будет подключён на следующем этапе</p>
    </div>
  )
}
