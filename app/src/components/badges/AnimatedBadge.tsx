import { useState, useEffect } from 'react'
import styles from './AnimatedBadge.module.css'

interface AnimatedBadgeProps {
  /** The icon key from the awards table (e.g., 'first_dip_round') */
  icon: string
  /** Badge size in pixels */
  size?: number
  /** Whether the badge is earned (colored) or locked (greyscale) */
  earned?: boolean
  /** Whether to animate (default true for earned badges) */
  animate?: boolean
  /** Optional click handler */
  onClick?: () => void
  /** Optional className */
  className?: string
  /** Alt text for accessibility */
  alt?: string
}

/**
 * AnimatedBadge - A luxury animated badge component
 *
 * Features:
 * - Loads SVG badge from /badges/<icon>.svg
 * - Applies subtle "luxury tilt" rotation animation
 * - Adds moving specular "glow sweep" overlay
 * - Respects prefers-reduced-motion
 * - Greyscale filter for locked/unearned badges
 */
export function AnimatedBadge({
  icon,
  size = 64,
  earned = true,
  animate = true,
  onClick,
  className = '',
  alt,
}: AnimatedBadgeProps) {
  const [imgError, setImgError] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const shouldAnimate = animate && earned && !prefersReducedMotion
  const badgePath = `${import.meta.env.BASE_URL}badges/${icon}.svg`

  const containerClasses = [
    styles.badgeContainer,
    shouldAnimate ? styles.animated : '',
    !earned ? styles.locked : '',
    onClick ? styles.clickable : '',
    className,
  ].filter(Boolean).join(' ')

  if (imgError) {
    // Fallback placeholder
    return (
      <div
        className={containerClasses}
        style={{ width: size, height: size }}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div className={styles.fallback}>
          <span className={styles.fallbackIcon}>🏅</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={containerClasses}
      style={{ width: size, height: size }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={styles.badgeInner}>
        <img
          src={badgePath}
          alt={alt || `${icon.replace(/_/g, ' ')} badge`}
          className={styles.badgeImage}
          onError={() => setImgError(true)}
          loading="lazy"
        />
        {shouldAnimate && <div className={styles.glowSweep} />}
      </div>
      {!earned && <div className={styles.lockOverlay}>🔒</div>}
    </div>
  )
}

export default AnimatedBadge
