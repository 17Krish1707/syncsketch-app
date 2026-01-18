import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Meeting } from '../types';
import { realtime } from '../services/realtimeService';

interface Props {
  user: User;
}

const HistoryPage: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<Meeting[]>([]);

  useEffect(() => {
    const saved = realtime.loadState('collab_meetings') || [];
    // Sort by newest first
    setHistory(saved.reverse());
  }, []);

  const clearHistory = () => {
    if (confirm('Are you sure you want to clear your meeting history? This cannot be undone.')) {
      realtime.saveState('collab_meetings', []);
      setHistory([]);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto min-h-screen">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-gray-100 rounded-lg transition">←</button>
          <h1 className="text-3xl font-bold text-slate-800">Meeting History</h1>
        </div>
        {history.length > 0 && (
          <button onClick={clearHistory} className="px-4 py-2 text-rose-600 border border-rose-200 rounded-xl font-bold hover:bg-rose-50 text-sm transition-colors">
            Clear History
          </button>
        )}
      </header>
      
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        {history.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-xl mb-2">No history found 🕸️</p>
            <p className="text-sm">Join or create a meeting to see it here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="p-6 font-black text-xs uppercase tracking-widest text-slate-400">Session Details</th>
                  <th className="p-6 font-black text-xs uppercase tracking-widest text-slate-400">Date</th>
                  <th className="p-6 font-black text-xs uppercase tracking-widest text-slate-400">Host ID</th>
                  <th className="p-6 font-black text-xs uppercase tracking-widest text-slate-400 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition group">
                    <td className="p-6">
                      <p className="font-bold text-slate-800 text-lg mb-1">{m.title || 'Untitled Session'}</p>
                      <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md uppercase tracking-wider">ID: {m.id}</span>
                    </td>
                    <td className="p-6 text-sm font-medium text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString()} <span className="text-slate-300 mx-1">|</span> {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                    </td>
                    <td className="p-6 text-sm font-mono text-slate-400">
                       {m.hostId === user.id ? <span className="text-emerald-600 font-bold">You</span> : m.hostId}
                    </td>
                    <td className="p-6 text-right">
                      <button onClick={() => navigate(`/meeting/${m.id}`)} className="text-indigo-600 font-bold text-sm hover:underline decoration-2 underline-offset-4">
                        Rejoin →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPage;