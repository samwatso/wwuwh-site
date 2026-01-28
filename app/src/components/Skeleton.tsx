import styles from './Skeleton.module.css'

export interface SkeletonProps {
  variant?: 'text' | 'circle' | 'rect' | 'card'
  width?: string | number
  height?: string | number
  className?: string
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonProps) {
  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  const variantClass = {
    text: styles.text,
    circle: styles.circle,
    rect: styles.rect,
    card: styles.card,
  }[variant]

  return (
    <div
      className={`${styles.skeleton} ${variantClass} ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}
