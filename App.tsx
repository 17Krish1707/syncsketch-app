import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage'; // This is your Google Login Page
import Dashboard from './pages/Dashboard';
import MeetingRoom from './pages/MeetingRoom';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import { User } from './types';

// --- 1. Helper to get user data safely ---
const getUser = (): User | null => {
  const saved = localStorage.getItem('user');
  return saved ? JSON.parse(saved) : null;
};

// --- 2. Protected Route Wrapper ---
// This checks if the user is logged in before showing the page
const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  const user = getUser();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  // If user exists, render the page
  return React.cloneElement(children, { user }); 
};

// --- 3. Main App Component ---
const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-white">
        <Routes>
          
          {/* LOGIN PAGE (Public) */}
          <Route 
            path="/" 
            element={<LandingPage />} 
          />

          {/* DASHBOARD (Protected) */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard user={getUser()!} onLogout={() => {
                  localStorage.clear();
                  window.location.href = '/';
                }} />
              </ProtectedRoute>
            } 
          />

          {/* MEETING ROOM (Protected) */}
          <Route 
            path="/meeting/:id" 
            element={
              <ProtectedRoute>
                <MeetingRoom user={getUser()!} />
              </ProtectedRoute>
            } 
          />

          {/* HISTORY (Protected) */}
          <Route 
            path="/history" 
            element={
              <ProtectedRoute>
                <HistoryPage user={getUser()!} />
              </ProtectedRoute>
            } 
          />

          {/* SETTINGS (Protected) */}
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <SettingsPage 
                  user={getUser()!} 
                  onUpdateUser={(u) => localStorage.setItem('user', JSON.stringify(u))}
                  onLogout={() => {
                    localStorage.clear();
                    window.location.href = '/';
                  }} 
                />
              </ProtectedRoute>
            } 
          />

        </Routes>
      </div>
    </Router>
  );
};

export default App;