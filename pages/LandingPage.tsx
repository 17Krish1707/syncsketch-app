import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { Rocket, Mic, Bot } from 'lucide-react';
import axios from 'axios';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // 🔹 Points to your backend (Vercel or Localhost)
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    try {
      if (credentialResponse.credential) {
        console.log("Google Credential received, sending to backend...");
        
        const res = await axios.post(`${BACKEND_URL}/auth/google`, {
          token: credentialResponse.credential,
        });

        console.log("Login successful:", res.data);

        // 1. Save user data
        localStorage.setItem('user', JSON.stringify(res.data.user));
        localStorage.setItem('token', res.data.token);

        // 2. Redirect to Dashboard
        navigate('/dashboard'); 
      }
    } catch (err) {
      console.error("Google Login Error:", err);
      setError('Google Sign-In failed. Please try again.');
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder for manual login logic
    console.log("Manual login attempted with:", email);
    // For now, we focus on Google Login as requested
    alert("Please use Google Sign-In for this demo!");
  };

  return (
    <div className="flex min-h-screen bg-white font-sans">
      
      {/* --- LEFT COLUMN (Purple Design) --- */}
      <div className="hidden lg:flex w-1/2 bg-indigo-600 p-12 flex-col justify-center text-white relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-lg mx-auto">
          <h1 className="text-5xl font-bold leading-tight mb-6">
            Collaborate without boundaries.
          </h1>
          <p className="text-indigo-100 text-lg mb-12 leading-relaxed">
            The all-in-one meeting platform with infinite whiteboard, real-time AI assistance, and integrated voice/video. Built for high-performance teams.
          </p>

          <div className="space-y-6">
            {/* Feature 1 */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Rocket className="w-6 h-6 text-indigo-100" />
              </div>
              <span className="text-lg font-medium">Real-time collaborative whiteboard</span>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Mic className="w-6 h-6 text-indigo-100" />
              </div>
              <span className="text-lg font-medium">Crystal clear audio & video</span>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Bot className="w-6 h-6 text-indigo-100" />
              </div>
              <span className="text-lg font-medium">AI-driven diagramming & summaries</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- RIGHT COLUMN (Clean White Form) --- */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-24 bg-white">
        <div className="w-full max-w-md space-y-8">
          
          {/* Header */}
          <div className="text-left">
            <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-2 text-gray-500">Enter your details to get started.</p>
          </div>

          {/* Google Button Section */}
          <div className="w-full">
            <div className="flex justify-center w-full">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google Login Failed')}
                theme="outline"
                size="large"
                width="400" 
                text="signin_with"
                shape="rectangular"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>

          {/* Manual Form */}
          <form className="mt-8 space-y-6" onSubmit={handleManualLogin}>
            <div className="space-y-5">
              
              {/* Email Input */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-200 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all bg-gray-50"
                />
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-200 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all bg-gray-50"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-lg shadow-indigo-200"
              >
                Sign In
              </button>
            </div>
          </form>

          {/* Footer Link */}
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500">
                Sign up
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;