
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';

interface Props {
  user: User;
}

const HistoryPage: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="flex items-center space-x-4 mb-8">
        <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
        <h1 className="text-3xl font-bold">Meeting History</h1>
      </header>
      
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Meeting Name</th>
              <th className="p-4 font-semibold text-gray-600">Date</th>
              <th className="p-4 font-semibold text-gray-600">Participants</th>
              <th className="p-4 font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[1, 2, 3].map(i => (
              <tr key={i} className="hover:bg-gray-50 transition">
                <td className="p-4">
                  <p className="font-bold">Team Sync #{i}</p>
                  <p className="text-xs text-gray-400">ID: ABCX{i}Y</p>
                </td>
                <td className="p-4 text-sm text-gray-500">
                  Oct {20 - i}, 2023
                </td>
                <td className="p-4">
                   <div className="flex -space-x-2">
                    {[1, 2].map(u => <div key={u} className="w-6 h-6 rounded-full border-2 border-white bg-gray-200"></div>)}
                   </div>
                </td>
                <td className="p-4">
                  <button className="text-indigo-600 font-semibold hover:underline">View Recap</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoryPage;
