import { Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import styles from './AdminHome.module.css'

export function AdminHome() {
  const { memberships } = useProfile()
  const clubName = memberships[0]?.club_name || 'Club'

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <p className={styles.subtitle}>{clubName}</p>
      </div>

      <div className={styles.grid}>
        <Link to="/app/admin/members" className={styles.card}>
          <div className={styles.cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Members</h3>
          <p className={styles.cardDesc}>View and manage club members</p>
        </Link>

        <Link to="/app/admin/events" className={styles.card}>
          <div className={styles.cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Events</h3>
          <p className={styles.cardDesc}>Create and manage events</p>
        </Link>

        <Link to="/app/admin/groups" className={styles.card}>
          <div className={styles.cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Groups</h3>
          <p className={styles.cardDesc}>Manage teams and squads</p>
        </Link>

        <Link to="/app/admin/billing" className={styles.card}>
          <div className={styles.cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Billing</h3>
          <p className={styles.cardDesc}>Subscriptions and payments</p>
        </Link>

        <Link to="/app/admin/roles" className={styles.card}>
          <div className={styles.cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Roles</h3>
          <p className={styles.cardDesc}>Manage permissions</p>
        </Link>

        <Link to="/app/admin/audit" className={styles.card}>
          <div className={styles.cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Audit Log</h3>
          <p className={styles.cardDesc}>View activity history</p>
        </Link>
      </div>
    </div>
  )
}
