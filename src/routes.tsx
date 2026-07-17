import { Navigate, createBrowserRouter } from 'react-router-dom'
import App from './app'
import { RequireAuth } from './features/auth/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { SetPasswordPage } from './features/auth/SetPasswordPage'
import { VideoListPage } from './features/videos/VideoListPage'
import { VideoDetailPage } from './features/videos/VideoDetailPage'
import { CalendarPage } from './features/calendar/CalendarPage'
import { FeedbackPage } from './features/feedback/FeedbackPage'
import { ProductionPage } from './features/production/ProductionPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { StoryPage } from './features/story/StoryPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/set-password', element: <SetPasswordPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <App />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/videos" replace /> },
      { path: 'videos', element: <VideoListPage /> },
      { path: 'videos/:slug', element: <VideoDetailPage /> },
      { path: 'production', element: <ProductionPage /> },
      { path: 'feedback', element: <FeedbackPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'story', element: <StoryPage /> },
    ],
  },
])
