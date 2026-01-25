/**
 * API client for D1 database operations via Cloudflare Pages Functions
 */

import { supabase } from './supabase'
import type { Person, Club, ClubMembership, ClubMemberRole, EventWithRsvp, EventRsvp, RsvpResponse as RsvpResponseType } from '@/types/database'

// Use full URL for Capacitor (iOS), relative for web
const isCapacitor = typeof window !== 'undefined' &&
  (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

const API_BASE = isCapacitor
  ? 'https://wwuwh.com/api'  // Production API for iOS app
  : '/api'                    // Relative path for web

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
  timestamp: string
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

/**
 * Make an authenticated API request
 * Automatically includes the Supabase access token in headers
 */
export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body } = options

  // Get current session for auth header
  const { data: { session } } = await supabase.auth.getSession()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  // Include auth token if available
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const json: ApiResponse<T> = await response.json()

  if (!response.ok || !json.ok) {
    throw new Error(json.error || `API error: ${response.status}`)
  }

  return json.data as T
}

// ============================================
// Health Check
// ============================================

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  checks: {
    api: boolean
    d1: boolean
    tables?: {
      clubs: number
      people: number
      events: number
    }
  }
  latency_ms: number
}

export async function checkHealth(): Promise<HealthResponse> {
  // Health endpoint doesn't require auth
  const response = await fetch(`${API_BASE}/health`)
  const json: ApiResponse<HealthResponse> = await response.json()
  return json.data as HealthResponse
}

// ============================================
// User Profile (STAGE 4)
// ============================================

export interface ClubMembershipWithName extends ClubMembership {
  club_name: string
}

export interface ClubMemberRoleWithName extends ClubMemberRole {
  role_name: string
  permissions_json: string
}

export interface MemberSubscriptionWithPlan {
  id: string
  club_id: string
  person_id: string
  plan_id: string
  status: string
  start_at: string
  end_at: string | null
  stripe_subscription_id: string | null
  plan_name: string
  price_cents: number
  currency: string
  cadence: string
  weekly_sessions_allowed: number
}

export interface ProfileResponse {
  person: Person
  memberships?: ClubMembershipWithName[]
  roles?: ClubMemberRoleWithName[]
  subscriptions?: MemberSubscriptionWithPlan[]
}

export async function getMyProfile(): Promise<ProfileResponse> {
  return api<ProfileResponse>('/me')
}

export async function ensureProfile(name?: string): Promise<ProfileResponse & { created?: boolean }> {
  return api<ProfileResponse & { created?: boolean }>('/me', {
    method: 'POST',
    body: name ? { name } : {},
  })
}

export interface UpdateProfileRequest {
  name?: string
  email?: string
  photo_url?: string | null
}

export async function updateProfile(data: UpdateProfileRequest): Promise<ProfileResponse> {
  return api<ProfileResponse>('/me', {
    method: 'POST',
    body: data,
  })
}

export async function deleteAccount(): Promise<{ success: boolean; message: string }> {
  return api<{ success: boolean; message: string }>('/me', {
    method: 'DELETE',
    body: { confirm: true },
  })
}

// ============================================
// Clubs (STAGE 5+)
// ============================================

export interface ClubResponse {
  club: Club
  // membership?: ClubMembership
  // member_count?: number
}

export async function getClub(clubId: string): Promise<ClubResponse> {
  return api<ClubResponse>(`/clubs/${clubId}`)
}

// ============================================
// Events (STAGE 5+)
// ============================================

export interface EventsListParams {
  club_id: string
  from?: string
  to?: string
  status?: 'scheduled' | 'cancelled' | 'completed'
  kind?: 'session' | 'match' | 'tournament' | 'social' | 'other'
  limit?: number
}

export interface SubscriptionInfo {
  status: string
  plan_name: string
  weekly_sessions_allowed: number
}

export interface EventsResponse {
  events: EventWithRsvp[]
  subscription: SubscriptionInfo | null
  member_type: 'member' | 'guest'
}

export async function listEvents(params: EventsListParams): Promise<EventsResponse> {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value))
    }
  })
  return api<EventsResponse>(`/events?${searchParams}`)
}

export interface EventRsvpResponse {
  rsvp: EventRsvp | null
}

export async function getEventRsvp(eventId: string): Promise<EventRsvpResponse> {
  return api<EventRsvpResponse>(`/events/${eventId}/rsvp`)
}

export interface SetEventRsvpOptions {
  response: RsvpResponseType
  note?: string
  confirm_late_cancel?: boolean
}

export interface SetEventRsvpResult {
  rsvp?: EventRsvp | null
  subscription_used?: boolean
  late_cancellation?: boolean
  // When requires_confirmation is true, user must confirm before proceeding
  requires_confirmation?: boolean
  team_name?: string
  message?: string
}

export async function setEventRsvp(
  eventId: string,
  options: SetEventRsvpOptions
): Promise<SetEventRsvpResult> {
  const { data: { session } } = await supabase.auth.getSession()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const res = await fetch(`${API_BASE}/events/${eventId}/rsvp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  })

  const json = await res.json()

  // 409 means confirmation required (user is on a team)
  // Response is wrapped in { ok, data, timestamp } format
  if (res.status === 409 && json.data?.requires_confirmation) {
    return json.data as SetEventRsvpResult
  }

  if (!res.ok) {
    throw new Error(json.error || json.data?.error || 'Failed to update RSVP')
  }

  return json.data as SetEventRsvpResult
}

export interface Attendee {
  person_id: string
  name: string
  photo_url: string | null
  response: 'yes' | 'no' | 'maybe'
  responded_at: string
}

export interface EventAttendeesResponse {
  attendees: {
    yes: Attendee[]
    maybe: Attendee[]
    no: Attendee[]
  }
  counts: {
    yes: number
    maybe: number
    no: number
  }
}

export async function getEventAttendees(eventId: string): Promise<EventAttendeesResponse> {
  return api<EventAttendeesResponse>(`/events/${eventId}/attendees`)
}

// ============================================
// Payments (STAGE 5b)
// ============================================

export interface CheckoutResponse {
  checkout_url: string
  session_id: string
}

export async function createCheckout(eventId: string): Promise<CheckoutResponse> {
  // Pass the current origin so redirects come back to the right place
  // (Vite dev server vs production)
  const origin = window.location.origin
  return api<CheckoutResponse>('/checkout', {
    method: 'POST',
    body: {
      event_id: eventId,
      success_url: `${origin}/app/events?payment=success&event_id=${eventId}`,
      cancel_url: `${origin}/app/events?payment=cancelled`,
    },
  })
}

// Payment Intent (Cash/BACS)
export type PaymentMethod = 'cash' | 'bank_transfer'

export interface PaymentIntentResponse {
  success: boolean
  method: PaymentMethod
  reference: string | null
  bank_details: {
    account_name: string
    sort_code: string
    account_number: string
  } | null
  amount_cents: number
  currency: string
}

export interface PaymentStatusResponse {
  paid: boolean
  payment: {
    id: string
    status: string
    source: string
    amount_cents: number
    currency: string
    reference: string | null
    created_at: string
    effective_at: string | null
  } | null
}

export async function getPaymentStatus(eventId: string): Promise<PaymentStatusResponse> {
  return api<PaymentStatusResponse>(`/events/${eventId}/payment`)
}

export async function recordPaymentIntent(
  eventId: string,
  method: PaymentMethod
): Promise<PaymentIntentResponse> {
  return api<PaymentIntentResponse>(`/events/${eventId}/payment`, {
    method: 'POST',
    body: { method },
  })
}

export async function cancelPaymentIntent(eventId: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/events/${eventId}/payment`, {
    method: 'DELETE',
  })
}

// ============================================
// Billing Plans & Subscriptions
// ============================================

export interface BillingPlan {
  id: string
  name: string
  price_cents: number
  currency: string
  cadence: string
  weekly_sessions_allowed: number
  stripe_price_id: string | null
}

export interface BillingPlansResponse {
  plans: BillingPlan[]
}

export async function listBillingPlans(clubId: string): Promise<BillingPlansResponse> {
  return api<BillingPlansResponse>(`/billing-plans?club_id=${clubId}`)
}

export interface SubscribeResponse {
  checkout_url: string
  session_id: string
}

export async function createSubscription(planId: string): Promise<SubscribeResponse> {
  const origin = window.location.origin
  return api<SubscribeResponse>('/subscribe', {
    method: 'POST',
    body: {
      plan_id: planId,
      success_url: `${origin}/app/subscribe?success=true&plan_id=${planId}`,
      cancel_url: `${origin}/app/subscribe?cancelled=true`,
    },
  })
}

export interface BillingPortalResponse {
  url: string
}

export async function createBillingPortalSession(): Promise<BillingPortalResponse> {
  const origin = window.location.origin
  return api<BillingPortalResponse>('/billing-portal', {
    method: 'POST',
    body: {
      return_url: `${origin}/app/subscribe`,
    },
  })
}

// ============================================
// Event Teams
// ============================================

export interface EventTeam {
  id: string
  event_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface TeamAssignment {
  event_id: string
  person_id: string
  team_id: string | null
  activity: 'play' | 'swim_sets' | 'not_playing' | 'other'
  position_code: 'F' | 'W' | 'C' | 'B' | null
  notes: string | null
  assigned_at: string
  person_name: string
  person_email: string
  person_photo_url: string | null
  attendance_status: 'present' | 'absent' | 'late' | 'excused' | null
  cancelled_late: boolean
}

export interface TeamWithAssignments extends EventTeam {
  assignments: TeamAssignment[]
}

export interface AvailablePlayer {
  person_id: string
  response: string
  person_name: string
  person_email: string
  person_photo_url: string | null
}

export interface EventTeamsResponse {
  event: {
    id: string
    title: string
    starts_at_utc: string
  }
  teams: TeamWithAssignments[]
  unassigned: TeamAssignment[]
  available_players: AvailablePlayer[]
  total_assigned: number
  total_rsvp_yes: number
}

export async function getEventTeams(eventId: string, clubId: string): Promise<EventTeamsResponse> {
  return api<EventTeamsResponse>(`/events/${eventId}/teams?club_id=${clubId}`)
}

export interface CreateTeamsRequest {
  club_id: string
  teams: Array<{ id?: string; name: string; sort_order?: number }>
}

export interface CreateTeamsResponse {
  teams: EventTeam[]
}

export async function createEventTeams(eventId: string, request: CreateTeamsRequest): Promise<CreateTeamsResponse> {
  return api<CreateTeamsResponse>(`/events/${eventId}/teams`, {
    method: 'POST',
    body: request,
  })
}

export interface AssignmentUpdate {
  person_id: string
  team_id: string | null
  activity: 'play' | 'swim_sets' | 'not_playing' | 'other'
  position_code?: 'F' | 'W' | 'C' | 'B' | null
  notes?: string | null
  attendance_status?: 'present' | 'absent' | 'late' | 'excused' | null
}

export interface UpdateAssignmentsRequest {
  club_id: string
  assignments: AssignmentUpdate[]
}

export interface UpdateAssignmentsResponse {
  success: boolean
  updated: number
  assignments: Array<{
    person_id: string
    team_id: string | null
    activity: string
    position_code: string | null
    attendance_status: string | null
  }>
}

export async function updateTeamAssignments(
  eventId: string,
  request: UpdateAssignmentsRequest
): Promise<UpdateAssignmentsResponse> {
  return api<UpdateAssignmentsResponse>(`/events/${eventId}/teams/assignments`, {
    method: 'POST',
    body: request,
  })
}

export async function removeTeamAssignment(
  eventId: string,
  clubId: string,
  personId: string
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/events/${eventId}/teams/assignments`, {
    method: 'DELETE',
    body: { club_id: clubId, person_id: personId },
  })
}

// ============================================
// Admin - Members
// ============================================

export interface AdminMember {
  id: string
  person_id: string
  name: string
  email: string
  member_type: 'member' | 'guest'
  status: string
  joined_at: string | null
  subscription_status: string | null
  subscription_plan: string | null
  sessions_attended: number
  sessions_total: number
  last_attended: string | null
}

export interface AdminMembersStats {
  total_members: number
  active_members: number
  active_subscriptions: number
  guests: number
  period_sessions: number
}

export interface AdminMembersResponse {
  members: AdminMember[]
  stats: AdminMembersStats
}

export interface AdminMembersParams {
  club_id: string
  search?: string
  status?: string
}

export async function getAdminMembers(params: AdminMembersParams): Promise<AdminMembersResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('club_id', params.club_id)
  if (params.search) searchParams.set('search', params.search)
  if (params.status) searchParams.set('status', params.status)
  return api<AdminMembersResponse>(`/admin/members?${searchParams}`)
}

// ============================================
// Admin - Roles
// ============================================

export interface AdminRole {
  club_id: string
  role_key: string
  name: string
  permissions_json: string
  member_count: number
}

export interface RoleMember {
  person_id: string
  name: string
  email: string
  assigned_at: string
}

export interface AdminRolesResponse {
  roles: AdminRole[]
}

export interface RoleDetailResponse {
  role: AdminRole
  members: RoleMember[]
}

export async function getAdminRoles(clubId: string): Promise<AdminRolesResponse> {
  return api<AdminRolesResponse>(`/admin/roles?club_id=${clubId}`)
}

export async function getAdminRoleDetail(clubId: string, roleKey: string): Promise<RoleDetailResponse> {
  return api<RoleDetailResponse>(`/admin/roles?club_id=${clubId}&role_key=${roleKey}`)
}

export interface CreateRoleRequest {
  club_id: string
  role_key: string
  name: string
  permissions?: string[]
}

export async function createAdminRole(request: CreateRoleRequest): Promise<{ role: AdminRole }> {
  return api<{ role: AdminRole }>('/admin/roles', {
    method: 'POST',
    body: request,
  })
}

export interface UpdateRoleRequest {
  club_id: string
  role_key: string
  name?: string
  permissions?: string[]
}

export async function updateAdminRole(request: UpdateRoleRequest): Promise<{ role: AdminRole }> {
  return api<{ role: AdminRole }>('/admin/roles', {
    method: 'PUT',
    body: request,
  })
}

export async function deleteAdminRole(clubId: string, roleKey: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>('/admin/roles', {
    method: 'DELETE',
    body: { club_id: clubId, role_key: roleKey },
  })
}

export async function assignRoleToMember(
  clubId: string,
  roleKey: string,
  personId: string
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>('/admin/role-members', {
    method: 'POST',
    body: { club_id: clubId, role_key: roleKey, person_id: personId },
  })
}

export async function removeRoleFromMember(
  clubId: string,
  roleKey: string,
  personId: string
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>('/admin/role-members', {
    method: 'DELETE',
    body: { club_id: clubId, role_key: roleKey, person_id: personId },
  })
}

// ============================================
// Admin - Events
// ============================================

export interface AdminEvent {
  id: string
  club_id: string
  series_id: string | null
  kind: 'session' | 'match' | 'tournament' | 'social' | 'other'
  title: string
  description: string | null
  location: string | null
  starts_at_utc: string
  ends_at_utc: string
  timezone: string
  capacity: number | null
  status: 'scheduled' | 'cancelled' | 'completed'
  payment_mode: 'included' | 'one_off' | 'free'
  fee_cents: number | null
  currency: string
  visible_from: string | null
  created_at: string
  updated_at: string
  rsvp_yes_count?: number
  rsvp_no_count?: number
  rsvp_maybe_count?: number
  series_title?: string
}

export interface AdminEventsResponse {
  events: AdminEvent[]
}

export interface AdminEventsParams {
  club_id: string
  from?: string
  to?: string
  status?: 'scheduled' | 'cancelled' | 'completed'
  limit?: number
}

export async function getAdminEvents(params: AdminEventsParams): Promise<AdminEventsResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('club_id', params.club_id)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.status) searchParams.set('status', params.status)
  if (params.limit) searchParams.set('limit', String(params.limit))
  return api<AdminEventsResponse>(`/admin/events?${searchParams}`)
}

export interface CreateEventRequest {
  club_id: string
  title: string
  description?: string
  location?: string
  kind?: 'session' | 'match' | 'tournament' | 'social' | 'other' | 'training' | 'ladies'
  starts_at_utc: string
  ends_at_utc: string
  timezone?: string
  capacity?: number
  payment_mode?: 'included' | 'one_off' | 'free'
  fee_cents?: number
  visible_from?: string
}

export async function createAdminEvent(request: CreateEventRequest): Promise<{ event: AdminEvent }> {
  return api<{ event: AdminEvent }>('/admin/events', {
    method: 'POST',
    body: request,
  })
}

export interface UpdateEventRequest {
  club_id: string
  title?: string
  description?: string
  location?: string
  kind?: 'session' | 'match' | 'tournament' | 'social' | 'other' | 'training' | 'ladies'
  starts_at_utc?: string
  ends_at_utc?: string
  timezone?: string
  capacity?: number
  status?: 'scheduled' | 'cancelled' | 'completed'
  payment_mode?: 'included' | 'one_off' | 'free'
  fee_cents?: number
  visible_from?: string
}

export async function updateAdminEvent(eventId: string, request: UpdateEventRequest): Promise<{ event: AdminEvent }> {
  return api<{ event: AdminEvent }>(`/admin/events/${eventId}`, {
    method: 'PUT',
    body: request,
  })
}

export async function deleteAdminEvent(eventId: string, clubId: string, hard?: boolean): Promise<{ success: boolean }> {
  const params = new URLSearchParams({ club_id: clubId })
  if (hard) params.set('hard', 'true')
  return api<{ success: boolean }>(`/admin/events/${eventId}?${params}`, {
    method: 'DELETE',
  })
}

// ============================================
// Admin - Event Series
// ============================================

export interface EventSeries {
  id: string
  club_id: string
  title: string
  description: string | null
  location: string | null
  weekday_mask: number
  start_time_local: string
  duration_min: number
  start_date: string
  end_date: string | null
  visibility_days: number
  default_fee_cents: number | null
  currency: string
  created_at: string
  archived_at: string | null
  total_events?: number
  upcoming_events?: number
  next_event_at?: string
}

export interface EventSeriesResponse {
  series: EventSeries[]
}

export async function getEventSeries(clubId: string): Promise<EventSeriesResponse> {
  return api<EventSeriesResponse>(`/admin/event-series?club_id=${clubId}`)
}

export interface CreateSeriesRequest {
  club_id: string
  title: string
  description?: string
  location?: string
  weekday_mask: number
  start_time_local: string
  duration_min?: number
  start_date: string
  end_date?: string
  visibility_days?: number
  default_fee_cents?: number
  currency?: string
  payment_mode?: 'included' | 'one_off' | 'free'
  generate_weeks?: number
}

export interface CreateSeriesResponse {
  series: EventSeries
  events_created: number
}

export async function createEventSeries(request: CreateSeriesRequest): Promise<CreateSeriesResponse> {
  return api<CreateSeriesResponse>('/admin/event-series', {
    method: 'POST',
    body: request,
  })
}

export interface UpdateSeriesRequest {
  club_id: string
  title?: string
  description?: string
  location?: string
  weekday_mask?: number
  start_time_local?: string
  duration_min?: number
  end_date?: string | null
  visibility_days?: number
  default_fee_cents?: number | null
  currency?: string
}

export async function updateEventSeries(seriesId: string, request: UpdateSeriesRequest): Promise<{ series: EventSeries }> {
  return api<{ series: EventSeries }>(`/admin/event-series/${seriesId}`, {
    method: 'PUT',
    body: request,
  })
}

export async function deleteEventSeries(seriesId: string, clubId: string, hard?: boolean): Promise<{ success: boolean }> {
  const params = new URLSearchParams({ club_id: clubId })
  if (hard) params.set('hard', 'true')
  return api<{ success: boolean }>(`/admin/event-series/${seriesId}?${params}`, {
    method: 'DELETE',
  })
}

export interface GenerateEventsRequest {
  club_id: string
  weeks?: number
  from_date?: string
}

export interface GenerateEventsResponse {
  success: boolean
  events_created: number
  total_events: number
  upcoming_events: number
  last_event_at: string | null
}

export async function generateSeriesEvents(seriesId: string, request: GenerateEventsRequest): Promise<GenerateEventsResponse> {
  return api<GenerateEventsResponse>(`/admin/event-series/${seriesId}/generate`, {
    method: 'POST',
    body: request,
  })
}

// ============================================
// Admin - Groups
// ============================================

export interface AdminGroup {
  id: string
  club_id: string
  name: string
  kind: 'team' | 'committee' | 'squad' | 'other'
  description: string | null
  created_at: string
  archived_at: string | null
  member_count?: number
}

export interface GroupMember {
  person_id: string
  name: string
  email: string
  group_role: 'member' | 'coach' | 'captain' | 'admin'
  added_at: string
}

export interface AdminGroupsResponse {
  groups: AdminGroup[]
}

export interface GroupDetailResponse {
  group: AdminGroup
  members: GroupMember[]
}

export async function getAdminGroups(clubId: string, includeArchived?: boolean): Promise<AdminGroupsResponse> {
  const params = new URLSearchParams({ club_id: clubId })
  if (includeArchived) params.set('include_archived', 'true')
  return api<AdminGroupsResponse>(`/admin/groups?${params}`)
}

export async function getGroupDetail(groupId: string, clubId: string): Promise<GroupDetailResponse> {
  return api<GroupDetailResponse>(`/admin/groups/${groupId}?club_id=${clubId}`)
}

export interface CreateGroupRequest {
  club_id: string
  name: string
  kind?: 'team' | 'committee' | 'squad' | 'other'
  description?: string
}

export async function createGroup(request: CreateGroupRequest): Promise<{ group: AdminGroup }> {
  return api<{ group: AdminGroup }>('/admin/groups', {
    method: 'POST',
    body: request,
  })
}

export interface UpdateGroupRequest {
  club_id: string
  name?: string
  kind?: 'team' | 'committee' | 'squad' | 'other'
  description?: string
}

export async function updateGroup(groupId: string, request: UpdateGroupRequest): Promise<{ group: AdminGroup }> {
  return api<{ group: AdminGroup }>(`/admin/groups/${groupId}`, {
    method: 'PUT',
    body: request,
  })
}

export async function deleteGroup(groupId: string, clubId: string, hard?: boolean): Promise<{ success: boolean }> {
  const params = new URLSearchParams({ club_id: clubId })
  if (hard) params.set('hard', 'true')
  return api<{ success: boolean }>(`/admin/groups/${groupId}?${params}`, {
    method: 'DELETE',
  })
}

export async function addGroupMember(
  groupId: string,
  clubId: string,
  personId: string,
  groupRole?: 'member' | 'coach' | 'captain' | 'admin'
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/admin/groups/${groupId}/members`, {
    method: 'POST',
    body: { club_id: clubId, person_id: personId, group_role: groupRole },
  })
}

export async function removeGroupMember(groupId: string, clubId: string, personId: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/admin/groups/${groupId}/members`, {
    method: 'DELETE',
    body: { club_id: clubId, person_id: personId },
  })
}

export async function updateGroupMemberRole(
  groupId: string,
  clubId: string,
  personId: string,
  groupRole: 'member' | 'coach' | 'captain' | 'admin'
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/admin/groups/${groupId}/members`, {
    method: 'PUT',
    body: { club_id: clubId, person_id: personId, group_role: groupRole },
  })
}

// ============================================
// Event Invitations
// ============================================

export interface PersonInvitation {
  id: string
  person_id: string
  name: string
  email: string
  rsvp_response?: 'yes' | 'no' | 'maybe' | null
  created_at: string
}

export interface GroupInvitation {
  id: string
  group_id: string
  name: string
  kind: string
  member_count: number
  created_at: string
}

export interface EventInvitationsResponse {
  invitations: {
    persons: PersonInvitation[]
    groups: GroupInvitation[]
  }
  total_invited: number
}

export interface SeriesInvitationsResponse {
  invitations: {
    persons: PersonInvitation[]
    groups: GroupInvitation[]
  }
}

export interface RemoveInvitationResponse {
  success: boolean
  warning?: string
  rsvp_response?: string
  members_with_rsvp?: Array<{ name: string; response: string }>
  events_with_rsvp?: Array<{ id: string; title: string; starts_at_utc: string; response: string }>
}

export async function getEventInvitations(eventId: string, clubId: string): Promise<EventInvitationsResponse> {
  return api<EventInvitationsResponse>(`/admin/events/${eventId}/invitations?club_id=${clubId}`)
}

export async function addEventInvitations(
  eventId: string,
  clubId: string,
  personIds?: string[],
  groupIds?: string[]
): Promise<{ success: boolean; added: { persons: number; groups: number } }> {
  return api(`/admin/events/${eventId}/invitations`, {
    method: 'POST',
    body: { club_id: clubId, person_ids: personIds, group_ids: groupIds },
  })
}

export async function removeEventInvitation(
  eventId: string,
  clubId: string,
  options: { invitation_id?: string; person_id?: string; group_id?: string },
  force?: boolean
): Promise<RemoveInvitationResponse> {
  const params = new URLSearchParams()
  if (force) params.set('force', 'true')
  const query = params.toString() ? `?${params}` : ''
  return api(`/admin/events/${eventId}/invitations${query}`, {
    method: 'DELETE',
    body: { club_id: clubId, ...options },
  })
}

// ============================================
// Series Invitations
// ============================================

export async function getSeriesInvitations(seriesId: string, clubId: string): Promise<SeriesInvitationsResponse> {
  return api<SeriesInvitationsResponse>(`/admin/event-series/${seriesId}/invitations?club_id=${clubId}`)
}

export async function addSeriesInvitations(
  seriesId: string,
  clubId: string,
  personIds?: string[],
  groupIds?: string[],
  propagateToExisting?: boolean
): Promise<{ success: boolean; added: { persons: number; groups: number } }> {
  return api(`/admin/event-series/${seriesId}/invitations`, {
    method: 'POST',
    body: {
      club_id: clubId,
      person_ids: personIds,
      group_ids: groupIds,
      propagate_to_existing: propagateToExisting ?? true,
    },
  })
}

export async function removeSeriesInvitation(
  seriesId: string,
  clubId: string,
  options: { invitation_id?: string; person_id?: string; group_id?: string; propagate_to_existing?: boolean },
  force?: boolean
): Promise<RemoveInvitationResponse> {
  const params = new URLSearchParams()
  if (force) params.set('force', 'true')
  const query = params.toString() ? `?${params}` : ''
  return api(`/admin/event-series/${seriesId}/invitations${query}`, {
    method: 'DELETE',
    body: { club_id: clubId, ...options },
  })
}

// ============================================
// Admin - Member Detail & Subscriptions
// ============================================

export interface MemberDetailSubscription {
  id: string
  plan_id: string
  plan_name: string
  status: string
  start_at: string
  end_at: string | null
  weekly_sessions_allowed: number
  price_cents: number
  is_manual: boolean
}

export interface MemberPayment {
  id: string
  source: string
  type: string
  amount_cents: number
  currency: string
  status: string
  created_at: string
}

export interface MemberDetailResponse {
  id: string
  person_id: string
  name: string
  email: string
  member_type: 'member' | 'guest'
  status: string
  joined_at: string | null
  subscription: MemberDetailSubscription | null
  recent_payments: MemberPayment[]
}

export async function getMemberDetail(memberId: string, clubId: string): Promise<MemberDetailResponse> {
  return api<MemberDetailResponse>(`/admin/members/${memberId}?club_id=${clubId}`)
}

export interface CreateSubscriptionRequest {
  plan_id: string
  payment_source: 'cash' | 'bacs' | 'free'
  payment_reference?: string
  amount_cents?: number
  start_at?: string
}

export interface CreateSubscriptionResponse {
  subscription_id: string
  transaction_id: string | null
  message: string
}

export async function createMemberSubscription(
  memberId: string,
  clubId: string,
  request: CreateSubscriptionRequest
): Promise<CreateSubscriptionResponse> {
  return api<CreateSubscriptionResponse>(`/admin/members/${memberId}/subscription?club_id=${clubId}`, {
    method: 'POST',
    body: request,
  })
}

export interface CancelSubscriptionResponse {
  message: string
  had_stripe: boolean
}

export async function cancelMemberSubscription(memberId: string, clubId: string): Promise<CancelSubscriptionResponse> {
  return api<CancelSubscriptionResponse>(`/admin/members/${memberId}/subscription?club_id=${clubId}`, {
    method: 'DELETE',
  })
}

export interface RecordPaymentRequest {
  payment_source: 'cash' | 'bacs'
  amount_cents: number
  description?: string
  payment_reference?: string
}

export interface RecordPaymentResponse {
  transaction_id: string
  message: string
}

export async function recordMemberPayment(
  memberId: string,
  clubId: string,
  request: RecordPaymentRequest
): Promise<RecordPaymentResponse> {
  return api<RecordPaymentResponse>(`/admin/members/${memberId}/payment?club_id=${clubId}`, {
    method: 'POST',
    body: request,
  })
}

// ============================================
// Admin - Event RSVP (on behalf of member)
// ============================================

export interface AdminRsvpRequest {
  person_id: string
  response: 'yes' | 'no' | 'maybe'
  free_session?: boolean
  note?: string
}

export interface AdminRsvpResponse {
  message: string
  response: string
  free_session: boolean
  subscription_used: boolean
}

export async function adminCreateRsvp(eventId: string, request: AdminRsvpRequest): Promise<AdminRsvpResponse> {
  return api<AdminRsvpResponse>(`/admin/events/${eventId}/rsvp`, {
    method: 'POST',
    body: request,
  })
}

// ============================================
// Admin - External Events (UK Events + Manual)
// ============================================

export type ExternalEventOrigin = 'import' | 'manual'
export type ExternalEventVisibility = 'public' | 'admin_only' | 'coach_only'
export type ExternalEventStatus = 'active' | 'cancelled' | 'tentative'

export interface ExternalEvent {
  id: string
  source: string
  source_event_id: string
  title: string
  description: string | null
  location: string | null
  url: string | null
  starts_at_utc: string
  ends_at_utc: string | null
  status: ExternalEventStatus
  origin: ExternalEventOrigin | null
  visibility: ExternalEventVisibility | null
  created_by_person_id: string | null
  // From club's decision
  decision: 'promoted' | 'ignored' | 'undecided' | null
  event_id: string | null
  decided_at: string | null
}

export interface ExternalEventsResponse {
  external_events: ExternalEvent[]
}

export interface ExternalEventsParams {
  club_id: string
  kind?: 'uk' | 'manual'
  from?: string
  limit?: number
}

export async function getExternalEvents(params: ExternalEventsParams): Promise<ExternalEventsResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('club_id', params.club_id)
  if (params.kind) searchParams.set('kind', params.kind)
  if (params.from) searchParams.set('from', params.from)
  if (params.limit) searchParams.set('limit', String(params.limit))
  return api<ExternalEventsResponse>(`/admin/external-events?${searchParams}`)
}

// Manual External Events

export interface CreateManualEventRequest {
  club_id: string
  title: string
  description?: string | null
  location?: string | null
  url?: string | null
  source?: string
  starts_at_utc: string
  ends_at_utc?: string | null
  status?: ExternalEventStatus
  visibility?: ExternalEventVisibility
}

export interface CreateManualEventResponse {
  external_event: ExternalEvent
}

export async function createManualExternalEvent(
  request: CreateManualEventRequest
): Promise<CreateManualEventResponse> {
  return api<CreateManualEventResponse>('/admin/external-events', {
    method: 'POST',
    body: request,
  })
}

export interface UpdateManualEventRequest {
  club_id: string
  title?: string
  description?: string | null
  location?: string | null
  url?: string | null
  source?: string
  starts_at_utc?: string
  ends_at_utc?: string | null
  status?: ExternalEventStatus
  visibility?: ExternalEventVisibility
}

export interface UpdateManualEventResponse {
  external_event: ExternalEvent
}

export async function updateManualExternalEvent(
  externalEventId: string,
  request: UpdateManualEventRequest
): Promise<UpdateManualEventResponse> {
  return api<UpdateManualEventResponse>(`/admin/external-events/${externalEventId}`, {
    method: 'PUT',
    body: request,
  })
}

export async function deleteManualExternalEvent(
  externalEventId: string,
  clubId: string
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/admin/external-events/${externalEventId}?club_id=${clubId}`, {
    method: 'DELETE',
  })
}

export interface PromoteExternalEventRequest {
  club_id: string
  title?: string
  description?: string
  location?: string
  capacity?: number
  visible_from?: string
}

export interface PromoteExternalEventResponse {
  event: AdminEvent
  already_promoted: boolean
}

export async function promoteExternalEvent(
  externalEventId: string,
  request: PromoteExternalEventRequest
): Promise<PromoteExternalEventResponse> {
  return api<PromoteExternalEventResponse>(`/admin/external-events/${externalEventId}/promote`, {
    method: 'POST',
    body: request,
  })
}

export interface IgnoreExternalEventResponse {
  success: boolean
  already_ignored: boolean
}

export async function ignoreExternalEvent(
  externalEventId: string,
  clubId: string
): Promise<IgnoreExternalEventResponse> {
  return api<IgnoreExternalEventResponse>(`/admin/external-events/${externalEventId}/ignore`, {
    method: 'POST',
    body: { club_id: clubId },
  })
}

export interface UndoExternalEventResponse {
  success: boolean
  had_decision: boolean
  previous_decision?: 'promoted' | 'ignored'
}

export async function undoExternalEventDecision(
  externalEventId: string,
  clubId: string
): Promise<UndoExternalEventResponse> {
  return api<UndoExternalEventResponse>(`/admin/external-events/${externalEventId}/undo`, {
    method: 'POST',
    body: { club_id: clubId },
  })
}

// ============================================
// Admin - Billing
// ============================================

// Billing Overview
export interface BillingOverviewTotals {
  total_collected_cents: number
  stripe_collected_cents: number
  manual_collected_cents: number
  refunds_cents: number
}

export interface BillingPlanBreakdown {
  plan_id: string
  plan_name: string
  count: number
  manual_count: number
}

export interface BillingDailyTotal {
  date: string
  total_cents: number
  stripe_cents: number
  manual_cents: number
}

export interface BillingOverviewResponse {
  totals: {
    last_30_days: BillingOverviewTotals
    month_to_date: BillingOverviewTotals
  }
  subscriptions: {
    active_count: number
    manual_count: number
    by_plan: BillingPlanBreakdown[]
  }
  chart_data: BillingDailyTotal[]
  outstanding_one_off_cents: number
}

export async function getBillingOverview(clubId: string): Promise<BillingOverviewResponse> {
  return api<BillingOverviewResponse>(`/admin/billing/overview?club_id=${clubId}`)
}

// Billing Members
export interface BillingMemberSubscription {
  id: string
  plan_id: string
  plan_name: string
  cadence: string
  weekly_sessions_allowed: number
  status: string
  is_manual: boolean
  stripe_subscription_id: string | null
  start_at: string
  end_at: string | null
}

export interface BillingMember {
  person_id: string
  membership_id: string
  name: string
  email: string
  subscription: BillingMemberSubscription | null
  usage_this_week: {
    attended_count: number
    allowed: number
  }
  payment_health: {
    past_due: boolean
    assumed_paid: boolean
    confirmed_paid: boolean
  }
}

export interface BillingMembersResponse {
  members: BillingMember[]
  week_start: string
  week_end: string
}

export async function getBillingMembers(clubId: string, weekStart?: string): Promise<BillingMembersResponse> {
  const params = new URLSearchParams({ club_id: clubId })
  if (weekStart) params.set('week_start', weekStart)
  return api<BillingMembersResponse>(`/admin/billing/members?${params}`)
}

// Event Fees
export interface EventFeePayer {
  person_id: string
  name: string
  email: string
  status: 'paid' | 'due' | 'waived'
  amount_cents: number
  paid_at: string | null
}

export interface EventFeeInfo {
  event_id: string
  title: string
  starts_at_utc: string
  location: string | null
  payment_mode: string
  fee_cents: number | null
  currency: string
  payment_request_id: string | null
  totals: {
    expected_count: number
    paid_count: number
    unpaid_count: number
    waived_count: number
    total_expected_cents: number
    total_collected_cents: number
  }
  payers?: EventFeePayer[]
}

export interface EventFeesResponse {
  events: EventFeeInfo[]
  from: string
  to: string
}

export async function getBillingEventFees(
  clubId: string,
  from?: string,
  to?: string,
  includePayers?: boolean
): Promise<EventFeesResponse> {
  const params = new URLSearchParams({ club_id: clubId })
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (includePayers) params.set('include_payers', 'true')
  return api<EventFeesResponse>(`/admin/billing/event-fees?${params}`)
}

// Transactions
export interface BillingTransaction {
  id: string
  person_id: string | null
  person_name: string | null
  person_email: string | null
  event_id: string | null
  event_title: string | null
  source: string
  type: string
  amount_cents: number
  currency: string
  status: string
  notes: string | null
  reference: string | null
  collected_by_name: string | null
  created_at: string
  effective_at: string | null
  is_matched: boolean
}

export interface BillingTransactionsResponse {
  transactions: BillingTransaction[]
  from: string
  to: string
  total_count: number
}

export async function getBillingTransactions(
  clubId: string,
  options?: { from?: string; to?: string; method?: string; type?: string; limit?: number; offset?: number }
): Promise<BillingTransactionsResponse> {
  const params = new URLSearchParams({ club_id: clubId })
  if (options?.from) params.set('from', options.from)
  if (options?.to) params.set('to', options.to)
  if (options?.method) params.set('method', options.method)
  if (options?.type) params.set('type', options.type)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))
  return api<BillingTransactionsResponse>(`/admin/billing/transactions?${params}`)
}

// Manual Payment
export interface ManualPaymentRequest {
  club_id: string
  person_id: string
  event_id?: string | null
  amount_cents: number
  currency?: string
  method: 'cash' | 'bank_transfer' | 'comp'
  occurred_at?: string
  notes?: string
  reference?: string
}

export interface ManualPaymentResponse {
  transaction_id: string
  message: string
}

export async function recordManualPayment(request: ManualPaymentRequest): Promise<ManualPaymentResponse> {
  return api<ManualPaymentResponse>('/admin/billing/manual-payment', {
    method: 'POST',
    body: request,
  })
}

// Bank Import
export interface BarclaysCSVRow {
  Number: string
  Date: string
  Account: string
  Amount: string
  Subcategory: string
  Memo: string
}

export interface BankImportRequest {
  club_id: string
  filename: string
  account?: string
  rows: BarclaysCSVRow[]
}

export interface BankImportResponse {
  import_id: string
  inserted: number
  skipped_duplicates: number
  total_rows: number
}

export async function importBankStatement(request: BankImportRequest): Promise<BankImportResponse> {
  return api<BankImportResponse>('/admin/billing/bank-import', {
    method: 'POST',
    body: request,
  })
}

// Bank Rows
export interface MatchSuggestion {
  transaction_id: string
  person_id: string
  person_name: string
  person_email: string
  amount_cents: number
  source: string
  created_at: string
  confidence: number
  reason: string
}

export interface BankRow {
  id: string
  import_id: string
  txn_number: string | null
  txn_date: string
  account: string | null
  amount_cents: number
  subcategory: string | null
  memo: string | null
  direction: 'in' | 'out'
  created_at: string
  match: {
    id: string
    transaction_id: string
    match_type: 'auto' | 'manual'
    confidence: number | null
    person_name: string | null
  } | null
  suggestions: MatchSuggestion[]
}

export interface BankRowsResponse {
  rows: BankRow[]
  total_count: number
  unmatched_in_count: number
  unmatched_out_count: number
}

export async function getBankRows(
  clubId: string,
  options?: { import_id?: string; matched?: '0' | '1'; direction?: 'in' | 'out'; limit?: number; offset?: number }
): Promise<BankRowsResponse> {
  const params = new URLSearchParams({ club_id: clubId })
  if (options?.import_id) params.set('import_id', options.import_id)
  if (options?.matched) params.set('matched', options.matched)
  if (options?.direction) params.set('direction', options.direction)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))
  return api<BankRowsResponse>(`/admin/billing/bank-rows?${params}`)
}

// Bank Match
export interface BankMatchRequest {
  club_id: string
  bank_row_id: string
  transaction_id: string
  match_type?: 'auto' | 'manual'
}

export interface BankMatchResponse {
  match_id: string
  message: string
}

export async function createBankMatch(request: BankMatchRequest): Promise<BankMatchResponse> {
  return api<BankMatchResponse>('/admin/billing/bank-match', {
    method: 'POST',
    body: request,
  })
}

export async function deleteBankMatch(clubId: string, matchIdOrBankRowId: string, isBankRowId = false): Promise<{ success: boolean }> {
  const body: { club_id: string; match_id?: string; bank_row_id?: string } = { club_id: clubId }
  if (isBankRowId) {
    body.bank_row_id = matchIdOrBankRowId
  } else {
    body.match_id = matchIdOrBankRowId
  }
  return api<{ success: boolean }>('/admin/billing/bank-match', {
    method: 'DELETE',
    body,
  })
}

// Exports
export type BillingExportType = 'attendance' | 'subscriptions' | 'event_fees' | 'transactions' | 'members_billing'

export function getBillingExportUrl(
  clubId: string,
  type: BillingExportType,
  from?: string,
  to?: string,
  eventId?: string
): string {
  const params = new URLSearchParams({ club_id: clubId, type })
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (eventId) params.set('event_id', eventId)
  return `${API_BASE}/admin/billing/export?${params}`
}
