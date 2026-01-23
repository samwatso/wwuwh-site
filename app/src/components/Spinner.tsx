import styles from './Spinner.module.css'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`${styles.spinner} ${styles[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" className={styles.track} />
        <path d="M12 2a10 10 0 0 1 10 10" className={styles.indicator} />
      </svg>
      <span className="sr-only">Loading...</span>
    </div>
  )
}
