/**
 * OfflineNotice Component
 *
 * Displays a notice when the device is offline.
 */

import styles from './OfflineNotice.module.css'

interface OfflineNoticeProps {
  message?: string
}

export function OfflineNotice({ message }: OfflineNoticeProps) {
  return (
    <div className={styles.container}>
      <div className={styles.icon}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <h3 className={styles.title}>No Internet Connection</h3>
      <p className={styles.message}>
        {message || 'Please check your connection and try again. The app requires internet to load live data.'}
      </p>
      <button
        type="button"
        className={styles.retryBtn}
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  )
}
