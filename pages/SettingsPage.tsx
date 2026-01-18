
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, UserSettings, UserRole } from '../types';

interface Props {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onLogout: () => void;
}

const DEFAULT_SETTINGS: UserSettings = {
  defaultPenColor: '#4F46E5',
  defaultStrokeWidth: 3,
  defaultFontSize: 20,
  defaultTool: 'pen',
  autoSave: true,
  showLiveCursors: true,
  enableScreenShare: true,
  notificationsEnabled: true,
  muteSounds: false,
  autoAcceptInvites: false
};

const SettingsPage: React.FC<Props> = ({ user, onUpdateUser, onLogout }) => {
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState(user.name);
  const [settings, setSettings] = useState<UserSettings>(user.settings || DEFAULT_SETTINGS);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSaveStatus('saving');
    try {
      const updatedUser: User = {
        ...user,
        name: profileName,
        settings: settings
      };
      onUpdateUser(updatedUser);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-gray-100 rounded-lg transition">←</button>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
        <button 
          onClick={handleSave}
          className={`px-6 py-2 rounded-lg font-bold transition shadow-md ${
            saveStatus === 'saving' ? 'bg-gray-400 cursor-wait' : 
            saveStatus === 'saved' ? 'bg-green-500 text-white' : 
            'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
        </button>
      </header>

      {/* Profile Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border space-y-4">
        <h2 className="text-xl font-bold flex items-center space-x-2">
          <span>👤</span> <span>User Profile</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Display Name</label>
            <input 
              type="text" 
              value={profileName} 
              onChange={e => setProfileName(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Email Address (Read Only)</label>
            <input 
              type="text" 
              value={user.email} 
              disabled 
              className="w-full p-2 border rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed" 
            />
          </div>
        </div>
      </section>

      {/* Whiteboard Preferences */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border space-y-6">
        <h2 className="text-xl font-bold flex items-center space-x-2">
          <span>🎨</span> <span>Whiteboard Preferences</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">Default Pen Color</label>
              <div className="flex space-x-2">
                {['#4F46E5', '#EF4444', '#10B981', '#000000', '#F59E0B'].map(c => (
                  <button 
                    key={c} 
                    onClick={() => updateSetting('defaultPenColor', c)}
                    className={`w-8 h-8 rounded-full border-2 ${settings.defaultPenColor === c ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Default Stroke Width ({settings.defaultStrokeWidth}px)</label>
              <input 
                type="range" min="1" max="20" 
                value={settings.defaultStrokeWidth}
                onChange={e => updateSetting('defaultStrokeWidth', parseInt(e.target.value))}
                className="w-full h-2 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          </div>
          <div className="space-y-4">
            <Toggle 
              label="Auto-save Board State" 
              description="Automatically backup board elements to local storage"
              enabled={settings.autoSave} 
              onToggle={() => updateSetting('autoSave', !settings.autoSave)} 
            />
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Initial Tool</label>
              <select 
                value={settings.defaultTool}
                onChange={e => updateSetting('defaultTool', e.target.value as any)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                <option value="pen">Pen Tool</option>
                <option value="select">Selection Tool</option>
                <option value="text">Text Tool</option>
                <option value="sticky">Sticky Note</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Collaboration & Security */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border space-y-6">
        <h2 className="text-xl font-bold flex items-center space-x-2">
          <span>🤝</span> <span>Collaboration & Notifications</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Toggle 
            label="Show Live Cursors" 
            description="See real-time movements of other participants"
            enabled={settings.showLiveCursors} 
            onToggle={() => updateSetting('showLiveCursors', !settings.showLiveCursors)} 
          />
          <Toggle 
            label="Push Notifications" 
            description="Get alerted when someone joins or shares screen"
            enabled={settings.notificationsEnabled} 
            onToggle={() => updateSetting('notificationsEnabled', !settings.notificationsEnabled)} 
          />
          <Toggle 
            label="Mute Application Sounds" 
            description="Disable all UI sound effects and alerts"
            enabled={settings.muteSounds} 
            onToggle={() => updateSetting('muteSounds', !settings.muteSounds)} 
          />
          <Toggle 
            label="Auto-accept Invites" 
            description="Instantly join rooms when clicking invite links"
            enabled={settings.autoAcceptInvites} 
            onToggle={() => updateSetting('autoAcceptInvites', !settings.autoAcceptInvites)} 
          />
        </div>
      </section>

      {/* Session Controls */}
      <section className="bg-rose-50 p-6 rounded-2xl border border-rose-100 space-y-4">
        <h2 className="text-xl font-bold text-rose-800 flex items-center space-x-2">
          <span>🛡️</span> <span>Danger Zone</span>
        </h2>
        <div className="flex flex-col md:flex-row md:space-x-4 space-y-2 md:space-y-0">
          <button 
            onClick={onLogout}
            className="px-4 py-2 bg-white text-rose-600 border border-rose-200 rounded-lg font-bold hover:bg-rose-100 transition"
          >
            Logout from Session
          </button>
          <button 
            className="px-4 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition"
            onClick={() => {
              if (confirm("Are you sure you want to clear all data? This will delete your locally saved whiteboards.")) {
                localStorage.clear();
                window.location.reload();
              }
            }}
          >
            Reset All Application Data
          </button>
        </div>
      </section>
    </div>
  );
};

const Toggle = ({ label, description, enabled, onToggle }: { label: string, description: string, enabled: boolean, onToggle: () => void }) => (
  <div className="flex items-start justify-between">
    <div className="flex-1">
      <p className="text-sm font-bold text-gray-800">{label}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
    <button 
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

export default SettingsPage;
