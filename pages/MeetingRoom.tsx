import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, ChatMessage, UserRole, Meeting } from '../types';
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

const VideoPlayer = ({ stream, isLocal, name }: { stream: MediaStream; isLocal?: boolean; name: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative w-full h-full bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/50 shadow-lg">
      <video ref={videoRef} autoPlay playsInline muted={isLocal} className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`} />
      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-[10px] font-black uppercase tracking-widest border border-white/10 shadow-sm">{name} {isLocal && '(YOU)'}</div>
    </div>
  );
};

const MeetingRoom: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // WebRTC Refs
  const localStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  
  // --- STATE ---
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [activeTab, setActiveTab] = useState('Whiteboard');
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [participants, setParticipants] = useState<any[]>([]);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStreamState, setLocalStreamState] = useState<MediaStream | null>(null);
  
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string>('');

  // --- FIX: LIVE REFS FOR SYNC ---
  // These ensure the Host always sends the LATEST data, not old data from when the component loaded.
  const filesRef = useRef(files);
  const summaryRef = useRef(summary);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { summaryRef.current = summary; }, [summary]);
  // -------------------------------

  // --- DETERMINE HOST STATUS ---
  const isHost = useMemo(() => {
    const meetings = realtime.loadState('collab_meetings') || [];
    const currentMeeting = meetings.find((m: any) => m.id === id);
    return currentMeeting?.hostId === user.id;
  }, [id, user.id]);

  const effectiveUser = useMemo(() => ({
    ...user,
    role: isHost ? UserRole.HOST : UserRole.PARTICIPANT
  }), [user, isHost]);

  // --- HISTORY SYNC LOGIC ---
  const updateLocalHistory = (meetingData: Partial<Meeting>) => {
      if (!id) return;
      const history = realtime.loadState('collab_meetings') || [];
      const existingIndex = history.findIndex((m: any) => m.id === id);

      const newEntry: Meeting = {
          id: id,
          title: meetingData.title || `Joined Session ${id}`,
          hostId: meetingData.hostId || 'unknown',
          createdAt: meetingData.createdAt || Date.now(),
          lastModified: Date.now(),
          participants: [user.id] 
      };

      let updatedHistory;
      if (existingIndex >= 0) {
          updatedHistory = [...history];
          updatedHistory[existingIndex] = { ...updatedHistory[existingIndex], lastModified: Date.now() };
          if (meetingData.title && updatedHistory[existingIndex].title !== meetingData.title) {
              updatedHistory[existingIndex].title = meetingData.title;
          }
      } else {
          updatedHistory = [...history, newEntry];
      }
      realtime.saveState('collab_meetings', updatedHistory);
  };

  // --- WEBRTC SETUP ---
  const setupWebRTC = async () => {
    const socket = realtime.getSocket();
    socket.off('user-connected'); socket.off('offer'); socket.off('answer'); socket.off('ice-candidate'); socket.off('user-disconnected');

    socket.on('user-connected', async (payload) => {
      const connectingUserId = payload.user?.id || payload.userId;
      if (connectingUserId === user.id) return;
      
      // --- FIX: SEND LIVE DATA FROM REFS ---
      if (isHost) {
          const history = realtime.loadState('collab_meetings') || [];
          const myMeeting = history.find((m: any) => m.id === id);
          
          socket.emit('meeting_state_sync', { 
              type: 'full_sync', 
              meeting: myMeeting,
              files: filesRef.current,      // <--- Send CURRENT files
              summary: summaryRef.current   // <--- Send CURRENT summary
          });
      }
      // -------------------------------------

      const targetSocketId = payload.id || payload.userId; 
      const pc = createPeerConnection(targetSocketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { target: targetSocketId, sdp: offer });
    });

    socket.on("offer", async ({ from, sdp }) => {
        if(!from) return; 
        let pc = peerConnections.current[from];
        if (!pc) pc = createPeerConnection(from);
        if (pc.signalingState !== "stable") {
             await Promise.all([pc.setLocalDescription({type: "rollback"} as any), pc.setRemoteDescription(new RTCSessionDescription(sdp))]);
        } else { await pc.setRemoteDescription(new RTCSessionDescription(sdp)); }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { target: from, sdp: pc.localDescription });
    });

    socket.on("answer", async ({ from, sdp }) => {
      const pc = peerConnections.current[from];
      if (!pc) return;
      if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    socket.on('ice-candidate', async ({ from, candidate }) => {
      const pc = peerConnections.current[from];
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('user-disconnected', (userId) => {
      if (peerConnections.current[userId]) {
        (peerConnections.current[userId] as RTCPeerConnection).close();
        delete peerConnections.current[userId];
      }
      setRemoteStreams(prev => { const next = { ...prev }; delete next[userId]; return next; });
    });
  };

  const createPeerConnection = (userId: string) => {
    if (peerConnections.current[userId]) (peerConnections.current[userId] as RTCPeerConnection).close();
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnections.current[userId] = pc;
    
    if (localStream.current) {
        localStream.current.getTracks().forEach(track => {
            pc.addTrack(track, localStream.current!);
        });
    }
    if (screenStream.current) {
         screenStream.current.getTracks().forEach(track => pc.addTrack(track, screenStream.current!));
    }

    pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) setRemoteStreams(prev => ({ ...prev, [userId]: remoteStream }));
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) realtime.getSocket().emit('ice-candidate', { target: userId, candidate: event.candidate });
    };
    return pc;
  };

  useEffect(() => {
    if (!id) return;
    realtime.joinRoom(id, { id: user.id, name: user.name, role: isHost ? 'host' : 'participant' });
    setupWebRTC();
    
    updateLocalHistory({}); 

    setMessages(realtime.loadState(`chat_${id}`) || []);
    setFiles(realtime.loadState(`files_${id}`) || []);
    setSummary(realtime.loadState(`summary_${id}`) || '');
    
    // Initialize Self in List
    setParticipants([{ id: user.id, name: user.name || "You", role: isHost ? 'host' : 'participant' }]);

    const handleNewMessage = (msg: ChatMessage) => setMessages(prev => [...prev, msg]);
    
    // --- FILE RECEIVER ---
    const handleNewFile = (file: AttachedFile) => {
        setFiles(prev => {
            if (prev.find(f => f.id === file.id)) return prev;
            return [...prev, file];
        });
    };
    
    const handleSummary = (s: string) => setSummary(s);
    
    const addParticipant = (payload: any) => {
        const newParticipant = payload.user ? {
            id: payload.user.id,
            name: payload.user.name,
            role: payload.user.role,
            socketId: payload.id
        } : payload;

        setParticipants(prev => { 
            if (prev.some(existing => existing.id === newParticipant.id)) return prev; 
            return [...prev, newParticipant]; 
        });
    };

    const handleUserConnected = (payload: any) => addParticipant(payload);
    
    const handleUserDisconnected = (uid: string) => setParticipants(prev => prev.filter(x => x.id !== uid && x.socketId !== uid));
    const handleMeetingEnded = () => { setMeetingEnded(true); setTimeout(() => navigate('/dashboard'), 3000); };
    
    const handleSync = (data: any) => {
        if (data && data.type === 'full_sync') {
            if (data.meeting) updateLocalHistory(data.meeting);
            if (data.files && Array.isArray(data.files)) {
                setFiles(prev => {
                    const newFiles = data.files.filter((f: AttachedFile) => !prev.find(p => p.id === f.id));
                    return [...prev, ...newFiles];
                });
            }
            if (data.summary) setSummary(data.summary);
        } else if (data && data.type === 'meta_sync' && data.meeting) {
            updateLocalHistory(data.meeting);
        }
    };

    const socket = realtime.getSocket();

    socket.on('meeting-ended-error', () => {
        setMeetingEnded(true);
    });

    // --- REJOIN / ROLL CALL SYSTEM ---
    socket.on('presence_ping', (remoteUser: any) => {
        if (!remoteUser || remoteUser.id === user.id) return;
        addParticipant(remoteUser);
        // Only host needs to pong to maintain authority list, or everyone can
        setTimeout(() => {
             socket.emit('presence_pong', { 
                 id: user.id, 
                 name: user.name, 
                 role: isHost ? 'host' : 'participant' 
             });
        }, Math.random() * 1000);
    });

    socket.on('presence_pong', (remoteUser: any) => {
        if (!remoteUser || remoteUser.id === user.id) return;
        addParticipant(remoteUser);
    });

    // Broadcast "I'm here" immediately
    socket.emit('presence_ping', { 
        id: user.id, 
        name: user.name, 
        role: isHost ? 'host' : 'participant' 
    });

    realtime.subscribe('new_message', handleNewMessage);
    realtime.subscribe('new_file', handleNewFile); // LISTEN FOR FILES
    realtime.subscribe('new_summary', handleSummary);
    realtime.subscribe('user-connected', handleUserConnected);
    realtime.subscribe('user-disconnected', handleUserDisconnected);
    realtime.subscribe('meeting_ended_globally', handleMeetingEnded);
    
    socket.on('meeting_state_sync', handleSync); 
    socket.on('admin-kick', () => { alert("You have been removed by the host."); navigate('/dashboard'); });
    socket.on('admin-mute', () => { 
        alert("The host has muted your microphone."); 
        setIsMicOn(false); 
        if (localStream.current) {
            localStream.current.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
        }
    });
    
    return () => { 
      if (id && user?.id) realtime.leaveRoom(id, user.id);
      realtime.unsubscribe('new_message', handleNewMessage);
      realtime.unsubscribe('new_file', handleNewFile);
      realtime.unsubscribe('new_summary', handleSummary);
      realtime.unsubscribe('user-connected', handleUserConnected);
      realtime.unsubscribe('user-disconnected', handleUserDisconnected);
      realtime.unsubscribe('meeting_ended_globally', handleMeetingEnded);
      socket.off('meeting_state_sync', handleSync);
      socket.off('admin-kick');
      socket.off('admin-mute');
      socket.off('presence_ping');
      socket.off('presence_pong');
      socket.off('meeting-ended-error'); 
      
      localStream.current?.getTracks().forEach(t => t.stop());
      screenStream.current?.getTracks().forEach(t => t.stop());
      Object.values(peerConnections.current).forEach(pc => (pc as RTCPeerConnection).close());
      peerConnections.current = {};
    };
  }, [id, user, navigate, isHost]); 

  const toggleMedia = async (type: "mic" | "cam") => {
    if (type === 'cam') {
        if (!isCamOn) {
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const videoTrack = videoStream.getVideoTracks()[0];
                setIsCamOn(true);
                if (!localStream.current) localStream.current = new MediaStream();
                localStream.current.addTrack(videoTrack);
                setLocalStreamState(new MediaStream(localStream.current.getTracks()));
                replaceVideoTrack(videoTrack);
            } catch(e) { console.error(e); alert("Camera access denied"); }
        } else {
            setIsCamOn(false);
            if (localStream.current) {
                const videoTrack = localStream.current.getVideoTracks()[0];
                if (videoTrack) { videoTrack.stop(); localStream.current.removeTrack(videoTrack); }
                setLocalStreamState(new MediaStream(localStream.current.getTracks()));
                replaceVideoTrack(null);
            }
        }
    } else if (type === 'mic') {
        if (!isMicOn) {
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const audioTrack = audioStream.getAudioTracks()[0];
                setIsMicOn(true);
                if (!localStream.current) localStream.current = new MediaStream();
                localStream.current.addTrack(audioTrack);
                Object.values(peerConnections.current).forEach(pc => {
                    (pc as RTCPeerConnection).addTrack(audioTrack, localStream.current!);
                });
            } catch(e) { console.error(e); alert("Mic access denied"); }
        } else {
            setIsMicOn(false);
            if (localStream.current) {
                const audioTrack = localStream.current.getAudioTracks()[0];
                if (audioTrack) { audioTrack.stop(); localStream.current.removeTrack(audioTrack); }
                Object.values(peerConnections.current).forEach(pc => {
                    const sender = (pc as RTCPeerConnection).getSenders().find(s => s.track?.kind === 'audio');
                    if (sender) (pc as RTCPeerConnection).removeTrack(sender);
                });
            }
        }
    }
  };

  const toggleScreenShare = async () => {
      if (isScreenSharing) stopScreenSharing();
      else {
          try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
              screenStream.current = stream; setIsScreenSharing(true); setLocalStreamState(stream);
              const screenTrack = stream.getVideoTracks()[0]; screenTrack.onended = () => stopScreenSharing(); replaceVideoTrack(screenTrack);
          } catch (e) { console.log("Screen share cancelled"); }
      }
  };

  const stopScreenSharing = async () => {
      screenStream.current?.getTracks().forEach(t => t.stop()); screenStream.current = null; setIsScreenSharing(false);
      if (isCamOn && localStream.current) {
          const videoTrack = localStream.current.getVideoTracks()[0];
          if (videoTrack) { setLocalStreamState(new MediaStream([videoTrack])); replaceVideoTrack(videoTrack); return; }
      }
      setLocalStreamState(null); replaceVideoTrack(null);
  };

  const replaceVideoTrack = (newTrack: MediaStreamTrack | null) => {
      Object.values(peerConnections.current).forEach(pc => {
          const peer = pc as RTCPeerConnection;
          const sender = peer.getSenders().find(s => s.track?.kind === 'video');
          if (sender) { if (newTrack) sender.replaceTrack(newTrack); else try { sender.replaceTrack(null); } catch(e){} }
          else if (newTrack) peer.addTrack(newTrack, localStream.current || screenStream.current!);
      });
  };

  const handleKickUser = (targetId: string) => {
      if (!isHost) return;
      if (confirm("Kick this user?")) realtime.getSocket().emit('admin-action', { type: 'kick', targetId });
  };
  const handleMuteUser = (targetId: string) => {
      if (!isHost) return;
      realtime.getSocket().emit('admin-action', { type: 'mute', targetId });
      alert("User muted.");
  };

  const handleInvite = async () => {
    const url = window.location.href; const text = `Join my SyncSketch session! ID: ${id}`;
    if (navigator.share) try { await navigator.share({ title: 'SyncSketch Invite', text, url }); } catch (err) {}
    else try { await navigator.clipboard.writeText(url); alert("Link copied!"); } catch (err) {}
  };

  const handleLeave = () => navigate('/dashboard');
  const handleEndSession = () => { if (!isHost) return; if (confirm("End this session for everyone?")) { realtime.getSocket().emit('end_meeting', id); navigate('/dashboard'); }};

  const sendMessage = () => {
    if (!inputText.trim() || !id) return;
    const msg: ChatMessage = { id: Math.random().toString(36).substr(2, 9), userId: user.id, userName: user.name, text: inputText, timestamp: Date.now() };
    realtime.emit('new_message', msg); setMessages(prev => [...prev, msg]); setInputText('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const newFile: AttachedFile = { id: Math.random().toString(36).substr(2, 9), name: file.name, type: file.type, url: event.target?.result as string, size: file.size, uploadedBy: user.name, timestamp: Date.now() };
      // UPDATE LOCALLY FIRST
      setFiles(prev => [...prev, newFile]);
      // BROADCAST TO OTHERS
      realtime.emit('new_file', newFile); 
    };
    reader.readAsDataURL(file);
  };

  const generateSummary = async () => {
    if (messages.length === 0) { alert("Need messages!"); return; } setIsSummarizing(true);
    try { const transcript = messages.map(m => `${m.userName}: ${m.text}`); const result = await summarizeMeeting(transcript); if (result) { setSummary(result); realtime.emit('new_summary', result); } } catch {} finally { setIsSummarizing(false); }
  };

  const renderParticipantBubbles = (overlayMode = false) => (
    <div className={`flex -space-x-3 ${overlayMode ? 'justify-end' : ''}`}>
        {participants.slice(0, 5).map((p, i) => (
            <div key={i} className="w-10 h-10 rounded-full border-4 border-white flex items-center justify-center font-bold text-xs shadow-sm bg-indigo-100 text-indigo-700">
                {(p.name || "U")[0]?.toUpperCase()}
            </div>
        ))}
        {participants.length > 5 && <div className="w-10 h-10 rounded-full border-4 border-white bg-slate-800 text-white flex items-center justify-center font-bold text-[10px]">+{participants.length - 5}</div>}
    </div>
  );

  if (meetingEnded) return <div className="h-screen flex flex-col items-center justify-center bg-slate-50 font-['Inter']">
      <div className="bg-white p-12 rounded-[32px] shadow-2xl text-center max-w-lg mx-4">
          <div className="text-6xl mb-6">👋</div>
          <h1 className="text-3xl font-black text-slate-800 mb-2">Session Ended</h1>
          <p className="text-slate-500 font-medium mb-8">The host has ended this meeting.</p>
          <button onClick={() => navigate('/dashboard')} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200">Return to Dashboard</button>
      </div>
  </div>;

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-white text-slate-800 overflow-hidden font-['Inter']">
      <nav className="fixed bottom-0 left-0 right-0 lg:relative lg:w-20 lg:h-full border-t lg:border-t-0 lg:border-r bg-white flex lg:flex-col items-center justify-around lg:justify-start lg:py-8 lg:space-y-10 z-[60] py-3 lg:shadow-none shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button className="hidden lg:flex w-12 h-12 bg-indigo-600 rounded-2xl items-center justify-center text-white font-black shadow-xl shadow-indigo-100 hover:scale-105 transition-transform" onClick={() => navigate('/dashboard')}>S</button>
        <NavItem icon="🏠" label="Space" active={activeTab === 'Workspace'} onClick={() => setActiveTab('Workspace')} />
        <NavItem icon="🎨" label="Board" active={activeTab === 'Whiteboard'} onClick={() => setActiveTab('Whiteboard')} />
        <NavItem icon="💬" label="Chat" active={showChat} onClick={() => setShowChat(!showChat)} />
        <NavItem icon="📷" label="Meet" active={activeTab === 'Meeting'} onClick={() => setActiveTab('Meeting')} />
        <NavItem icon="📁" label="Files" active={activeTab === 'Files'} onClick={() => setActiveTab('Files')} />
        <NavItem icon="👥" label="People" active={activeTab === 'Participants'} onClick={() => setActiveTab('Participants')} />
      </nav>

      <div className="flex-1 flex relative bg-slate-50 overflow-hidden pb-[70px] lg:pb-0">
        <div className="flex-1 relative flex flex-col min-w-0">
          <div className={`flex-1 relative ${activeTab === 'Whiteboard' ? 'block' : 'hidden'}`}>
            <Whiteboard user={effectiveUser} meetingId={id || ''} />
            <div className="absolute top-6 right-6 z-50 flex items-center space-x-3 bg-white/90 backdrop-blur-sm p-2 rounded-full border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Active</div>
                {renderParticipantBubbles(true)}
            </div>
          </div>

          {activeTab === 'Meeting' && (
            <div className="flex-1 p-4 lg:p-12 flex flex-col items-center justify-center bg-slate-50 overflow-y-auto">
              <div className="w-full max-w-5xl bg-white p-6 lg:p-10 rounded-[40px] shadow-2xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="flex justify-between items-center mb-8">
                  <div className="text-left"><h2 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">Meeting Control Center</h2><p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">ID: {id}</p></div>
                  <div className="flex items-center space-x-3"><button onClick={handleInvite} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors">Invite</button>{renderParticipantBubbles(false)}</div>
                </div>
                <div className="aspect-video bg-slate-900 rounded-[32px] mb-8 overflow-hidden border-[12px] border-slate-50 shadow-inner relative group">
                  {(localStreamState || Object.keys(remoteStreams).length > 0) ? (
                      <div className={`w-full h-full grid gap-2 p-2 ${Object.keys(remoteStreams).length === 0 ? 'grid-cols-1' : Object.keys(remoteStreams).length === 1 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
                          {localStreamState && <VideoPlayer stream={localStreamState} isLocal={true} name={isScreenSharing ? "Your Screen" : user.name} />}
                          {Object.entries(remoteStreams).map(([uid, stream]) => { const pName = participants.find(p => p.id === uid)?.name || "Participant"; return <VideoPlayer key={uid} stream={stream} name={pName} />; })}
                      </div>
                  ) : (<div className="flex flex-col items-center justify-center h-full w-full"><div className="text-slate-600 font-black text-sm lg:text-xl animate-pulse tracking-tighter">WAITING FOR VIDEO...</div><div className="mt-4 px-6 py-2 bg-slate-800 text-slate-400 text-xs font-bold rounded-full uppercase tracking-widest">Cameras & Screens Off</div></div>)}
                </div>
                <div className="flex flex-wrap gap-4 lg:gap-8 justify-center items-center">
                  <button onClick={() => toggleMedia('mic')} className={`w-14 h-14 lg:w-20 lg:h-20 rounded-[28px] flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${isMicOn ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}><span className="text-2xl">{isMicOn ? '🎤' : '🔇'}</span></button>
                  <button onClick={() => toggleMedia('cam')} className={`w-14 h-14 lg:w-20 lg:h-20 rounded-[28px] flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${isCamOn ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}><span className="text-2xl">{isCamOn ? '📷' : '🚫'}</span></button>
                  <button onClick={toggleScreenShare} className={`w-14 h-14 lg:w-20 lg:h-20 rounded-[28px] flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${isScreenSharing ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}><span className="text-2xl">🖥️</span></button>
                  <div className="h-12 w-px bg-slate-100 hidden sm:block" />
                  {isHost ? (<><button onClick={handleLeave} className="px-6 py-4 bg-slate-100 text-slate-600 font-black text-sm rounded-[28px] hover:bg-slate-200 transition-colors uppercase tracking-widest">Leave</button><button onClick={handleEndSession} className="px-8 py-4 bg-rose-500 text-white font-black text-sm rounded-[28px] shadow-xl shadow-rose-100 hover:bg-rose-600 transition-all uppercase tracking-widest">End Session</button></>) : (<button onClick={handleLeave} className="px-10 lg:px-14 py-4 lg:py-6 bg-rose-500 text-white font-black text-sm lg:text-base rounded-[28px] shadow-xl shadow-rose-100 hover:bg-rose-600 transition-all uppercase tracking-widest">Leave Meeting</button>)}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Files' && (
             <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
               <div className="flex justify-between items-center mb-8"><h2 className="text-2xl lg:text-4xl font-black text-slate-800 tracking-tight">Shared Files</h2>
               <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl">+ Upload File</button>
               <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
               </div>
               {files.map(file => <div key={file.id} className="bg-white p-6 mb-4 rounded-3xl shadow-sm border border-slate-100 flex justify-between"><div><h4 className="font-bold text-slate-800">{file.name}</h4><p className="text-[10px] text-slate-400 font-bold uppercase">{(file.size/1024).toFixed(1)} KB • {file.uploadedBy}</p></div><a href={file.url} download={file.name} className="text-indigo-600 font-bold text-xs uppercase tracking-widest">Download</a></div>)}
             </div>
          )}
          {activeTab === 'Workspace' && (
             <div className="flex-1 p-6 lg:p-12 overflow-y-auto"><div className="max-w-4xl mx-auto"><div className="flex justify-between items-center mb-8"><h2 className="text-2xl lg:text-4xl font-black text-slate-800 tracking-tight">AI Workspace</h2><button onClick={generateSummary} disabled={isSummarizing} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl">{isSummarizing ? 'Analyzing...' : 'Generate Summary'}</button></div><div className="bg-white p-12 rounded-[40px] shadow-sm border border-slate-100 min-h-[400px] whitespace-pre-wrap font-medium text-slate-700">{summary || <div className="text-center text-slate-300 mt-20">No summary generated yet.</div>}</div></div></div>
          )}
          
          {/* --- DEDICATED PARTICIPANTS TAB --- */}
          {activeTab === 'Participants' && (
             <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
               <div className="max-w-2xl mx-auto bg-white p-8 rounded-[32px] shadow-xl border border-slate-100">
                   <h2 className="text-2xl font-black text-slate-800 mb-6">Participants ({participants.length})</h2>
                   <div className="space-y-4">
                       {participants.map((p) => {
                           const isMe = p.id === user.id;
                           const isPHost = p.role === 'host';
                           return (
                               <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                                   <div className="flex items-center space-x-4">
                                       <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${isPHost ? 'bg-amber-500' : 'bg-indigo-500'}`}>{p.name?.[0] || "U"}</div>
                                       <div>
                                           <p className="font-bold text-slate-800">{p.name || "User"} {isMe && "(You)"}</p>
                                           <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">{isPHost ? "Host" : "Participant"}</p>
                                       </div>
                                   </div>
                                   {isHost && !isMe && (
                                       <div className="flex space-x-2">
                                           <button onClick={() => handleMuteUser(p.id)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Mute 🔇</button>
                                           <button onClick={() => handleKickUser(p.id)} className="px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-100">Kick 🚫</button>
                                       </div>
                                   )}
                               </div>
                           );
                       })}
                   </div>
               </div>
             </div>
          )}
        </div>

        {showChat && (
          <div className="absolute lg:relative inset-0 lg:inset-auto lg:w-[400px] bg-white border-l shadow-2xl flex flex-col z-[70] animate-in slide-in-from-right duration-500 ease-out">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50/30"><h3 className="font-black text-[10px] tracking-[0.2em] uppercase">Session Chat</h3><button onClick={() => setShowChat(false)} className="text-slate-400">✕</button></div>
            <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-white">
              {messages.map(m => (
                <div key={m.id} className={`flex flex-col ${m.userId === user.id ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center space-x-2 mb-1.5 px-1"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m.userName}</span></div>
                  <div className={`max-w-[85%] px-5 py-3.5 rounded-2xl text-sm font-medium shadow-sm ${m.userId === user.id ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-700 rounded-tl-none'}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t bg-slate-50/50">
              <div className="flex space-x-3 bg-white p-2 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-500 transition-all shadow-sm">
                <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Type a message..." className="flex-1 px-4 py-2 text-sm font-medium outline-none bg-transparent placeholder:text-slate-300" />
                <button onClick={sendMessage} className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center transition-all hover:bg-indigo-700 active:scale-90">➔</button>
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