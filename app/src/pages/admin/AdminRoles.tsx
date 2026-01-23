/**
 * AdminRoles Page
 *
 * Manage club roles and permissions.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { useAdminRoles } from '@/hooks/useAdminRoles'
import { useAdminMembers } from '@/hooks/useAdminMembers'
import { Spinner } from '@/components'
import type { AdminRole, RoleMember, AdminMember } from '@/lib/api'
import styles from './AdminRoles.module.css'

// Available permissions
const AVAILABLE_PERMISSIONS = [
  { key: 'members.view', label: 'View Members', description: 'See member list and details' },
  { key: 'members.edit', label: 'Edit Members', description: 'Update member information' },
  { key: 'events.create', label: 'Create Events', description: 'Create new events' },
  { key: 'events.edit', label: 'Edit Events', description: 'Modify existing events' },
  { key: 'teams.assign', label: 'Assign Teams', description: 'Assign players to teams' },
  { key: 'billing.view', label: 'View Billing', description: 'See financial information' },
  { key: 'roles.manage', label: 'Manage Roles', description: 'Create and edit roles' },
]

// Helper to safely parse permissions
function parsePermissions(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Role card component
function RoleCard({
  role,
  onEdit,
  onManageMembers,
}: {
  role: AdminRole
  onEdit: () => void
  onManageMembers: () => void
}) {
  const permissions = parsePermissions(role.permissions_json)
  const isAdmin = role.role_key === 'admin'

  return (
    <div className={styles.roleCard}>
      <div className={styles.roleHeader}>
        <div>
          <h3 className={styles.roleName}>{role.name}</h3>
          <span className={styles.roleKey}>{role.role_key}</span>
        </div>
        <span className={styles.memberCount}>
          {role.member_count} {role.member_count === 1 ? 'member' : 'members'}
        </span>
      </div>

      <div className={styles.rolePermissions}>
        {isAdmin ? (
          <span className={styles.allPermissions}>All permissions</span>
        ) : permissions.length === 0 ? (
          <span className={styles.noPermissions}>No specific permissions</span>
        ) : (
          <div className={styles.permissionTags}>
            {permissions.slice(0, 3).map((p) => (
              <span key={p} className={styles.permissionTag}>
                {AVAILABLE_PERMISSIONS.find((ap) => ap.key === p)?.label || p}
              </span>
            ))}
            {permissions.length > 3 && (
              <span className={styles.permissionMore}>+{permissions.length - 3} more</span>
            )}
          </div>
        )}
      </div>

      <div className={styles.roleActions}>
        <button className={styles.btnSecondary} onClick={onManageMembers}>
          Manage Members
        </button>
        {!isAdmin && (
          <button className={styles.btnSecondary} onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
    </div>
  )
}

// Create/Edit role modal
function RoleModal({
  role,
  onSave,
  onClose,
  onDelete,
  saving,
}: {
  role: AdminRole | null
  onSave: (roleKey: string, name: string, permissions: string[]) => void
  onClose: () => void
  onDelete?: () => void
  saving: boolean
}) {
  const isEdit = !!role
  const [roleKey, setRoleKey] = useState(role?.role_key || '')
  const [name, setName] = useState(role?.name || '')
  const [permissions, setPermissions] = useState<string[]>(
    role ? parsePermissions(role.permissions_json) : []
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const togglePermission = (key: string) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!roleKey || !name) return
    onSave(roleKey, name, permissions)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? 'Edit Role' : 'Create Role'}</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Role Key</label>
              <input
                type="text"
                className={styles.formInput}
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value.toLowerCase().replace(/[^a-z_]/g, ''))}
                placeholder="e.g. coach, captain"
                disabled={isEdit}
                required
              />
              <span className={styles.formHint}>Lowercase letters and underscores only</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Display Name</label>
              <input
                type="text"
                className={styles.formInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Coach, Team Captain"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Permissions</label>
              <div className={styles.permissionsList}>
                {AVAILABLE_PERMISSIONS.map((perm) => (
                  <label key={perm.key} className={styles.permissionItem}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(perm.key)}
                      onChange={() => togglePermission(perm.key)}
                    />
                    <div>
                      <span className={styles.permissionLabel}>{perm.label}</span>
                      <span className={styles.permissionDesc}>{perm.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.modalFooter}>
            {isEdit && onDelete && (
              <>
                {confirmDelete ? (
                  <div className={styles.deleteConfirm}>
                    <span>Delete this role?</span>
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
                    Delete Role
                  </button>
                )}
              </>
            )}
            <div className={styles.modalFooterRight}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : 'Create Role'}
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
  role,
  roleMembers,
  allMembers,
  onAssign,
  onRemove,
  onClose,
  saving,
}: {
  role: AdminRole
  roleMembers: RoleMember[]
  allMembers: AdminMember[]
  onAssign: (personId: string) => void
  onRemove: (personId: string) => void
  onClose: () => void
  saving: boolean
}) {
  const [search, setSearch] = useState('')

  const roleMemberIds = new Set(roleMembers.map((m) => m.person_id))
  const availableMembers = allMembers.filter((m) => !roleMemberIds.has(m.person_id))
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
          <h3>Manage {role.name} Members</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Current members */}
          <div className={styles.membersSection}>
            <h4 className={styles.sectionTitle}>
              Current Members ({roleMembers.length})
            </h4>
            {roleMembers.length === 0 ? (
              <p className={styles.emptyText}>No members with this role</p>
            ) : (
              <div className={styles.memberList}>
                {roleMembers.map((member) => (
                  <div key={member.person_id} className={styles.memberItem}>
                    <div>
                      <div className={styles.memberName}>{member.name}</div>
                      <div className={styles.memberEmail}>{member.email}</div>
                    </div>
                    <button
                      className={styles.btnRemove}
                      onClick={() => onRemove(member.person_id)}
                      disabled={saving}
                      title="Remove from role"
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
                    onClick={() => onAssign(member.person_id)}
                    disabled={saving}
                    title="Add to role"
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

export function AdminRoles() {
  const { memberships, loading: profileLoading } = useProfile()
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const { roles, loading, error, saving, createRole, updateRole, deleteRole, getRoleMembers, assignMember, removeMember } =
    useAdminRoles({ clubId })

  const { members: allMembers } = useAdminMembers({ clubId })

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null)
  const [managingRole, setManagingRole] = useState<AdminRole | null>(null)
  const [roleMembers, setRoleMembers] = useState<RoleMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Load role members when managing
  useEffect(() => {
    if (managingRole) {
      setLoadingMembers(true)
      getRoleMembers(managingRole.role_key)
        .then(setRoleMembers)
        .catch(console.error)
        .finally(() => setLoadingMembers(false))
    }
  }, [managingRole, getRoleMembers])

  const handleCreateRole = async (roleKey: string, name: string, permissions: string[]) => {
    try {
      await createRole(roleKey, name, permissions)
      setShowCreateModal(false)
    } catch (err) {
      console.error('Failed to create role:', err)
    }
  }

  const handleUpdateRole = async (roleKey: string, name: string, permissions: string[]) => {
    try {
      await updateRole(roleKey, name, permissions)
      setEditingRole(null)
    } catch (err) {
      console.error('Failed to update role:', err)
    }
  }

  const handleDeleteRole = async () => {
    if (!editingRole) return
    try {
      await deleteRole(editingRole.role_key)
      setEditingRole(null)
    } catch (err) {
      console.error('Failed to delete role:', err)
    }
  }

  const handleAssignMember = async (personId: string) => {
    if (!managingRole) return
    try {
      await assignMember(managingRole.role_key, personId)
      const members = await getRoleMembers(managingRole.role_key)
      setRoleMembers(members)
    } catch (err) {
      console.error('Failed to assign member:', err)
    }
  }

  const handleRemoveMember = async (personId: string) => {
    if (!managingRole) return
    try {
      await removeMember(managingRole.role_key, personId)
      const members = await getRoleMembers(managingRole.role_key)
      setRoleMembers(members)
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  // Loading state
  if (profileLoading || (loading && roles.length === 0)) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" />
          <p>Loading roles...</p>
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
          <h1 className={styles.title}>Roles</h1>
        </div>
        <div className={styles.error}>
          <div className={styles.errorIcon}>!</div>
          <h2>Unable to load roles</h2>
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
        <h1 className={styles.title}>Roles</h1>
        <p className={styles.subtitle}>Manage roles and permissions</p>
      </div>

      {/* Create button */}
      <div className={styles.actions}>
        <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
          + Create Role
        </button>
      </div>

      {/* Roles list */}
      <div className={styles.rolesList}>
        {roles.length === 0 ? (
          <div className={styles.empty}>
            <p>No roles created yet</p>
          </div>
        ) : (
          roles.map((role) => (
            <RoleCard
              key={role.role_key}
              role={role}
              onEdit={() => setEditingRole(role)}
              onManageMembers={() => setManagingRole(role)}
            />
          ))
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <RoleModal
          role={null}
          onSave={handleCreateRole}
          onClose={() => setShowCreateModal(false)}
          saving={saving}
        />
      )}

      {/* Edit modal */}
      {editingRole && (
        <RoleModal
          role={editingRole}
          onSave={handleUpdateRole}
          onClose={() => setEditingRole(null)}
          onDelete={handleDeleteRole}
          saving={saving}
        />
      )}

      {/* Members modal */}
      {managingRole && !loadingMembers && (
        <MembersModal
          role={managingRole}
          roleMembers={roleMembers}
          allMembers={allMembers}
          onAssign={handleAssignMember}
          onRemove={handleRemoveMember}
          onClose={() => setManagingRole(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
