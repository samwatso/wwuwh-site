/**
 * Avatar Component
 *
 * Displays a user's profile photo or falls back to initials.
 */

import styles from './Avatar.module.css'

export interface AvatarProps {
  src?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

// Get initials from name (first letter of first and last name)
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Generate a consistent color based on name
function getColorFromName(name: string): string {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
  ]

  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = styles[`size${size.charAt(0).toUpperCase() + size.slice(1)}`]
  const initials = getInitials(name)
  const bgColor = getColorFromName(name)

  if (src) {
    return (
      <div className={`${styles.avatar} ${sizeClass} ${className}`}>
        <img
          src={src}
          alt={name}
          className={styles.image}
          loading="lazy"
          onError={(e) => {
            // If image fails to load, hide it and show initials
            e.currentTarget.style.display = 'none'
            const parent = e.currentTarget.parentElement
            if (parent) {
              parent.style.backgroundColor = bgColor
              const initialsEl = parent.querySelector(`.${styles.initials}`) as HTMLElement
              if (initialsEl) {
                initialsEl.style.display = 'flex'
              }
            }
          }}
        />
        <span className={styles.initials} style={{ display: 'none', backgroundColor: bgColor }}>
          {initials}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`${styles.avatar} ${sizeClass} ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      <span className={styles.initials}>{initials}</span>
    </div>
  )
}
