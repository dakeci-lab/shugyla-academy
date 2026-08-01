export default function StructureEmptyState({ title, description, action }) {
  return (
    <div className="structure-empty" role="status">
      {title ? <h4 className="structure-empty__title">{title}</h4> : null}
      {description ? <p className="structure-empty__text">{description}</p> : null}
      {action || null}
    </div>
  )
}
