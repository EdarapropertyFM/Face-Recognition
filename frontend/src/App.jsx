import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import Layout from './components/Layout';

// Pages
import LoginPage      from './pages/LoginPage';
import DashboardPage  from './pages/DashboardPage';
import LiveWallPage   from './pages/LiveWallPage';
import CamerasPage    from './pages/CamerasPage';
import BuildingsPage  from './pages/BuildingsPage';
import EnrollmentsPage from './pages/EnrollmentsPage';
import EnrollmentPage from './pages/EnrollmentPage';
import AlertsPage     from './pages/AlertsPage';
import TrackPage      from './pages/TrackPage';
import FaceDBPage     from './pages/FaceDBPage';
import IncidentsPage  from './pages/IncidentsPage';
import ReportsPage    from './pages/ReportsPage';
import AdminPage      from './pages/AdminPage';
import SettingsPage   from './pages/SettingsPage';
import FaceTestPage   from './pages/FaceTestPage';

// Protected route wrapper
function Protected({ children, module }) {
  const { session, can } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (module && !can(module)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { session } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route path="/"            element={<Protected module="dashboard">   <DashboardPage />   </Protected>} />
      <Route path="/livewall"    element={<Protected module="livewall">    <LiveWallPage />    </Protected>} />
      <Route path="/cameras"     element={<Protected module="cameras">     <CamerasPage />     </Protected>} />
      <Route path="/buildings"   element={<Protected module="buildings">   <BuildingsPage />   </Protected>} />
      <Route path="/enrollments" element={<Protected module="enrollments"> <EnrollmentsPage /> </Protected>} />
      <Route path="/alerts"      element={<Protected module="alerts">      <AlertsPage />      </Protected>} />
      <Route path="/track"       element={<Protected module="track">       <TrackPage />       </Protected>} />
      <Route path="/facedb"      element={<Protected module="facedb">      <FaceDBPage />      </Protected>} />
      <Route path="/incidents"   element={<Protected module="incidents">   <IncidentsPage />   </Protected>} />
      <Route path="/reports"     element={<Protected module="reports">     <ReportsPage />     </Protected>} />
      <Route path="/admin"       element={<Protected module="admin">       <AdminPage />       </Protected>} />
      <Route path="/settings"    element={<Protected module="settings">    <SettingsPage />    </Protected>} />
      <Route path="/face-test"   element={<Protected module="facetest">    <FaceTestPage />    </Protected>} />
      <Route path="/enroll"      element={<EnrollmentPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
