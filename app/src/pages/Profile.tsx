import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useSubscribe } from '@/hooks/useSubscribe'
import { useAwards, Award } from '@/hooks/useAwards'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Button, Input, FormField, Spinner, Avatar, ImageCropper, Skeleton } from '@/components'
import { AnimatedBadge } from '@/components/badges'
import { supabase } from '@/lib/supabase'
import { deleteAccount } from '@/lib/api'
import { PRICING_CATEGORY_LABELS, type PricingCategory } from '@/types/database'
import styles from './Profile.module.css'

// Check if running in Capacitor native app
function isNativePlatform(): boolean {
  return typeof window !== 'undefined' &&
    !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
}

// Helper to format price
function formatPrice(cents: number, currency: string, cadence: string): string {
  const amount = cents / 100
  const formatted = currency === 'GBP' ? `£${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency}`
  return `${formatted}/${cadence}`
}

export function Profile() {
  const { user, signOut } = useAuth()
  const { person, memberships, subscriptions, loading, error, synced, updateName, updatePhoto, updateEmail } = useProfile()
  const { openBillingPortal, openingPortal } = useSubscribe()
  const { awards, lockedAwards, currentStreak, loading: awardsLoading } = useAwards()
  const { permissionStatus, requestPermission, isSupported: notificationsSupported } = usePushNotifications()
  const navigate = useNavigate()
  const [requestingNotifications, setRequestingNotifications] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [cropperImage, setCropperImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [showBadgeCollection, setShowBadgeCollection] = useState(false)

  const handleEditStart = () => {
    setEditName(person?.name || '')
    setEditEmail(person?.email || '')
    setEmailMessage(null)
    setIsEditing(true)
  }

  const handleEditCancel = () => {
    setIsEditing(false)
    setEditName('')
    setEditEmail('')
    setEmailMessage(null)
  }

  const handleEditSave = async () => {
    if (!editName.trim()) return

    setSaving(true)
    setEmailMessage(null)

    // Update name
    await updateName(editName.trim())

    // Update email if changed
    const emailChanged = editEmail.trim() !== person?.email
    if (emailChanged && editEmail.trim()) {
      const result = await updateEmail(editEmail.trim())
      if (result.success) {
        setEmailMessage({ type: 'success', text: result.message || 'Email updated' })
      } else {
        setEmailMessage({ type: 'error', text: result.message || 'Failed to update email' })
        setSaving(false)
        return // Keep editing mode open on error
      }
    }

    setSaving(false)
    setIsEditing(false)
  }

  const handlePhotoClick = async () => {
    if (isNativePlatform()) {
      // Use Capacitor Camera plugin on native platforms
      try {
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false, // Get raw image, use our custom cropper
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          promptLabelHeader: 'Profile Photo',
          promptLabelPhoto: 'Choose from Library',
          promptLabelPicture: 'Take Photo',
          correctOrientation: true,
        })

        if (image.dataUrl) {
          // Show our custom cropper with round circle and zoom
          setCropperImage(image.dataUrl)
        }
      } catch (err) {
        // User cancelled or permission denied - don't show error for cancel
        const error = err as Error
        if (!error.message?.includes('cancelled') && !error.message?.includes('canceled')) {
          setPhotoError('Unable to access camera or photos. Please check app permissions.')
        }
      }
    } else {
      // Use file input on web
      fileInputRef.current?.click()
    }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // Validate file
    const maxSize = 5 * 1024 * 1024 // 5MB for original (will be compressed after crop)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    if (!allowedTypes.includes(file.type)) {
      setPhotoError('Please upload a JPEG, PNG, WebP, or GIF image')
      return
    }

    if (file.size > maxSize) {
      setPhotoError('Image must be smaller than 5MB')
      return
    }

    setPhotoError(null)

    // Read file and show cropper
    const reader = new FileReader()
    reader.onload = () => {
      setCropperImage(reader.result as string)
    }
    reader.onerror = () => {
      setPhotoError('Failed to read image file')
    }
    reader.readAsDataURL(file)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!user) return

    setUploadingPhoto(true)

    try {
      const filePath = `${user.id}/avatar.jpg`

      // Upload cropped image to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, croppedBlob, {
          upsert: true,
          contentType: 'image/jpeg',
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Add cache-busting timestamp
      const photoUrl = `${urlData.publicUrl}?t=${Date.now()}`

      // Update profile with new photo URL
      await updatePhoto(photoUrl)
      setCropperImage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload photo'
      setPhotoError(message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleCropCancel = () => {
    setCropperImage(null)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/app/login', { replace: true })
    } catch (err) {
      console.error('Sign out failed:', err)
      // Still try to navigate to login
      navigate('/app/login', { replace: true })
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return

    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteAccount()
      // Sign out and redirect to login
      await signOut()
      navigate('/app/login', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account'
      setDeleteError(message)
      setDeleting(false)
    }
  }

  const handleEnableNotifications = async () => {
    setRequestingNotifications(true)
    try {
      await requestPermission()
    } finally {
      setRequestingNotifications(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        {/* Skeleton Header */}
        <div className={styles.header}>
          <div className={styles.avatarWrapper}>
            <Skeleton variant="circle" width={80} height={80} />
          </div>
          <Skeleton variant="text" width={150} height={24} className={styles.skeletonTitle} />
        </div>

        {/* Skeleton Cards */}
        <div className={styles.skeletonCard}>
          <Skeleton variant="text" width={80} height={16} />
          <div className={styles.skeletonRows}>
            <Skeleton variant="text" width="100%" height={40} />
            <Skeleton variant="text" width="100%" height={40} />
            <Skeleton variant="text" width="100%" height={40} />
          </div>
        </div>

        <div className={styles.skeletonCard}>
          <Skeleton variant="text" width={120} height={16} />
          <div className={styles.skeletonRows}>
            <Skeleton variant="text" width="100%" height={40} />
            <Skeleton variant="text" width="100%" height={40} />
          </div>
        </div>

        <div className={styles.skeletonCard}>
          <Skeleton variant="text" width={100} height={16} />
          <div className={styles.skeletonRows}>
            <Skeleton variant="text" width="100%" height={40} />
            <Skeleton variant="text" width="100%" height={40} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.error}>
        <div className={styles.errorIcon}>!</div>
        <h2>Unable to load profile</h2>
        <p>{error}</p>
      </div>
    )
  }

  // Profile completion checks
  // Name doesn't count if it exactly matches the email prefix (auto-generated)
  const emailPrefix = user?.email?.split('@')[0]?.toLowerCase() || ''
  const hasName = !!(
    person?.name &&
    person.name.trim().length > 0 &&
    person.name.trim().toLowerCase() !== emailPrefix
  )
  const hasPhoto = !!(person?.photo_url && person.photo_url.trim().length > 0)
  const profileCompletion = 33 + (hasName ? 33 : 0) + (hasPhoto ? 34 : 0)
  const isProfileComplete = profileCompletion === 100

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.avatarWrapper}>
          <Avatar
            src={person?.photo_url}
            name={person?.name || user?.email || 'User'}
            size="lg"
            className={styles.avatar}
          />
          <button
            type="button"
            className={styles.changePhotoButton}
            onClick={handlePhotoClick}
            disabled={uploadingPhoto}
            title="Change photo"
          >
            {uploadingPhoto ? (
              <Spinner size="sm" />
            ) : (
              <span className={styles.cameraIcon}>📷</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePhotoChange}
            className={styles.fileInput}
          />
        </div>
        {photoError && <p className={styles.photoError}>{photoError}</p>}
        <h1 className={styles.title}>{person?.name || 'Your Profile'}</h1>
        {synced && <span className={styles.syncBadge}>Synced</span>}
      </div>

      {/* Profile Completion Prompt */}
      {!isProfileComplete && (
        <div className={styles.completionCard}>
          <div className={styles.completionHeader}>
            <span className={styles.completionTitle}>Complete Your Profile</span>
            <span className={styles.completionPercent}>{profileCompletion}%</span>
          </div>
          <div className={styles.completionProgress}>
            <div
              className={styles.completionProgressFill}
              style={{ width: `${profileCompletion}%` }}
            />
          </div>
          <div className={styles.completionTasks}>
            <div className={`${styles.completionTask} ${styles.completionTaskDone}`}>
              <span className={styles.completionTaskIcon}>✓</span>
              <span>Create account</span>
            </div>
            <div className={`${styles.completionTask} ${hasName ? styles.completionTaskDone : ''}`}>
              <span className={styles.completionTaskIcon}>{hasName ? '✓' : '○'}</span>
              <span>Add display name</span>
              {!hasName && (
                <button
                  type="button"
                  className={styles.completionTaskBtn}
                  onClick={handleEditStart}
                >
                  Add
                </button>
              )}
            </div>
            <div className={`${styles.completionTask} ${hasPhoto ? styles.completionTaskDone : ''}`}>
              <span className={styles.completionTaskIcon}>{hasPhoto ? '✓' : '○'}</span>
              <span>Upload profile photo</span>
              {!hasPhoto && (
                <button
                  type="button"
                  className={styles.completionTaskBtn}
                  onClick={handlePhotoClick}
                >
                  Upload
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Badge Collection Card - Hive Style */}
      {(() => {
        // Combine earned and locked for preview
        const earnedSet = new Set(awards.map(a => a.icon))

        // Sort earned badges A-Z by name
        const sortedEarnedAwards = [...awards].sort((a, b) => a.name.localeCompare(b.name))

        // Sort locked badges A-Z by name
        const sortedLockedAwards = [...lockedAwards].sort((a, b) => a.name.localeCompare(b.name))

        // Helper to get context text for earned badge
        const getAwardContext = (award: Award): string | null => {
          if (award.event_title) {
            return award.event_title
          }
          if (award.context) {
            return award.context
          }
          return null
        }

        // Get up to 4 badges for hive preview - prioritize earned, then locked
        const previewBadges = [
          ...awards.slice(0, 4).map(a => ({ icon: a.icon, earned: true })),
          ...lockedAwards
            .filter(a => !earnedSet.has(a.icon))
            .slice(0, Math.max(0, 4 - awards.length))
            .map(a => ({ icon: a.icon, earned: false })),
        ].slice(0, 4)

        return (
          <>
            <div
              className={styles.badgeShowcase}
              onClick={() => !awardsLoading && setShowBadgeCollection(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowBadgeCollection(true) }}
            >
              {/* Badge Hive Preview */}
              <div className={styles.badgeHivePreview}>
                {previewBadges.map((badge, i) => (
                  <div key={badge.icon || i} className={styles.badgePreviewItem}>
                    {badge.icon ? (
                      <AnimatedBadge
                        icon={badge.icon}
                        size={36}
                        earned={badge.earned}
                        animate={false}
                      />
                    ) : (
                      <div className={styles.badgePlaceholder}>?</div>
                    )}
                  </div>
                ))}
                {previewBadges.length === 0 && (
                  <div className={styles.badgePlaceholder}>?</div>
                )}
              </div>

              {/* Info */}
              <div className={styles.badgeShowcaseInfo}>
                {awardsLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <span className={styles.badgeShowcaseTitle}>Badge Collection</span>
                    <span className={styles.badgeShowcaseCount}>
                      {awards.length} {awards.length === 1 ? 'badge' : 'badges'} earned
                      {currentStreak > 0 && ` · 🔥 ${currentStreak} streak`}
                    </span>
                  </>
                )}
              </div>

              {/* Chevron */}
              <span className={styles.badgeShowcaseChevron}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </div>

            {/* Badge Collection Modal */}
            {showBadgeCollection && (
              <div className={styles.badgeModalOverlay} onClick={() => setShowBadgeCollection(false)}>
                <div className={styles.badgeModal} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.badgeModalHeader}>
                    <h3 className={styles.badgeModalTitle}>Badge Collection</h3>
                    <button
                      className={styles.badgeModalClose}
                      onClick={() => setShowBadgeCollection(false)}
                    >
                      &times;
                    </button>
                  </div>

                  <div className={styles.badgeModalContent}>
                    {/* Unlocked Badges Section */}
                    {sortedEarnedAwards.length > 0 && (
                      <>
                        <div className={styles.badgeSectionHeader}>
                          <span className={styles.badgeSectionTitle}>Unlocked</span>
                          <span className={styles.badgeSectionCount}>{sortedEarnedAwards.length}</span>
                        </div>
                        {sortedEarnedAwards.map(award => {
                          const context = getAwardContext(award)
                          return (
                            <div key={award.id} className={styles.badgeModalItem}>
                              <div className={styles.badgeModalIconWrapper}>
                                <AnimatedBadge
                                  icon={award.icon || 'first_dip_round'}
                                  size={56}
                                  earned={true}
                                  animate={true}
                                />
                              </div>
                              <div className={styles.badgeModalDetails}>
                                <span className={styles.badgeModalName}>{award.name}</span>
                                <span className={styles.badgeModalDesc}>{award.description}</span>
                                <span className={styles.badgeModalEarnedDate}>
                                  ✓ {new Date(award.granted_at).toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                  {context && ` · ${context}`}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}

                    {/* Locked Badges Section */}
                    {sortedLockedAwards.length > 0 && (
                      <>
                        <div className={styles.badgeSectionHeader}>
                          <span className={styles.badgeSectionTitle}>Locked</span>
                          <span className={styles.badgeSectionCount}>{sortedLockedAwards.length}</span>
                        </div>
                        {sortedLockedAwards.map(award => (
                          <div key={award.id} className={styles.badgeModalItem}>
                            <div className={styles.badgeModalIconWrapper}>
                              <AnimatedBadge
                                icon={award.icon || 'first_dip_round'}
                                size={56}
                                earned={false}
                                animate={false}
                              />
                            </div>
                            <div className={styles.badgeModalDetails}>
                              <span className={styles.badgeModalName}>{award.name}</span>
                              <span className={styles.badgeModalDesc}>{award.description}</span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Fallback if no badges */}
                    {awards.length === 0 && lockedAwards.length === 0 && (
                      <div className={styles.badgeModalEmpty}>
                        <p>No badges available yet. Keep attending sessions to earn badges!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* Email Update Message */}
      {emailMessage && (
        <div className={emailMessage.type === 'success' ? styles.successMessage : styles.errorMessage}>
          {emailMessage.text}
          <button
            className={styles.dismissBtn}
            onClick={() => setEmailMessage(null)}
          >
            &times;
          </button>
        </div>
      )}

      {/* Profile Details Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Details</h2>
          {!isEditing && (
            <Button variant="ghost" size="sm" onClick={handleEditStart}>
              Edit
            </Button>
          )}
        </div>

        {isEditing ? (
          <div className={styles.editForm}>
            <FormField label="Name" htmlFor="edit-name">
              <Input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
            </FormField>
            <FormField label="Email" htmlFor="edit-email">
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Your email"
              />
            </FormField>
            {editEmail !== person?.email && (
              <p className={styles.emailHint}>
                Changing your email will require confirmation via the new address.
              </p>
            )}
            <div className={styles.editActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEditCancel}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleEditSave}
                loading={saving}
                disabled={!editName.trim() || !editEmail.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.details}>
            <div className={styles.row}>
              <span className={styles.label}>Name</span>
              <span className={styles.value}>{person?.name}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Email</span>
              <span className={styles.value}>{person?.email}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Member ID</span>
              <span className={styles.valueMono}>{person?.id}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Joined</span>
              <span className={styles.value}>
                {person?.created_at
                  ? new Date(person.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '--'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Club Membership Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Club Membership</h2>
        </div>
        {memberships.length > 0 ? (
          <div className={styles.details}>
            {memberships.map((membership) => (
              <div key={membership.id}>
                <div className={styles.row}>
                  <span className={styles.label}>Club</span>
                  <span className={styles.value}>{membership.club_name}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>Type</span>
                  <span className={styles.value} style={{ textTransform: 'capitalize' }}>
                    {membership.member_type}
                  </span>
                </div>
                {membership.joined_at && (
                  <div className={styles.row}>
                    <span className={styles.label}>Joined</span>
                    <span className={styles.value}>
                      {new Date(membership.joined_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {person?.pricing_category && (
                  <div className={styles.row}>
                    <span className={styles.label}>Pricing Category</span>
                    <span className={styles.value}>
                      {PRICING_CATEGORY_LABELS[person.pricing_category as PricingCategory] || person.pricing_category}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.placeholder}>
            <p>You're not a member of any club yet.</p>
          </div>
        )}
      </div>

      {/* Subscription Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Subscription</h2>
          {subscriptions.length > 0 && subscriptions[0].stripe_subscription_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={openBillingPortal}
              loading={openingPortal}
            >
              Manage
            </Button>
          )}
        </div>
        {subscriptions.length > 0 ? (
          <div className={styles.details}>
            {subscriptions.map((sub) => (
              <div key={sub.id}>
                <div className={styles.row}>
                  <span className={styles.label}>Plan</span>
                  <span className={styles.value}>{sub.plan_name}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>Price</span>
                  <span className={styles.value}>
                    {formatPrice(sub.price_cents, sub.currency, sub.cadence)}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>Sessions</span>
                  <span className={styles.value}>
                    {sub.weekly_sessions_allowed === -1 ? 'Unlimited' : sub.weekly_sessions_allowed} per week
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>Status</span>
                  <span className={`${styles.value} ${sub.status === 'active' ? styles.subscriptionActive : styles.subscriptionWarning}`}>
                    {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>Managed By</span>
                  {sub.stripe_subscription_id ? (
                    <span className={styles.value}>Stripe</span>
                  ) : (
                    <span className={styles.adminManagedBadge}>Club Admin</span>
                  )}
                </div>
                {sub.start_at && (
                  <div className={styles.row}>
                    <span className={styles.label}>Started</span>
                    <span className={styles.value}>
                      {new Date(sub.start_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {!sub.stripe_subscription_id && (
                  <div className={styles.adminNote}>
                    Your subscription is managed by your club admin. Contact them to make changes.
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.placeholder}>
            <p>No active subscription.</p>
            <Link to="/app/subscribe" className={styles.subscribeLink}>
              View membership plans
            </Link>
          </div>
        )}
      </div>

      {/* Notifications Card - iOS only */}
      {notificationsSupported && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Notifications</h2>
          </div>
          <div className={styles.details}>
            <div className={styles.row}>
              <span className={styles.label}>Status</span>
              <span className={styles.value}>
                {permissionStatus === 'granted' && (
                  <span className={styles.notificationEnabled}>Enabled</span>
                )}
                {permissionStatus === 'denied' && (
                  <span className={styles.notificationDenied}>Disabled</span>
                )}
                {permissionStatus === 'prompt' && (
                  <span className={styles.notificationPrompt}>Not set</span>
                )}
                {permissionStatus === 'unknown' && (
                  <span className={styles.notificationPrompt}>Checking...</span>
                )}
              </span>
            </div>
          </div>
          {permissionStatus === 'granted' ? (
            <div className={styles.notificationInfo}>
              <p>You'll receive notifications when you're invited to events.</p>
            </div>
          ) : permissionStatus === 'denied' ? (
            <div className={styles.notificationInfo}>
              <p>Notifications are disabled. To enable them, go to Settings &gt; DeepEvnts &gt; Notifications.</p>
            </div>
          ) : permissionStatus === 'prompt' ? (
            <div className={styles.notificationAction}>
              <p>Get notified when you're invited to events.</p>
              <Button
                size="sm"
                onClick={handleEnableNotifications}
                loading={requestingNotifications}
              >
                Enable Notifications
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* Account Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Account</h2>
        </div>
        <div className={styles.details}>
          <div className={styles.row}>
            <span className={styles.label}>Auth Provider</span>
            <span className={styles.value}>Email</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Auth ID</span>
            <span className={styles.valueMono}>{user?.id?.slice(0, 8)}...</span>
          </div>
        </div>
        <div className={styles.signOutSection}>
          <Button
            variant="secondary"
            onClick={handleSignOut}
            loading={signingOut}
          >
            Sign Out
          </Button>
        </div>
      </div>

      {/* Deep End */}
      <div className={`${styles.card} ${styles.dangerCard}`}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Deep End</h2>
        </div>
        <div className={styles.dangerContent}>
          <p className={styles.dangerText}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Account
          </Button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Delete Account?</h3>
            <p className={styles.confirmMessage}>
              This will permanently delete your account. You will lose access to:
            </p>
            <ul className={styles.confirmList}>
              <li>Your profile and membership</li>
              <li>Event history and RSVPs</li>
              <li>Any active subscriptions</li>
            </ul>
            <p className={styles.confirmMessage}>
              <strong>This action cannot be undone.</strong>
            </p>
            <div className={styles.confirmInput}>
              <label htmlFor="delete-confirm">Type DELETE to confirm:</label>
              <Input
                id="delete-confirm"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                placeholder="DELETE"
                disabled={deleting}
              />
            </div>
            {deleteError && (
              <p className={styles.confirmError}>{deleteError}</p>
            )}
            <div className={styles.confirmActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                  setDeleteError(null)
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteAccount}
                loading={deleting}
                disabled={deleteConfirmText !== 'DELETE'}
              >
                Delete My Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {cropperImage && (
        <ImageCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          saving={uploadingPhoto}
        />
      )}
    </div>
  )
}
