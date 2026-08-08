import './loading.css'

export function SkeletonPrimitive({ className = '' }) {
  return <span className={`shugyla-skeleton__primitive ${className}`.trim()} aria-hidden="true" />
}

function ListSkeleton({ count }) {
  return (
    <div className="shugyla-skeleton__list">
      {Array.from({ length: count }, (_, index) => (
        <div className="shugyla-skeleton__list-row" key={index}>
          <SkeletonPrimitive className="shugyla-skeleton__avatar" />
          <div className="shugyla-skeleton__lines">
            <SkeletonPrimitive className="shugyla-skeleton__line shugyla-skeleton__line--wide" />
            <SkeletonPrimitive className="shugyla-skeleton__line shugyla-skeleton__line--short" />
          </div>
        </div>
      ))}
    </div>
  )
}

function TableSkeleton({ count }) {
  return (
    <div className="shugyla-skeleton__table">
      <SkeletonPrimitive className="shugyla-skeleton__table-head" />
      {Array.from({ length: count }, (_, index) => (
        <SkeletonPrimitive className="shugyla-skeleton__table-row" key={index} />
      ))}
    </div>
  )
}

function CardsSkeleton({ count, dashboard = false }) {
  return (
    <div className={`shugyla-skeleton__cards${dashboard ? ' shugyla-skeleton__cards--dashboard' : ''}`}>
      {Array.from({ length: count }, (_, index) => (
        <div className="shugyla-skeleton__card" key={index}>
          <SkeletonPrimitive className="shugyla-skeleton__line shugyla-skeleton__line--short" />
          <SkeletonPrimitive className="shugyla-skeleton__card-value" />
          <SkeletonPrimitive className="shugyla-skeleton__line shugyla-skeleton__line--wide" />
        </div>
      ))}
    </div>
  )
}

export default function LoadingSkeleton({ variant = 'list', count }) {
  const resolvedCount = count ?? (variant === 'dashboard' ? 6 : variant === 'cards' ? 4 : 5)

  return (
    <div className={`shugyla-skeleton shugyla-skeleton--${variant}`} aria-hidden="true">
      {variant === 'list' ? <ListSkeleton count={resolvedCount} /> : null}
      {variant === 'table' ? <TableSkeleton count={resolvedCount} /> : null}
      {variant === 'cards' ? <CardsSkeleton count={resolvedCount} /> : null}
      {variant === 'dashboard' ? <CardsSkeleton count={resolvedCount} dashboard /> : null}
    </div>
  )
}
