/**
 * PaymentOptionsModal Component
 *
 * Shows payment options for events: Cash on the day, BACS bank transfer, or Stripe.
 * Handles different states based on current payment status.
 */

import { useState, useRef, useEffect } from 'react'
import { Spinner } from './Spinner'
import {
  recordPaymentIntent,
  cancelPaymentIntent,
  createCheckout,
  openExternalUrl,
  PaymentMethod,
  PaymentIntentResponse,
} from '@/lib/api'
import type { EventWithRsvp } from '@/types/database'
import styles from './PaymentOptionsModal.module.css'

interface PaymentOptionsModalProps {
  event: EventWithRsvp
  onClose: () => void
  onPaymentComplete: () => void
}

type ModalView = 'options' | 'bacs_details' | 'cash_confirmed' | 'loading' | 'error'

export function PaymentOptionsModal({
  event,
  onClose,
  onPaymentComplete,
}: PaymentOptionsModalProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ModalView>('options')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bacsDetails, setBacsDetails] = useState<PaymentIntentResponse | null>(null)

  // Current payment state from event
  const currentSource = event.payment_source
  const currentStatus = event.payment_status
  const hasPendingCash = currentSource === 'cash' && currentStatus === 'pending'
  const hasPendingBacs = currentSource === 'bank_transfer' && currentStatus === 'pending'
  const hasStripePayment = currentSource === 'stripe' && currentStatus === 'succeeded'

  // Format fee for display
  const formatFee = (cents: number | null, currency: string): string => {
    if (!cents) return 'Free'
    const amount = cents / 100
    if (currency === 'GBP') return `£${amount.toFixed(2)}`
    return `${amount.toFixed(2)} ${currency}`
  }

  const feeDisplay = formatFee(event.fee_cents, event.currency)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const handleSelectPayment = async (method: PaymentMethod) => {
    setLoading(true)
    setError(null)

    try {
      const response = await recordPaymentIntent(event.id, method)

      if (method === 'bank_transfer') {
        setBacsDetails(response)
        setView('bacs_details')
      } else {
        setView('cash_confirmed')
      }

      onPaymentComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
      setView('error')
    } finally {
      setLoading(false)
    }
  }

  const handleStripeCheckout = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await createCheckout(event.id)
      await openExternalUrl(response.checkout_url)
      // On iOS, user returns by tapping "Done" - close modal
      setLoading(false)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create checkout')
      setView('error')
      setLoading(false)
    }
  }

  const handleCancelPayment = async () => {
    setLoading(true)
    setError(null)

    try {
      await cancelPaymentIntent(event.id)
      onPaymentComplete()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel payment')
      setLoading(false)
    }
  }

  const handleChangeMethod = () => {
    setView('options')
    setBacsDetails(null)
  }

  // Format sort code with dashes (XX-XX-XX)
  const formatSortCode = (code: string): string => {
    const clean = code.replace(/\D/g, '')
    if (clean.length !== 6) return code
    return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 6)}`
  }

  // Render based on view
  const renderContent = () => {
    if (loading) {
      return (
        <div className={styles.loadingState}>
          <Spinner size="lg" />
          <p>Processing...</p>
        </div>
      )
    }

    if (view === 'error') {
      return (
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>!</div>
          <p>{error}</p>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setView('options')}
          >
            Try Again
          </button>
        </div>
      )
    }

    if (view === 'cash_confirmed') {
      return (
        <div className={styles.confirmState}>
          <div className={styles.confirmIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h4 className={styles.confirmTitle}>Cash Payment Recorded</h4>
          <p className={styles.confirmMessage}>
            Please pay <strong>{feeDisplay}</strong> in cash on the day.
          </p>
          <p className={styles.confirmNote}>
            You've been marked as attending this session.
          </p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleChangeMethod}
            >
              Change Method
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      )
    }

    if (view === 'bacs_details') {
      return (
        <div className={styles.bacsState}>
          <h4 className={styles.bacsTitle}>Bank Transfer Details</h4>
          <p className={styles.bacsAmount}>
            Amount: <strong>{feeDisplay}</strong>
          </p>

          {bacsDetails?.bank_details ? (
            <div className={styles.bankDetails}>
              <div className={styles.bankField}>
                <span className={styles.bankLabel}>Account Name</span>
                <span className={styles.bankValue}>{bacsDetails.bank_details.account_name}</span>
              </div>
              <div className={styles.bankField}>
                <span className={styles.bankLabel}>Sort Code</span>
                <span className={styles.bankValue}>
                  {formatSortCode(bacsDetails.bank_details.sort_code)}
                </span>
              </div>
              <div className={styles.bankField}>
                <span className={styles.bankLabel}>Account Number</span>
                <span className={styles.bankValue}>{bacsDetails.bank_details.account_number}</span>
              </div>
              {bacsDetails.reference && (
                <div className={styles.bankField}>
                  <span className={styles.bankLabel}>Reference</span>
                  <span className={`${styles.bankValue} ${styles.referenceValue}`}>
                    {bacsDetails.reference}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className={styles.noBankDetails}>
              Bank details not configured. Please contact the club.
            </p>
          )}

          <p className={styles.bacsNote}>
            Please use the reference above so we can match your payment.
          </p>

          <div className={styles.bacsActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleChangeMethod}
            >
              Change Method
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      )
    }

    // Default: options view
    return (
      <>
        <h3 className={styles.title}>How would you like to pay?</h3>
        <p className={styles.eventInfo}>
          {event.title} - {feeDisplay}
        </p>

        <div className={styles.options}>
          {/* Cash Option */}
          <button
            type="button"
            className={`${styles.optionBtn} ${hasPendingCash ? styles.optionBtnActive : ''}`}
            onClick={() => handleSelectPayment('cash')}
            disabled={loading}
          >
            <div className={styles.optionIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="3" />
                <path d="M6 12h.01M18 12h.01" />
              </svg>
            </div>
            <div className={styles.optionText}>
              <span className={styles.optionLabel}>Cash</span>
              <span className={styles.optionDesc}>Pay on the day</span>
            </div>
            {hasPendingCash && (
              <span className={styles.selectedBadge}>Selected</span>
            )}
          </button>

          {/* BACS Option */}
          <button
            type="button"
            className={`${styles.optionBtn} ${hasPendingBacs ? styles.optionBtnActive : ''}`}
            onClick={() => handleSelectPayment('bank_transfer')}
            disabled={loading}
          >
            <div className={styles.optionIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
                <path d="M9 21v-6h6v6" />
                <path d="M10 11h4" />
              </svg>
            </div>
            <div className={styles.optionText}>
              <span className={styles.optionLabel}>Bank Transfer</span>
              <span className={styles.optionDesc}>BACS payment</span>
            </div>
            {hasPendingBacs && (
              <span className={styles.selectedBadge}>Selected</span>
            )}
          </button>

          {/* Stripe Option */}
          <button
            type="button"
            className={`${styles.optionBtn} ${hasStripePayment ? styles.optionBtnDisabled : ''}`}
            onClick={handleStripeCheckout}
            disabled={loading || hasStripePayment}
          >
            <div className={styles.optionIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <div className={styles.optionText}>
              <span className={styles.optionLabel}>Card Payment</span>
              <span className={styles.optionDesc}>Pay now with Stripe</span>
            </div>
          </button>
        </div>

        {/* Cancel option if already selected cash/bacs */}
        {(hasPendingCash || hasPendingBacs) && (
          <div className={styles.cancelSection}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={handleCancelPayment}
              disabled={loading}
            >
              Cancel payment commitment
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.popup} ref={popupRef} role="dialog" aria-modal="true">
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {renderContent()}
      </div>
    </div>
  )
}
