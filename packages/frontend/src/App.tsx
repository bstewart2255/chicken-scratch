import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Home } from './pages/Home';
import { Enroll } from './pages/Enroll';
import { Verify } from './pages/Verify';
import { MobileSession } from './pages/MobileSession';
import { Diagnostics } from './pages/Diagnostics';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminTenants } from './pages/AdminTenants';
import { AdminTenantDetail } from './pages/AdminTenantDetail';
import { AdminSystem } from './pages/AdminSystem';

export function App() {
  return (
    <BrowserRouter>
      <div style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: '100vh',
        background: '#fafafa',
      }}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Home />} />
          <Route path="/app/enroll" element={<Enroll />} />
          <Route path="/app/verify" element={<Verify />} />
          <Route path="/mobile/:sessionId" element={<MobileSession />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/tenants" element={<AdminTenants />} />
          <Route path="/admin/tenants/:tenantId" element={<AdminTenantDetail />} />
          <Route path="/admin/system" element={<AdminSystem />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
