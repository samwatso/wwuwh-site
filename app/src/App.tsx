import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login, Signup, Dashboard, ForgotPassword } from '@/pages'
import { AuthGuard, GuestGuard, AdminGuard, AuthLayout } from '@/components'

// Member pages
import { Events } from '@/pages/Events'
import { EventTeams } from '@/pages/EventTeams'
import { Profile } from '@/pages/Profile'
import { Subscribe } from '@/pages/Subscribe'

// Admin pages
import {
  AdminHome,
  AdminMembers,
  AdminEvents,
  AdminGroups,
  AdminBilling,
  AdminRoles,
  AdminAudit,
} from '@/pages/admin'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes - only accessible when NOT logged in */}
        <Route element={<GuestGuard />}>
          <Route path="/app/login" element={<Login />} />
          <Route path="/app/signup" element={<Signup />} />
          <Route path="/app/forgot-password" element={<ForgotPassword />} />
        </Route>

        {/* Protected routes - require authentication */}
        <Route element={<AuthGuard />}>
          <Route
            path="/app"
            element={
              <AuthLayout>
                <Dashboard />
              </AuthLayout>
            }
          />
          <Route
            path="/app/events"
            element={
              <AuthLayout>
                <Events />
              </AuthLayout>
            }
          />
          <Route
            path="/app/events/:eventId/teams"
            element={
              <AuthLayout>
                <EventTeams />
              </AuthLayout>
            }
          />
          <Route
            path="/app/profile"
            element={
              <AuthLayout>
                <Profile />
              </AuthLayout>
            }
          />
          <Route
            path="/app/subscribe"
            element={
              <AuthLayout>
                <Subscribe />
              </AuthLayout>
            }
          />

          {/* Admin routes - require admin role */}
          <Route element={<AdminGuard />}>
            <Route
              path="/app/admin"
              element={
                <AuthLayout>
                  <AdminHome />
                </AuthLayout>
              }
            />
            <Route
              path="/app/admin/members"
              element={
                <AuthLayout>
                  <AdminMembers />
                </AuthLayout>
              }
            />
            <Route
              path="/app/admin/events"
              element={
                <AuthLayout>
                  <AdminEvents />
                </AuthLayout>
              }
            />
            <Route
              path="/app/admin/groups"
              element={
                <AuthLayout>
                  <AdminGroups />
                </AuthLayout>
              }
            />
            <Route
              path="/app/admin/billing"
              element={
                <AuthLayout>
                  <AdminBilling />
                </AuthLayout>
              }
            />
            <Route
              path="/app/admin/roles"
              element={
                <AuthLayout>
                  <AdminRoles />
                </AuthLayout>
              }
            />
            <Route
              path="/app/admin/audit"
              element={
                <AuthLayout>
                  <AdminAudit />
                </AuthLayout>
              }
            />
          </Route>
        </Route>

        {/* Fallback - redirect unknown /app/* routes to dashboard */}
        <Route path="/app/*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
