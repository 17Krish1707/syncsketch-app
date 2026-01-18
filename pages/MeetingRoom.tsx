import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, ChatMessage, UserRole } from '../types';
import Whiteboard from '../components/Whiteboard';
import { realtime } from '../services/realtimeService';
import { summarizeMeeting } from '../services/geminiService';

interface Props {
  user: User;
}

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  uploadedBy: string;
  timestamp: number;
}

const MeetingRoom: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // REMOVED: const joinAttempted = useRef(false); <--- BUG SOURCE
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // WebRTC Refs
  const localStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  
  const [activeTab, setActiveTab] = useState('Whiteboard');
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [participants, setParticipants] = useState<any[]>([]);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string>('');

  const isHost = useMemo(() => user.role === UserRole.HOST, [user.role]);

  // WebRTC Setup
  const setupWebRTC = async () => {
    const socket = realtime.getSocket();

    // Clean up existing listeners to avoid duplicates on remount
    socket.off('user-connected');
    socket.off('offer');
    socket.off('answer');
    socket.off('ice-candidate');
    socket.off('user-disconnected');

    socket.on('user-connected', async ({ userId }) => {
      // Prevent connecting to self
      if (userId === user.id) return;
      
      const pc = createPeerConnection(userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { target: userId, sdp: offer });
    });

    socket.on("offer", async ({ from, sdp }) => {
        // 'from' matches server emission, previously was 'source' in some handlers
        // Ensure consistency with backend variable names
        if(!from) return; 

        let pc = peerConnections.current[from];
        if (!pc) {
            pc = createPeerConnection(from);
        }

        // Only accept offer if we are stable or don't have one
        if (pc.signalingState !== "stable") {
             // If we have a glare (two offers at once), rollback or ignore. 
             // For simplicity in this fix, we proceed but in production use "perfect negotiation" pattern.
             await Promise.all([
                pc.setLocalDescription({type: "rollback"} as any),
                pc.setRemoteDescription(new RTCSessionDescription(sdp))
             ]);
        } else {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            target: from,
            sdp: pc.localDescription,
        });
    });


    socket.on("answer", async ({ from, sdp }) => {
      const pc = peerConnections.current[from];
      if (!pc) return;
      
      if (pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    socket.on('ice-candidate', async ({ from, candidate }) => {
      const pc = peerConnections.current[from];
      if (pc) {
          try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
              console.error("Error adding ice candidate", e);
          }
      }
    });

    socket.on('user-disconnected', (userId) => {
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
        delete peerConnections.current[userId];
      }
    });
  };

  const createPeerConnection = (userId: string) => {
    // If one already exists, close it first
    if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnections.current[userId] = pc;

    // Use screenStream if active, otherwise localStream
    const activeOutStream = screenStream.current || localStream.current;
    if (activeOutStream) {
      activeOutStream.getTracks().forEach(track => pc.addTrack(track, activeOutStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        realtime.getSocket().emit('ice-candidate', { target: userId, candidate: event.candidate });
      }
    };

    return pc;
  };

  useEffect(() => {
    if (!id) return;
    
    // Always join when this effect runs (Mount)
    console.log("Joining room:", id);
    realtime.joinRoom(id, { id: user.id, name: user.name, role: user.role });
    
    setupWebRTC();
    
    // Load state
    setMessages(realtime.loadState(`chat_${id}`) || []);
    setFiles(realtime.loadState(`files_${id}`) || []);
    setSummary(realtime.loadState(`summary_${id}`) || '');
    
    // Subscribe to events
    const handleNewMessage = (msg: ChatMessage) => setMessages(prev => [...prev, msg]);
    const handleNewFile = (file: AttachedFile) => setFiles(prev => [...prev, file]);
    const handleSummary = (s: string) => setSummary(s);
    const handleUserConnected = (p: any) => setParticipants(prev => {
        // Prevent duplicates
        if (prev.find(existing => existing.id === p.id)) return prev;
        return [...prev, p];
    });
    const handleUserDisconnected = (uid: string) => setParticipants(prev => prev.filter(x => x.id !== uid));
    const handleMeetingEnded = () => { setMeetingEnded(true); setTimeout(() => navigate('/dashboard'), 3000); };

    realtime.subscribe('new_message', handleNewMessage);
    realtime.subscribe('new_file', handleNewFile);
    realtime.subscribe('new_summary', handleSummary);
    realtime.subscribe('user-connected', handleUserConnected);
    realtime.subscribe('user-disconnected', handleUserDisconnected);
    realtime.subscribe('meeting_ended_globally', handleMeetingEnded);
    
    return () => { 
      // Cleanup (Unmount)
      console.log("Leaving room:", id);
      if (id && user?.id) realtime.leaveRoom(id, user.id);
      
      // Unsubscribe
      realtime.unsubscribe('new_message', handleNewMessage);
      realtime.unsubscribe('new_file', handleNewFile);
      realtime.unsubscribe('new_summary', handleSummary);
      realtime.unsubscribe('user-connected', handleUserConnected);
      realtime.unsubscribe('user-disconnected', handleUserDisconnected);
      realtime.unsubscribe('meeting_ended_globally', handleMeetingEnded);

      // Clean up streams
      localStream.current?.getTracks().forEach(t => t.stop());
      screenStream.current?.getTracks().forEach(t => t.stop());
      
      // Close all peer connections
Object.values(peerConnections.current).forEach((pc) => (pc as RTCPeerConnection).close());      
peerConnections.current = {};
    };
  }, [id, user, navigate]); // Removed joinAttempted from logic

  // Handle Screen Share Start/Stop Logic
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStream.current = stream;
        setIsScreenSharing(true);

        const screenTrack = stream.getVideoTracks()[0];

        // Replace tracks for all active peer connections
     Object.values(peerConnections.current).forEach(
  (pc: RTCPeerConnection) => {
    const senders = pc.getSenders();
    const videoSender = senders.find(
      sender => sender.track?.kind === "video"
    );

    if (videoSender) {
      videoSender.replaceTrack(screenTrack);
    }
  }
);

        // Handle user stopping share via browser UI
        screenTrack.onended = () => {
          stopScreenSharing();
        };
      } catch (err) {
        console.error("Error starting screen share:", err);
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = () => {
    if (screenStream.current) {
      screenStream.current.getTracks().forEach(t => t.stop());
      screenStream.current = null;
    }
    setIsScreenSharing(false);

    // Revert to camera if active
const camTrack =
  localStream.current && localStream.current.getVideoTracks().length > 0
    ? localStream.current.getVideoTracks()[0]
    : null;
Object.values(peerConnections.current).forEach(
  (pc: RTCPeerConnection) => {
    const senders = pc.getSenders();
    const videoSender = senders.find(
      sender => sender.track?.kind === "video"
    );

    if (videoSender) {
      videoSender.replaceTrack(camTrack);
    }
  }
);
  }; // <--- ADDED MISSING CLOSING BRACE HERE

  // Handle Invite Generation Logic (WhatsApp, Email, Clipboard)
  const handleInvite = async () => {
    // Ensure we have a fully qualified URL. In HashRouter environments, window.location.href works,
    // but some browsers are strict about the protocol. Constructing manually to be safe.
    const meetingUrl = window.location.origin + window.location.pathname + window.location.search + window.location.hash;
    const inviteMessage = `Join my SyncSketch meeting at: ${meetingUrl}`;
    
    // Validate URL to prevent "Invalid URL" error in navigator.share
    let shareUrl = meetingUrl;
    try {
      new URL(shareUrl);
    } catch (e) {
      // If HashRouter or other factors make the URL "invalid" for native share, 
      // fallback to the origin or a simplified version
      shareUrl = window.location.origin;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SyncSketch Meeting Invitation',
          text: inviteMessage,
          url: shareUrl,
        });
      } catch (err) {
        console.error("Sharing failed", err);
        // Fallback if sharing fails due to URL issues
        await copyAndPrompt(inviteMessage);
      }
    } else {
      await copyAndPrompt(inviteMessage);
    }
  };

  const copyAndPrompt = async (message: string) => {
    await navigator.clipboard.writeText(message);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const emailUrl = `mailto:?subject=SyncSketch Meeting Invitation&body=${encodeURIComponent(message)}`;
    
    const choice = confirm("Meeting link copied to clipboard!\n\nClick OK to share via WhatsApp or Cancel for Email.");
    if (choice) {
      window.open(whatsappUrl, '_blank');
    } else {
      window.location.href = emailUrl;
    }
  };

const toggleMedia = async (type: "mic" | "cam") => {
  if (type === "cam") {
    if (!isCamOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: isMicOn
        });

        localStream.current = stream;
        setIsCamOn(true);

        if (!isScreenSharing) {
          const videoTrack = stream.getVideoTracks()[0];
          if (!videoTrack) return;

          Object.values(peerConnections.current).forEach(
            (pc: RTCPeerConnection) => {
              const videoSender = pc
                .getSenders()
                .find(s => s.track?.kind === "video");

              if (videoSender) {
                videoSender.replaceTrack(videoTrack);
              } else {
                pc.addTrack(videoTrack, stream);
              }
            }
          );
        }
      } catch {
        alert("Camera access denied");
      }
    } else {
      localStream.current?.getVideoTracks().forEach(t => t.stop());
      setIsCamOn(false);

      if (!isScreenSharing) {
        Object.values(peerConnections.current).forEach(
          (pc: RTCPeerConnection) => {
            const videoSender = pc
              .getSenders()
              .find(s => s.track?.kind === "video");

            if (videoSender) {
              videoSender.replaceTrack(null);
            }
          }
        );
      }
    }
  } else {
    // MIC TOGGLE
    if (!isMicOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) return;

        if (!localStream.current) {
          localStream.current = new MediaStream([audioTrack]);
        } else {
          localStream.current.addTrack(audioTrack);
        }

        setIsMicOn(true);

        Object.values(peerConnections.current).forEach(
          (pc: RTCPeerConnection) => {
            const audioSender = pc
              .getSenders()
              .find(s => s.track?.kind === "audio");

            if (audioSender) {
              audioSender.replaceTrack(audioTrack);
            } else {
              pc.addTrack(audioTrack, localStream.current!);
            }
          }
        );
      } catch {
        alert("Microphone access denied");
      }
    } else {
      localStream.current?.getAudioTracks().forEach(t => t.stop());
      setIsMicOn(false);

      Object.values(peerConnections.current).forEach(
        (pc: RTCPeerConnection) => {
          const audioSender = pc
            .getSenders()
            .find(s => s.track?.kind === "audio");

          if (audioSender) {
            audioSender.replaceTrack(null);
          }
        }
      );
    }
  }
};


  const sendMessage = () => {
    if (!inputText.trim() || !id) return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      text: inputText,
      timestamp: Date.now()
    };
    realtime.emit('new_message', msg);
    setMessages(prev => {
      const next = [...prev, msg];
      realtime.saveState(`chat_${id}`, next);
      return next;
    });
    setInputText('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const newFile: AttachedFile = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        url: event.target?.result as string,
        size: file.size,
        uploadedBy: user.name,
        timestamp: Date.now()
      };
      realtime.emit('new_file', newFile);
      setFiles(prev => {
        const next = [...prev, newFile];
        realtime.saveState(`files_${id}`, next);
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  const generateSummary = async () => {
    if (messages.length === 0) { alert("Need some chat messages to generate a summary!"); return; }
    setIsSummarizing(true);
    try {
      const transcript = messages.map(m => `${m.userName}: ${m.text}`);
      const result = await summarizeMeeting(transcript);
      if (result) {
        setSummary(result);
        realtime.emit('new_summary', result);
        realtime.saveState(`summary_${id}`, result);
      }
    } catch (error) { console.error("Summary failed", error); } finally { setIsSummarizing(false); }
  };

  const handleEndMeeting = () => {
    if (!isHost) return;
    if (confirm("End meeting for everyone?")) {
      realtime.emit('meeting_ended_globally', {});
      const current = realtime.loadState('collab_meetings') || [];
      realtime.saveState('collab_meetings', current.map((m: any) => m.id === id ? { ...m, ended: true } : m));
      navigate('/dashboard');
    }
  };

  if (meetingEnded) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-12 text-center">
      <div className="text-6xl mb-6">👋</div>
      <h2 className="text-3xl font-black text-slate-800 tracking-tight">The session has concluded</h2>
      <p className="text-slate-500 mt-2 font-medium">Thank you for your collaboration. Returning to dashboard...</p>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-white text-slate-800 overflow-hidden font-['Inter']">
      <nav className="fixed bottom-0 left-0 right-0 lg:relative lg:w-20 lg:h-full border-t lg:border-t-0 lg:border-r bg-white flex lg:flex-col items-center justify-around lg:justify-start lg:py-8 lg:space-y-10 z-[60] py-3 lg:shadow-none shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button className="hidden lg:flex w-12 h-12 bg-indigo-600 rounded-2xl items-center justify-center text-white font-black shadow-xl shadow-indigo-100 hover:scale-105 transition-transform" onClick={() => navigate('/dashboard')}>S</button>
        <NavItem icon="🏠" label="Space" active={activeTab === 'Workspace'} onClick={() => setActiveTab('Workspace')} />
        <NavItem icon="🎨" label="Board" active={activeTab === 'Whiteboard'} onClick={() => setActiveTab('Whiteboard')} />
        <NavItem icon="💬" label="Chat" active={showChat} onClick={() => setShowChat(!showChat)} />
        <NavItem icon="📷" label="Meet" active={activeTab === 'Meeting'} onClick={() => setActiveTab('Meeting')} />
        <NavItem icon="📁" label="Files" active={activeTab === 'Files'} onClick={() => setActiveTab('Files')} />
      </nav>

      <div className="flex-1 flex relative bg-slate-50 overflow-hidden pb-[70px] lg:pb-0">
        <div className="flex-1 relative flex flex-col min-w-0">
          <div className={`flex-1 relative ${activeTab === 'Whiteboard' ? 'block' : 'hidden'}`}>
            <Whiteboard user={user} meetingId={id || ''} />
          </div>

          {activeTab === 'Meeting' && (
            <div className="flex-1 p-4 lg:p-12 flex flex-col items-center justify-center bg-slate-50 overflow-y-auto">
              <div className="w-full max-w-4xl bg-white p-8 lg:p-12 rounded-[40px] shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="flex justify-between items-center mb-10">
                  <div className="text-left">
                    <h2 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">Meeting Control Center</h2>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">ID: {id}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={handleInvite}
                      className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors"
                    >
                      Invite
                    </button>
                    <div className="flex -space-x-3">
                      {participants.slice(0, 5).map((p, i) => (
                        <div key={i} className="w-10 h-10 rounded-full border-4 border-white bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-xs shadow-sm">
                          {p.name[0]}
                        </div>
                      ))}
                      {participants.length > 5 && <div className="w-10 h-10 rounded-full border-4 border-white bg-slate-800 text-white flex items-center justify-center font-bold text-[10px]">+{participants.length - 5}</div>}
                    </div>
                  </div>
                </div>

                <div className="aspect-video bg-slate-900 rounded-[32px] mb-10 flex flex-col items-center justify-center overflow-hidden border-[12px] border-slate-50 shadow-inner relative group">
                  <div className="text-slate-600 font-black text-sm lg:text-xl animate-pulse tracking-tighter">
                    {isScreenSharing ? 'SCREEN SHARING ACTIVE' : isCamOn ? 'LIVE STREAM ACTIVE' : 'NO VIDEO SIGNAL'}
                  </div>
                  {!isCamOn && !isScreenSharing && (
                    <div className="mt-4 px-6 py-2 bg-slate-800 text-slate-400 text-xs font-bold rounded-full uppercase tracking-widest">Camera Disabled</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 lg:gap-8 justify-center items-center">
                  <button onClick={() => toggleMedia('mic')} className={`w-14 h-14 lg:w-20 lg:h-20 rounded-[28px] flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${isMicOn ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                    <span className="text-2xl">{isMicOn ? '🎤' : '🔇'}</span>
                  </button>
                  <button onClick={() => toggleMedia('cam')} className={`w-14 h-14 lg:w-20 lg:h-20 rounded-[28px] flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${isCamOn ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                    <span className="text-2xl">{isCamOn ? '📷' : '🚫'}</span>
                  </button>
                  <button onClick={toggleScreenShare} className={`w-14 h-14 lg:w-20 lg:h-20 rounded-[28px] flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${isScreenSharing ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                    <span className="text-2xl">{isScreenSharing ? '🖥️' : '📽️'}</span>
                  </button>
                  <div className="h-12 w-px bg-slate-100 hidden sm:block" />
                  <button className="px-10 lg:px-14 py-4 lg:py-6 bg-rose-500 text-white font-black text-sm lg:text-base rounded-[28px] shadow-xl shadow-rose-100 hover:bg-rose-600 transition-all hover:-translate-y-1 active:scale-95 uppercase tracking-widest" onClick={isHost ? handleEndMeeting : () => navigate('/dashboard')}>
                    {isHost ? 'End Session' : 'Leave Meeting'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Files' && (
            <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl lg:text-4xl font-black text-slate-800 tracking-tight">Shared Files</h2>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  + Upload File
                </button>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              </div>
              
              {files.length === 0 ? (
                <div className="bg-white p-24 rounded-[40px] border-4 border-dashed border-slate-100 text-slate-300 text-center">
                   <div className="text-6xl mb-6 opacity-30">📁</div>
                   <p className="font-black uppercase tracking-[0.3em] text-sm">No files uploaded</p>
                   <p className="mt-4 font-bold text-slate-400">Share documents or assets with the team.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {files.map(file => (
                    <div key={file.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl">📄</div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-800 truncate" title={file.name}>{file.name}</h4>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 border-t pt-4">
                        <span>By {file.uploadedBy}</span>
                        <a href={file.url} download={file.name} className="text-indigo-600 uppercase tracking-widest hover:underline">Download</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Workspace' && (
            <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl lg:text-4xl font-black text-slate-800 tracking-tight">AI Workspace</h2>
                  <button 
                    disabled={isSummarizing}
                    onClick={generateSummary}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {isSummarizing ? 'Analyzing...' : '✨ Generate Summary'}
                  </button>
                </div>

                <div className="bg-white p-8 lg:p-12 rounded-[40px] shadow-sm border border-slate-100 min-h-[400px]">
                   <div className="flex items-center space-x-3 mb-6">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">🤖</div>
                      <div>
                        <h3 className="font-black text-slate-800 tracking-tight">Meeting Intelligence</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Powered by Gemini Pro</p>
                      </div>
                   </div>

                   {summary ? (
                     <div className="prose prose-slate max-w-none animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="whitespace-pre-wrap text-slate-700 leading-relaxed font-medium">
                          {summary}
                        </div>
                     </div>
                   ) : (
                     <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                        <p className="font-bold text-center max-w-xs">Generate an AI summary of your chat transcript to see key highlights and action items.</p>
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}
        </div>

        {showChat && (
          <div className="absolute lg:relative inset-0 lg:inset-auto lg:w-[400px] bg-white border-l shadow-2xl flex flex-col z-[70] animate-in slide-in-from-right duration-500 ease-out">
            <div className="p-6 border-b font-black text-[10px] tracking-[0.2em] uppercase flex justify-between items-center bg-slate-50/30">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span>Session Chat</span>
              </div>
              <button onClick={() => setShowChat(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-full transition-colors text-slate-400">✕</button>
            </div>
            <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-white">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <div className="text-4xl mb-4">💬</div>
                  <p className="font-bold text-sm text-center px-12">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={`flex flex-col ${m.userId === user.id ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-2 mb-1.5 px-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m.userName}</span>
                      <span className="text-[8px] font-bold text-slate-300">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className={`max-w-[85%] px-5 py-3.5 rounded-2xl text-sm font-medium shadow-sm ${m.userId === user.id ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-700 rounded-tl-none'}`}>
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-6 border-t bg-slate-50/50">
              <div className="flex space-x-3 bg-white p-2 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-500 transition-all shadow-sm">
                <input 
                  value={inputText} 
                  onChange={e => setInputText(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && sendMessage()} 
                  placeholder="Type a message..." 
                  className="flex-1 px-4 py-2 text-sm font-medium outline-none bg-transparent placeholder:text-slate-300" 
                />
                <button 
                  onClick={sendMessage} 
                  disabled={!inputText.trim()}
                  className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center transition-all hover:bg-indigo-700 disabled:opacity-30 active:scale-90"
                >
                  ➔
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: { icon: string, label: string, active: boolean, onClick: () => void }) => (
  <button onClick={onClick} className={`flex flex-col items-center transition-all group relative ${active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-800'}`}>
    {active && <div className="hidden lg:block absolute -left-0 w-1 h-8 bg-indigo-600 rounded-r-full"></div>}
    <div className={`w-11 h-11 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-xl lg:text-2xl transition-all ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-110' : 'bg-white border-2 border-slate-50 group-hover:border-slate-200 shadow-sm'}`}>{icon}</div>
    <span className={`text-[7px] lg:text-[10px] font-black uppercase tracking-widest mt-2 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 lg:group-hover:opacity-60 lg:group-hover:translate-y-0 transition-all'}`}>{label}</span>
  </button>
);

export default MeetingRoom;