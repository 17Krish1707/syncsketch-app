
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Meeting } from '../types';
import { realtime } from '../services/realtimeService';

interface Props {
  user: User;
  onLogout: () => void;
}

const Dashboard: React.FC<Props> = ({ user, onLogout }) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinValue, setJoinValue] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const refreshMeetings = () => {
      const saved = realtime.loadState('collab_meetings') || [];
      setMeetings(saved.filter((m: any) => !m.ended));
    };

    refreshMeetings();
    realtime.subscribe('meetings_updated', (updated: Meeting[]) => {
      setMeetings(updated.filter((m: any) => !m.ended));
    });

    realtime.subscribe('meeting_ended', () => {
      refreshMeetings();
    });
  }, []);

  const createMeeting = (title: string = 'Untitled Session') => {
    const newMeeting: Meeting = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      title,
      hostId: user.id,
      createdAt: Date.now(),
      lastModified: Date.now(),
      participants: [user.id]
    };
    const currentMeetings = realtime.loadState('collab_meetings') || [];
    const updated = [...currentMeetings, newMeeting];
    realtime.saveState('collab_meetings', updated);
    setMeetings(updated.filter((m: any) => !m.ended));
    navigate(`/meeting/${newMeeting.id}`);
  };

const handleJoinAction = () => {
    setJoinError('');
    let input = joinValue.trim();
    if (!input) {
      setJoinError('Please enter a Room ID or meeting link.');
      return;
    }

    let targetId = input;
    const urlPattern = /\/meeting\/([A-Z0-9]+)/i;
    const match = input.match(urlPattern);
    if (match && match[1]) targetId = match[1];
    
    // Clean the ID
    targetId = targetId.toUpperCase().replace(/\//g, '');

    // FIX: Remove the local storage check. 
    // Just navigate to the room. The socket will handle the connection.
    if (targetId.length > 0) {
      setShowJoinModal(false);
      navigate(`/meeting/${targetId}`);
    } else {
      setJoinError('Invalid Room ID format.');
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="p-6 border-b flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div 
            id="app-logo"
            onClick={() => navigate('/dashboard')}
            className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold cursor-pointer hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            title="SyncSketch"
          >
            S
          </div>
          <span className="font-bold text-xl tracking-tight hidden lg:block">SyncSketch</span>
        </div>
        <button className="lg:hidden text-gray-500 hover:bg-gray-100 p-2 rounded-lg" onClick={() => setIsSidebarOpen(false)}>✕</button>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        <SidebarLink icon="🏠" label="Dashboard" active onClick={() => { navigate('/dashboard'); setIsSidebarOpen(false); }} />
        <SidebarLink icon="📂" label="Projects" onClick={() => { navigate('/history'); setIsSidebarOpen(false); }} />
        <SidebarLink icon="⚙️" label="Settings" onClick={() => { navigate('/settings'); setIsSidebarOpen(false); }} />
      </nav>
      <div className="p-4 border-t bg-gray-50/50">
        <div className="flex items-center space-x-3 mb-4 p-2">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold shadow-sm">
            {user.name[0]}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold truncate text-slate-800">{user.name}</p>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{user.role}</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="w-full py-2.5 text-rose-600 border border-rose-100 rounded-xl text-sm font-bold hover:bg-rose-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden relative">
      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black tracking-tight text-slate-800">Join Workspace</h3>
                <button onClick={() => setShowJoinModal(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition-colors">✕</button>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Room Identity / URL</label>
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="e.g. AB12CD or meeting link"
                    value={joinValue}
                    onChange={(e) => { setJoinValue(e.target.value); setJoinError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinAction()}
                    className={`w-full px-5 py-4 bg-slate-50 border-2 rounded-2xl outline-none transition-all font-medium ${joinError ? 'border-rose-300 bg-rose-50' : 'border-slate-100 focus:border-indigo-500 focus:bg-white'}`}
                  />
                  {joinError && <p className="text-xs font-bold text-rose-500 ml-1">{joinError}</p>}
                </div>
                <div className="flex space-x-4">
                  <button onClick={() => setShowJoinModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-colors">Cancel</button>
                  <button onClick={handleJoinAction} className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all active:scale-95">Join Now</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar for Laptop/Desktop */}
      <aside className="hidden lg:flex lg:w-72 border-r bg-white flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 w-72 z-[101] transform transition-transform duration-500 ease-out lg:hidden bg-white ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      <main className="flex-1 overflow-y-auto px-4 py-8 lg:px-12 lg:py-12">
        <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-12 gap-6">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center space-x-4">
              <button className="lg:hidden p-2 text-slate-600 bg-white border rounded-xl" onClick={() => setIsSidebarOpen(true)}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              </button>
              <div>
                <h2 className="text-2xl lg:text-4xl font-black text-slate-800 tracking-tight">Welcome, {user.name.split(' ')[0]}</h2>
                <p className="text-sm lg:text-lg text-slate-500 font-medium">Capture your best ideas together.</p>
              </div>
            </div>
            <div className="lg:hidden w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-indigo-200">
              {user.name[0]}
            </div>
          </div>
          <div className="flex space-x-3 lg:space-x-4 w-full md:w-auto">
            <button 
                onClick={() => { setJoinValue(''); setJoinError(''); setShowJoinModal(true); }}
                className="flex-1 md:flex-none px-8 py-3.5 bg-white text-slate-700 border-2 border-slate-100 rounded-2xl font-black text-sm transition-all hover:border-slate-200 hover:shadow-sm"
            >
                Join
            </button>
            <button 
                onClick={() => createMeeting()}
                className="flex-1 md:flex-none px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            >
                Start New Session
            </button>
          </div>
        </header>

        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Templates</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            <TemplateCard title="Brainstorming" desc="Free-form ideation" icon="🧠" color="bg-purple-50 text-purple-600" onClick={() => createMeeting('Brainstorming Session')} />
            <TemplateCard title="Sprint Retro" desc="Agile workflow" icon="🔄" color="bg-emerald-50 text-emerald-600" onClick={() => createMeeting('Team Retro')} />
            <TemplateCard title="System Design" desc="Architectural diagrams" icon="🏗️" color="bg-blue-50 text-blue-600" onClick={() => createMeeting('System Architecture')} />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Recent Boards</h3>
          </div>
          {meetings.length === 0 ? (
            <div className="group text-center py-24 bg-white rounded-[32px] border-2 border-dashed border-slate-200 transition-colors hover:border-indigo-300">
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🎨</div>
              <p className="text-slate-400 font-bold max-w-xs mx-auto">No active sessions found. Create your first masterpiece now!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {meetings.map(m => (
                <div key={m.id} className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all group cursor-pointer" onClick={() => navigate(`/meeting/${m.id}`)}>
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                    </div>
                    <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full uppercase tracking-widest">{m.id}</span>
                  </div>
                  <h4 className="font-black text-xl mb-2 text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">{m.title}</h4>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>{new Date(m.lastModified).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{m.participants.length} Active</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const SidebarLink = ({ icon, label, active, onClick }: { icon: string, label: string, active?: boolean, onClick: () => void }) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-3 p-3.5 rounded-2xl font-bold text-sm transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}`}>
    <span className="text-lg">{icon}</span>
    <span className="tracking-tight">{label}</span>
  </button>
);

const TemplateCard = ({ title, desc, icon, color, onClick }: { title: string, desc: string, icon: string, color: string, onClick: () => void }) => (
  <button onClick={onClick} className="bg-white p-6 rounded-[28px] border-2 border-slate-50 shadow-sm flex items-center space-x-5 hover:border-indigo-200 hover:shadow-md transition-all group text-left w-full active:scale-[0.98]">
    <div className={`w-16 h-16 ${color} rounded-[20px] flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform`}>{icon}</div>
    <div>
      <h4 className="font-black text-lg text-slate-800 tracking-tight leading-tight mb-1">{title}</h4>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{desc}</p>
    </div>
  </button>
);

export default Dashboard;
