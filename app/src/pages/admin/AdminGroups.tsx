/**
 * AdminGroups Page
 *
 * Manage groups, squads, and teams.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { useAdminGroups } from '@/hooks/useAdminGroups'
import { useAdminMembers } from '@/hooks/useAdminMembers'
import { Spinner } from '@/components'
import type { AdminGroup, GroupMember, AdminMember } from '@/lib/api'
import styles from './AdminGroups.module.css'

// Group kind labels
const KIND_LABELS: Record<string, string> = {
  team: 'Team',
  squad: 'Squad',
  committee: 'Committee',
  other: 'Other',
}

// Group kind colors
const KIND_COLORS: Record<string, string> = {
  team: 'var(--color-water)',
  squad: 'var(--color-success)',
  committee: 'var(--color-warning)',
  other: 'var(--grey-500)',
}

// Group card component
function GroupCard({
  group,
  onEdit,
  onManageMembers,
}: {
  group: AdminGroup
  onEdit: () => void
  onManageMembers: () => void
}) {
  return (
    <div className={styles.groupCard}>
      <div
        className={styles.groupKindBadge}
        style={{ backgroundColor: KIND_COLORS[group.kind] || KIND_COLORS.other }}
      >
        {KIND_LABELS[group.kind] || group.kind}
      </div>

      <div className={styles.groupHeader}>
        <h3 className={styles.groupName}>{group.name}</h3>
        <span className={styles.memberCount}>
          {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
        </span>
      </div>

      {group.description && (
        <p className={styles.groupDesc}>{group.description}</p>
      )}

      <div className={styles.groupActions}>
        <button className={styles.btnSecondary} onClick={onManageMembers}>
          Manage Members
        </button>
        <button className={styles.btnSecondary} onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
  )
}

// Create/Edit group modal
function GroupModal({
  group,
  onSave,
  onClose,
  onDelete,
  saving,
}: {
  group: AdminGroup | null
  onSave: (name: string, kind: string, description: string) => void
  onClose: () => void
  onDelete?: () => void
  saving: boolean
}) {
  const isEdit = !!group
  const [name, setName] = useState(group?.name || '')
  const [kind, setKind] = useState(group?.kind || 'team')
  const [description, setDescription] = useState(group?.description || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    onSave(name, kind, description)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? 'Edit Group' : 'Create Group'}</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Name</label>
              <input
                type="text"
                className={styles.formInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. A Team, Development Squad"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Type</label>
              <select
                className={styles.formInput}
                value={kind}
                onChange={(e) => setKind(e.target.value as 'team' | 'squad' | 'committee' | 'other')}
              >
                <option value="team">Team (e.g. A Team, B Team)</option>
                <option value="squad">Squad (e.g. Development, Competition)</option>
                <option value="committee">Committee</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                className={styles.formTextarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            {isEdit && onDelete && (
              <>
                {confirmDelete ? (
                  <div className={styles.deleteConfirm}>
                    <span>Delete this group?</span>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={onDelete}
                      disabled={saving}
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.btnDangerOutline}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete Group
                  </button>
                )}
              </>
            )}
            <div className={styles.modalFooterRight}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : 'Create Group'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// Manage members modal
function MembersModal({
  group,
  groupMembers,
  allMembers,
  onAdd,
  onRemove,
  onClose,
  saving,
}: {
  group: AdminGroup
  groupMembers: GroupMember[]
  allMembers: AdminMember[]
  onAdd: (personId: string) => void
  onRemove: (personId: string) => void
  onClose: () => void
  saving: boolean
}) {
  const [search, setSearch] = useState('')

  const memberIds = new Set(groupMembers.map((m) => m.person_id))
  const availableMembers = allMembers.filter((m) => !memberIds.has(m.person_id))
  const filteredAvailable = search
    ? availableMembers.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.email.toLowerCase().includes(search.toLowerCase())
      )
    : availableMembers

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Manage {group.name} Members</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Current members */}
          <div className={styles.membersSection}>
            <h4 className={styles.sectionTitle}>
              Current Members ({groupMembers.length})
            </h4>
            {groupMembers.length === 0 ? (
              <p className={styles.emptyText}>No members in this group</p>
            ) : (
              <div className={styles.memberList}>
                {groupMembers.map((member) => (
                  <div key={member.person_id} className={styles.memberItem}>
                    <div>
                      <div className={styles.memberName}>{member.name}</div>
                      <div className={styles.memberEmail}>{member.email}</div>
                    </div>
                    <button
                      className={styles.btnRemove}
                      onClick={() => onRemove(member.person_id)}
                      disabled={saving}
                      title="Remove from group"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add members */}
          <div className={styles.membersSection}>
            <h4 className={styles.sectionTitle}>Add Members</h4>
            <input
              type="text"
              className={styles.formInput}
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.memberList}>
              {filteredAvailable.slice(0, 10).map((member) => (
                <div key={member.person_id} className={styles.memberItem}>
                  <div>
                    <div className={styles.memberName}>{member.name}</div>
                    <div className={styles.memberEmail}>{member.email}</div>
                  </div>
                  <button
                    className={styles.btnAdd}
                    onClick={() => onAdd(member.person_id)}
                    disabled={saving}
                    title="Add to group"
                  >
                    +
                  </button>
                </div>
              ))}
              {filteredAvailable.length > 10 && (
                <p className={styles.moreText}>
                  +{filteredAvailable.length - 10} more (search to filter)
                </p>
              )}
              {filteredAvailable.length === 0 && (
                <p className={styles.emptyText}>No available members found</p>
              )}
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnPrimary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminGroups() {
  const { memberships, loading: profileLoading } = useProfile()
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const {
    groups,
    loading,
    error,
    saving,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupMembers,
    addMember,
    removeMember,
  } = useAdminGroups({ clubId })

  const { members: allMembers } = useAdminMembers({ clubId })

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null)
  const [managingGroup, setManagingGroup] = useState<AdminGroup | null>(null)
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Load group members when managing
  useEffect(() => {
    if (managingGroup) {
      setLoadingMembers(true)
      getGroupMembers(managingGroup.id)
        .then(setGroupMembers)
        .catch(console.error)
        .finally(() => setLoadingMembers(false))
    }
  }, [managingGroup, getGroupMembers])

  const handleCreateGroup = async (name: string, kind: string, description: string) => {
    try {
      await createGroup({
        name,
        kind: kind as 'team' | 'committee' | 'squad' | 'other',
        description: description || undefined,
      })
      setShowCreateModal(false)
    } catch (err) {
      console.error('Failed to create group:', err)
    }
  }

  const handleUpdateGroup = async (name: string, kind: string, description: string) => {
    if (!editingGroup) return
    try {
      await updateGroup(editingGroup.id, {
        name,
        kind: kind as 'team' | 'committee' | 'squad' | 'other',
        description: description || undefined,
      })
      setEditingGroup(null)
    } catch (err) {
      console.error('Failed to update group:', err)
    }
  }

  const handleDeleteGroup = async () => {
    if (!editingGroup) return
    try {
      await deleteGroup(editingGroup.id)
      setEditingGroup(null)
    } catch (err) {
      console.error('Failed to delete group:', err)
    }
  }

  const handleAddMember = async (personId: string) => {
    if (!managingGroup) return
    try {
      await addMember(managingGroup.id, personId)
      const members = await getGroupMembers(managingGroup.id)
      setGroupMembers(members)
    } catch (err) {
      console.error('Failed to add member:', err)
    }
  }

  const handleRemoveMember = async (personId: string) => {
    if (!managingGroup) return
    try {
      await removeMember(managingGroup.id, personId)
      const members = await getGroupMembers(managingGroup.id)
      setGroupMembers(members)
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  // Group groups by kind
  const groupsByKind = groups.reduce(
    (acc, group) => {
      const kind = group.kind || 'other'
      if (!acc[kind]) acc[kind] = []
      acc[kind].push(group)
      return acc
    },
    {} as Record<string, AdminGroup[]>
  )

  // Loading state
  if (profileLoading || (loading && groups.length === 0)) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" />
          <p>Loading groups...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link to="/app/admin" className={styles.backLink}>
            &larr; Back to Admin
          </Link>
          <h1 className={styles.title}>Groups</h1>
        </div>
        <div className={styles.error}>
          <div className={styles.errorIcon}>!</div>
          <h2>Unable to load groups</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link to="/app/admin" className={styles.backLink}>
          &larr; Back to Admin
        </Link>
        <h1 className={styles.title}>Groups</h1>
        <p className={styles.subtitle}>Manage teams, squads, and member groups</p>
      </div>

      {/* Create button */}
      <div className={styles.actions}>
        <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
          + Create Group
        </button>
      </div>

      {/* Groups list by kind */}
      {groups.length === 0 ? (
        <div className={styles.empty}>
          <p>No groups created yet</p>
          <p className={styles.emptyHint}>
            Create groups like "A Team", "B Team", or "Development Squad" to organize members
          </p>
        </div>
      ) : (
        <>
          {Object.entries(groupsByKind).map(([kind, kindGroups]) => (
            <section key={kind} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {KIND_LABELS[kind] || kind}s
              </h2>
              <div className={styles.groupsList}>
                {kindGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onEdit={() => setEditingGroup(group)}
                    onManageMembers={() => setManagingGroup(group)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <GroupModal
          group={null}
          onSave={handleCreateGroup}
          onClose={() => setShowCreateModal(false)}
          saving={saving}
        />
      )}

      {/* Edit modal */}
      {editingGroup && (
        <GroupModal
          group={editingGroup}
          onSave={handleUpdateGroup}
          onClose={() => setEditingGroup(null)}
          onDelete={handleDeleteGroup}
          saving={saving}
        />
      )}

      {/* Members modal */}
      {managingGroup && !loadingMembers && (
        <MembersModal
          group={managingGroup}
          groupMembers={groupMembers}
          allMembers={allMembers}
          onAdd={handleAddMember}
          onRemove={handleRemoveMember}
          onClose={() => setManagingGroup(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
