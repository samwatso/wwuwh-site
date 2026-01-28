import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Browser } from '@capacitor/browser'
import { useProfile } from '@/hooks/useProfile'
import { useBillingPlans } from '@/hooks/useBillingPlans'
import { useSubscribe } from '@/hooks/useSubscribe'
import { Button, Spinner } from '@/components'
import styles from './Subscribe.module.css'

// Helper to format price
function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100
  if (currency === 'GBP') return `£${amount.toFixed(2)}`
  return `${amount.toFixed(2)} ${currency}`
}

// Helper to get sessions text
function getSessionsText(sessions: number): string {
  if (sessions === -1) return 'Unlimited sessions per week'
  if (sessions === 1) return '1 session per week'
  return `${sessions} sessions per week`
}

export function Subscribe() {
  const { memberships, subscriptions, loading: profileLoading, refresh: refreshProfile } = useProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Get the first active club membership
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''
  const clubName = memberships.length > 0 ? memberships[0].club_name : ''

  // Get current subscription if exists
  const currentSubscription = subscriptions.find(s => s.status === 'active' || s.status === 'past_due')

  const { plans, loading: plansLoading, error: plansError } = useBillingPlans(clubId)
  const { subscribe, subscribing, openBillingPortal, openingPortal, error: subscribeError } = useSubscribe()

  // Handle return from Stripe
  useEffect(() => {
    const success = searchParams.get('success')
    const cancelled = searchParams.get('cancelled')

    if (success === 'true') {
      setMessage({ type: 'success', text: 'Subscription successful! Welcome to the club.' })
      setSearchParams({})
    } else if (cancelled === 'true') {
      setMessage({ type: 'error', text: 'Subscription was cancelled.' })
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  // Auto-dismiss message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Show subscribe error
  useEffect(() => {
    if (subscribeError) {
      setMessage({ type: 'error', text: subscribeError })
    }
  }, [subscribeError])

  // Refresh profile when returning from in-app browser (iOS Stripe payment)
  useEffect(() => {
    const listener = Browser.addListener('browserFinished', () => {
      refreshProfile()
    })
    return () => {
      listener.then(l => l.remove())
    }
  }, [refreshProfile])

  // Loading state
  if (profileLoading || plansLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" />
          <p>Loading plans...</p>
        </div>
      </div>
    )
  }

  // No club membership
  if (!clubId) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <h2>No Club Membership</h2>
          <p>You need to be a member of a club to subscribe.</p>
        </div>
      </div>
    )
  }

  // Error state
  if (plansError) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Unable to load plans</h2>
          <p>{plansError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Message */}
      {message && (
        <div className={message.type === 'success' ? styles.successMessage : styles.errorMessage}>
          {message.text}
          <button
            className={styles.dismissBtn}
            onClick={() => setMessage(null)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.title}>Membership Plans</h1>
        <p className={styles.subtitle}>{clubName}</p>
      </div>

      {/* Current subscription banner */}
      {currentSubscription && (
        <div className={styles.currentPlan}>
          <div className={styles.currentPlanInfo}>
            <span className={styles.currentPlanLabel}>Current Plan</span>
            <span className={styles.currentPlanName}>{currentSubscription.plan_name}</span>
            <span className={styles.currentPlanDetails}>
              {formatPrice(currentSubscription.price_cents, currentSubscription.currency)}/{currentSubscription.cadence}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={openBillingPortal}
            loading={openingPortal}
          >
            Manage Subscription
          </Button>
        </div>
      )}

      {/* Plans grid */}
      <div className={styles.plansGrid}>
        {plans.map((plan) => {
          const isCurrent = currentSubscription?.plan_id === plan.id
          const canSubscribe = !currentSubscription && plan.stripe_price_id

          return (
            <div
              key={plan.id}
              className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ''}`}
            >
              {isCurrent && <span className={styles.currentBadge}>Current</span>}

              <h3 className={styles.planName}>{plan.name}</h3>

              <div className={styles.planPrice}>
                <span className={styles.priceAmount}>
                  {formatPrice(plan.price_cents, plan.currency)}
                </span>
                <span className={styles.pricePeriod}>/{plan.cadence}</span>
              </div>

              <p className={styles.planSessions}>
                {getSessionsText(plan.weekly_sessions_allowed)}
              </p>

              {canSubscribe ? (
                <Button
                  onClick={() => subscribe(plan.id)}
                  loading={subscribing === plan.id}
                  disabled={!!subscribing}
                  fullWidth
                >
                  Subscribe
                </Button>
              ) : isCurrent ? (
                <Button variant="secondary" disabled fullWidth>
                  Active
                </Button>
              ) : !plan.stripe_price_id ? (
                <Button variant="secondary" disabled fullWidth>
                  Not Available
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={openBillingPortal}
                  loading={openingPortal}
                  fullWidth
                >
                  Change Plan
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Guest pricing note */}
      <div className={styles.guestNote}>
        <h4>Pay per Session</h4>
        <p>
          Don't want a subscription? You can pay per session at £10 each.
          Simply RSVP to an event and click the Pay button.
        </p>
      </div>

      {/* Help text */}
      {currentSubscription && (
        <div className={styles.helpText}>
          <p>
            Need to cancel or update your payment method?{' '}
            <button
              className={styles.linkButton}
              onClick={openBillingPortal}
              disabled={openingPortal}
            >
              Manage your subscription
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
