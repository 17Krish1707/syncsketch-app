
import React, { useState } from 'react';
import { User, UserRole } from '../types';

interface Props {
  onLogin: (user: User) => void;
}

const LandingPage: React.FC<Props> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.PARTICIPANT);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, use real JWT auth
    onLogin({
      id: Math.random().toString(36).substr(2, 9),
      email,
      name: name || email.split('@')[0],
      role: isLogin ? UserRole.PARTICIPANT : role,
    });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row">
      <div className="md:w-1/2 bg-indigo-600 text-white p-12 flex flex-col justify-center">
        <h1 className="text-5xl font-bold mb-6">Collaborate without boundaries.</h1>
        <p className="text-xl text-indigo-100 mb-8">
          The all-in-one meeting platform with infinite whiteboard, real-time AI assistance, 
          and integrated voice/video. Built for high-performance teams.
        </p>
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="bg-indigo-500 p-2 rounded-lg">🚀</div>
            <p>Real-time collaborative whiteboard</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-indigo-500 p-2 rounded-lg">🎤</div>
            <p>Crystal clear audio & video</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-indigo-500 p-2 rounded-lg">🤖</div>
            <p>AI-driven diagramming & summaries</p>
          </div>
        </div>
      </div>
      
      <div className="md:w-1/2 p-12 bg-white flex flex-col justify-center">
        <div className="max-w-md mx-auto w-full">
          <h2 className="text-3xl font-bold mb-2">{isLogin ? 'Welcome back' : 'Create an account'}</h2>
          <p className="text-gray-500 mb-8">Enter your details to get started.</p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input 
                  type="text" required value={name} onChange={e => setName(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Email Address</label>
              <input 
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input 
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium mb-1">Initial Role</label>
                <select 
                  value={role} onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value={UserRole.PARTICIPANT}>Participant</option>
                  <option value={UserRole.HOST}>Host / Facilitator</option>
                  <option value={UserRole.ADMIN}>Administrator</option>
                </select>
              </div>
            )}
            <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
          
          <p className="mt-6 text-center text-sm text-gray-500">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="ml-1 text-indigo-600 font-semibold hover:underline"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
