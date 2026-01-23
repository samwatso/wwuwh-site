import { Link } from 'react-router-dom'
import styles from './AdminHome.module.css'

export function AdminAudit() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link to="/app/admin" style={{ color: 'var(--grey-500)', fontSize: 'var(--text-sm)' }}>
          ← Back to Admin
        </Link>
        <h1 className={styles.title}>Audit Log</h1>
        <p className={styles.subtitle}>View activity history</p>
      </div>

      <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--grey-500)' }}>
        <p>Audit log coming soon...</p>
      </div>
    </div>
  )
}
