import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Enroll } from './pages/Enroll';
import { Verify } from './pages/Verify';
import { MobileSession } from './pages/MobileSession';
import { Diagnostics } from './pages/Diagnostics';

export function App() {
  return (
    <BrowserRouter>
      <div style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: '100vh',
        background: '#fafafa',
      }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/mobile/:sessionId" element={<MobileSession />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
