
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import MeetingRoom from './pages/MeetingRoom';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import { User } from './types';

const AppContent: React.FC<{ user: User | null; onLogin: (u: User) => void; onUpdateUser: (u: User) => void; onLogout: () => void }> = ({ user, onLogin, onUpdateUser, onLogout }) => {
  return (
    <Routes>
      <Route 
        path="/" 
        element={user ? <Navigate to="/dashboard" /> : <LandingPage onLogin={onLogin} />} 
      />
      <Route 
        path="/dashboard" 
        element={user ? <Dashboard user={user} onLogout={onLogout} /> : <Navigate to="/" />} 
      />
      <Route 
        path="/meeting/:id" 
        element={user ? <MeetingRoom user={user} /> : <Navigate to="/" />} 
      />
      <Route 
        path="/history" 
        element={user ? <HistoryPage user={user} /> : <Navigate to="/" />} 
      />
      <Route 
        path="/settings" 
        element={user ? <SettingsPage user={user} onUpdateUser={onUpdateUser} onLogout={onLogout} /> : <Navigate to="/" />} 
      />
    </Routes>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('collab_user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('collab_user', JSON.stringify(u));
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('collab_user', JSON.stringify(updatedUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('collab_user');
  };

  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <AppContent 
          user={user} 
          onLogin={handleLogin} 
          onUpdateUser={handleUpdateUser} 
          onLogout={handleLogout} 
        />
      </div>
    </Router>
  );
};

export default App;
