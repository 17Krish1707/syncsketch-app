import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { BoardElement, User, CursorPosition, BoardOperation, UserRole, MeetingState } from '../types';
import { realtime } from '../services/realtimeService';
import { beautifyBoard } from '../services/geminiService';

interface Props {
  user: User;
  meetingId: string;
}

type ToolType = 'select' | 'pen' | 'rect' | 'circle' | 'text' | 'sticky' | 'erase';

interface LocalParticipant extends User {
  isDrawing: boolean;
  isTyping: boolean;
  lastSeen: number;
  isSharingScreen?: boolean;
  color: string;
  selectedElementId?: string | null;
}

// Add userName to the tracked cursor state
type TrackedCursor = CursorPosition & { color: string; userName?: string };

const USER_COLORS = [
  '#4F46E5', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6'
];

const Whiteboard: React.FC<Props> = ({ user, meetingId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const lastEmitTime = useRef<number>(0);
  
  // State
  const [operations, setOperations] = useState<BoardOperation[]>([]);
  const [undoneOperations, setUndoneOperations] = useState<BoardOperation[]>([]);
  const [meetingState, setMeetingState] = useState<MeetingState>({ isLocked: false, hostId: '' });
  const [tool, setTool] = useState<ToolType>('pen');
  const [isDragging, setIsDragging] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number, y: number }[]>([]);
  
  // UPDATED: Track cursors with userName
  const [cursors, setCursors] = useState<Record<string, TrackedCursor>>({});
  
  const [liveParticipants, setLiveParticipants] = useState<Record<string, LocalParticipant>>({});
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  
  // Selection & Manipulation
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Styles
  const [strokeColor, setStrokeColor] = useState('#4F46E5');
  const [strokeWidth, setStrokeWidth] = useState(3);

  const isHost = useMemo(() => user.role === UserRole.HOST || meetingState.hostId === user.id, [user.role, meetingState.hostId, user.id]);
  const canDraw = useMemo(() => !meetingState.isLocked || isHost, [meetingState.isLocked, isHost]);

  // Derived state: Deterministically calculate current elements from operations
  const elements = useMemo(() => {
    const elMap = new Map<string, BoardElement>();
    const sortedOps = [...operations].sort((a, b) => a.timestamp - b.timestamp);
    for (const op of sortedOps) {
      if (op.type === 'add' && op.element) elMap.set(op.element.id, op.element);
      else if (op.type === 'delete' && op.elementId) elMap.delete(op.elementId);
      else if (op.type === 'update' && op.element) elMap.set(op.element.id, op.element);
      else if (op.type === 'reset') elMap.clear();
    }
    return Array.from(elMap.values());
  }, [operations]);

  const getUserColor = (userId: string) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  };

  const drawElement = useCallback((ctx: CanvasRenderingContext2D, el: BoardElement) => {
    ctx.save();
    const remoteSelector = (Object.values(liveParticipants) as LocalParticipant[]).find(p => p.selectedElementId === el.id && p.id !== user.id);
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = el.strokeWidth || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (selectedIds.includes(el.id)) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#4F46E5';
      ctx.lineWidth = 2;
      ctx.strokeRect(el.x - 6, el.y - 6, (el.width || 10) + 12, (el.height || 10) + 12);
      ctx.setLineDash([]);
    } else if (remoteSelector) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = remoteSelector.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(el.x - 6, el.y - 6, (el.width || 10) + 12, (el.height || 10) + 12);
      ctx.setLineDash([]);
    }

    switch (el.type) {
      case 'path':
        if (el.points && el.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length - 1; i++) {
            const xc = (el.points[i].x + el.points[i + 1].x) / 2;
            const yc = (el.points[i].y + el.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, xc, yc);
          }
          ctx.stroke();
        }
        break;
      case 'rect': ctx.strokeRect(el.x, el.y, el.width || 0, el.height || 0); break;
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(el.x + (el.width! / 2), el.y + (el.height! / 2), Math.abs(el.width! / 2), Math.abs(el.height! / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'sticky':
        ctx.shadowBlur = 4; ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.fillStyle = el.color || '#FEF3C7';
        ctx.beginPath(); ctx.roundRect(el.x, el.y, el.width || 150, el.height || 150, 4); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1e293b'; ctx.font = `500 14px Inter`;
        const lines = (el.content || '').split('\n');
        lines.forEach((line, i) => ctx.fillText(line, el.x + 12, el.y + 30 + (i * 18), el.width! - 24));
        break;
      case 'text':
        ctx.fillStyle = el.color || '#000000';
        ctx.font = `600 20px Inter`; ctx.fillText(el.content || '', el.x, el.y + 20);
        break;
    }
    ctx.restore();
  }, [selectedIds, liveParticipants, user.id]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw Grid
    ctx.save();
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    ctx.restore();

    // 2. Draw Elements
    elements.forEach(el => drawElement(ctx, el));
    
    // 3. Draw Current Path (Being drawn by self)
    if (isDragging && tool === 'pen' && currentPath.length > 0) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length - 1; i++) {
        const xc = (currentPath[i].x + currentPath[i + 1].x) / 2;
        const yc = (currentPath[i].y + currentPath[i + 1].y) / 2;
        ctx.quadraticCurveTo(currentPath[i].x, currentPath[i].y, xc, yc);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Draw Remote Cursors (NEW FEATURE)
    Object.values(cursors).forEach((cursor: any) => {
        const { x, y, color, userName } = cursor;
        ctx.save();
        
        // Draw Cursor Arrow
        ctx.shadowColor = "rgba(0,0,0,0.2)";
        ctx.shadowBlur = 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 5.5, y + 16); 
        ctx.lineTo(x + 9, y + 10);
        ctx.lineTo(x + 16, y + 10);
        ctx.fill();
        
        // Draw User Label
        if (userName) {
            ctx.font = "bold 10px Inter, sans-serif";
            const textMetrics = ctx.measureText(userName);
            const padding = 4;
            const textWidth = textMetrics.width;
            const bgHeight = 16;
            
            // Label Background
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x + 12, y + 12, textWidth + (padding * 2), bgHeight, 4);
            ctx.fill();
            
            // Label Text
            ctx.fillStyle = "#ffffff";
            ctx.fillText(userName, x + 12 + padding, y + 12 + 11);
        }
        ctx.restore();
    });

  }, [elements, isDragging, currentPath, tool, strokeColor, strokeWidth, drawElement, cursors]); // Added cursors to dependency

  useEffect(() => {
    redraw();
  }, [redraw]);

  const applyOperation = useCallback((op: BoardOperation, broadcast = true) => {
    setOperations(prev => {
      const next = [...prev, op];
      realtime.saveState(`ops_${meetingId}`, next);
      return next;
    });
    if (op.type !== 'reset') setUndoneOperations([]);
    if (broadcast) realtime.emit('board_op', op);
  }, [meetingId]);

  useEffect(() => {
    const savedOps = realtime.loadState(`ops_${meetingId}`) || [];
    setOperations(savedOps);
    const savedState = realtime.loadState(`mstate_${meetingId}`) || { isLocked: false, hostId: user.role === UserRole.HOST ? user.id : '' };
    setMeetingState(savedState);

    realtime.subscribe('board_op', (op: BoardOperation) => setOperations(prev => [...prev, op]));
    realtime.subscribe('board_undo', (data: any) => setOperations(prev => prev.filter(o => o.id !== data.opId)));
    realtime.subscribe('meeting_state_sync', (state: MeetingState) => setMeetingState(state));
    
    // UPDATED: Capture userName in cursor state
    realtime.subscribe('cursor_moved', (cp: any) => {
      if (cp.userId !== user.id) {
        setCursors(prev => ({ 
            ...prev, 
            [cp.userId]: { 
                x: cp.x, 
                y: cp.y, 
                userId: cp.userId, 
                userName: cp.userName, // Capture name
                color: getUserColor(cp.userId) 
            } 
        }));
      }
    });

    realtime.subscribe('activity_status', (data: any) => {
      if (data.userId !== user.id) {
        setLiveParticipants(prev => ({ 
          ...prev, 
          [data.userId]: { ...prev[data.userId], ...data, lastSeen: Date.now() } 
        } as Record<string, LocalParticipant>));
      }
    });
    realtime.subscribe('presence_ping', (u: User) => {
      setLiveParticipants(prev => ({ 
        ...prev, 
        [u.id]: { ...u, color: getUserColor(u.id), lastSeen: Date.now() } 
      } as Record<string, LocalParticipant>));
    });
    
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.parentElement?.clientWidth || window.innerWidth;
        canvasRef.current.height = canvasRef.current.parentElement?.clientHeight || window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const interval = setInterval(() => {
      realtime.emit('presence_ping', user);
      const now = Date.now();
      setLiveParticipants(prev => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach(id => { 
          if (now - next[id].lastSeen > 10000 && id !== user.id) { 
            delete next[id]; 
            changed = true; 
          } 
        });
        return changed ? next : prev;
      });
    }, 3000);

    return () => { 
      window.removeEventListener('resize', handleResize); 
      clearInterval(interval); 
    };
  }, [meetingId, user.id]);

  const undo = useCallback(() => {
    if (!canDraw) return;
    const myOps = operations.filter(op => op.userId === user.id);
    if (myOps.length === 0) return;
    const lastOp = myOps[myOps.length - 1];
    setOperations(prev => {
      const next = prev.filter(o => o.id !== lastOp.id);
      realtime.saveState(`ops_${meetingId}`, next);
      return next;
    });
    setUndoneOperations(prev => [...prev, lastOp]);
    realtime.emit('board_undo', { userId: user.id, opId: lastOp.id });
  }, [operations, user.id, canDraw, meetingId]);

  const redo = useCallback(() => {
    if (!canDraw || undoneOperations.length === 0) return;
    const lastUndone = undoneOperations[undoneOperations.length - 1];
    applyOperation(lastUndone);
    setUndoneOperations(prev => prev.slice(0, -1));
  }, [undoneOperations, applyOperation, canDraw]);

  const toggleLock = useCallback(() => {
    if (!isHost) return;
    const newState = { ...meetingState, isLocked: !meetingState.isLocked };
    setMeetingState(newState);
    realtime.saveState(`mstate_${meetingId}`, newState);
    realtime.emit('meeting_state_sync', newState);
  }, [isHost, meetingState, meetingId]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    setIsDragging(true);
    
    let hit: BoardElement | undefined;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      let isHit = false;
      if (el.type === 'path' && el.points) {
        const xs = el.points.map(p => p.x); const ys = el.points.map(p => p.y);
        isHit = x >= Math.min(...xs) - 10 && x <= Math.max(...xs) + 10 && y >= Math.min(...ys) - 10 && y <= Math.max(...ys) + 10;
      } else { isHit = x >= el.x && x <= el.x + (el.width || 100) && y >= el.y && y <= el.y + (el.height || 40); }
      if (isHit) { hit = el; break; }
    }

    if (tool === 'erase' && hit) {
      applyOperation({ id: Math.random().toString(36).substr(2, 9), userId: user.id, timestamp: Date.now(), type: 'delete', elementId: hit.id });
      setIsDragging(false);
      return;
    }

    if (tool === 'select') {
      if (hit) { setSelectedIds([hit.id]); setDragOffset({ x: x - hit.x, y: y - hit.y }); } 
      else setSelectedIds([]);
    } else if (tool === 'pen') { setCurrentPath([{ x, y }]); }
    else if (['text', 'sticky'].includes(tool)) {
      const newEl: BoardElement = {
        id: Math.random().toString(36).substr(2, 9), type: tool as any, x, y, width: 160, height: tool === 'sticky' ? 160 : 40,
        color: tool === 'sticky' ? '#FEF3C7' : '#000000', content: 'New ' + tool, userId: user.id, lastModified: Date.now()
      };
      setEditingId(newEl.id); 
      setEditText('');
      applyOperation({ id: Math.random().toString(36).substr(2, 9), userId: user.id, timestamp: Date.now(), type: 'add', element: newEl });
      setTimeout(() => textInputRef.current?.focus(), 50);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editingId) return;
    const text = e.target.value;
    setEditText(text);
    const element = elements.find(el => el.id === editingId);
    if (element) {
      const updated = { ...element, content: text };
      applyOperation({ id: Math.random().toString(36).substr(2, 9), userId: user.id, timestamp: Date.now(), type: 'update', element: updated });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    if (Date.now() - lastEmitTime.current > 40) {
      realtime.emit('cursor_moved', { userId: user.id, userName: user.name, x, y });
      lastEmitTime.current = Date.now();
    }
    
    if (isDragging) {
        if (tool === 'pen') {
            setCurrentPath(prev => [...prev, { x, y }]);
        } else if (tool === 'select' && selectedIds.length > 0) {
            const elId = selectedIds[0];
            const el = elements.find(e => e.id === elId);
            if (el) {
                const updated = { ...el, x: x - dragOffset.x, y: y - dragOffset.y };
                applyOperation({ id: Math.random().toString(36).substr(2, 9), userId: user.id, timestamp: Date.now(), type: 'update', element: updated });
            }
        }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || !canDraw) return;
    setIsDragging(false);
    if (tool === 'pen' && currentPath.length > 1) {
      const xs = currentPath.map(p => p.x); const ys = currentPath.map(p => p.y);
      const newPath: BoardElement = {
        id: Math.random().toString(36).substr(2, 9), type: 'path', points: currentPath, color: strokeColor,
        strokeWidth: strokeWidth, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
        userId: user.id, lastModified: Date.now()
      };
      applyOperation({ id: Math.random().toString(36).substr(2, 9), userId: user.id, timestamp: Date.now(), type: 'add', element: newPath });
      setCurrentPath([]);
    }
  };

  const participantsList = useMemo(() => Object.values(liveParticipants) as LocalParticipant[], [liveParticipants]);
  
  const activityMessage = useMemo(() => 
    participantsList
      .filter(p => p.id !== user.id && (p.isDrawing || p.isTyping))
      .map(p => `${p.name} drawing...`).join('  '),
    [participantsList, user.id]
  );

  return (
    <div className="relative w-full h-full bg-[#FCFDFF] flex overflow-hidden touch-none">
      <div className="flex-1 relative overflow-hidden">
        {meetingState.isLocked && !isHost && (
          <div className="absolute top-4 right-4 z-[45] bg-rose-500 text-white px-3 lg:px-4 py-1 rounded-full text-[10px] lg:text-xs font-black shadow-lg">
            LOCKED
          </div>
        )}
        <canvas 
          ref={canvasRef} 
          onPointerDown={handlePointerDown} 
          onPointerMove={handlePointerMove} 
          onPointerUp={handlePointerUp} 
          className={`absolute inset-0 ${canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'}`} 
        />

        {editingId && (
            <div className="absolute z-50 pointer-events-none" style={{ 
                left: elements.find(el => el.id === editingId)?.x || 0,
                top: (elements.find(el => el.id === editingId)?.y || 0) + 40
            }}>
                <textarea
                    ref={textInputRef}
                    value={editText}
                    onChange={handleTextChange}
                    onBlur={() => setEditingId(null)}
                    className="pointer-events-auto bg-white border-2 border-indigo-500 rounded p-2 text-sm shadow-xl outline-none"
                    style={{ width: 200, height: 100 }}
                    placeholder="Type content..."
                />
            </div>
        )}
        
        {activityMessage && (
          <div className="absolute top-4 left-4 z-40 pointer-events-none">
            <p className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-indigo-600 border border-indigo-100">
              {activityMessage}
            </p>
          </div>
        )}

        {tool === 'pen' && (
          <div className="absolute top-4 lg:top-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl lg:rounded-2xl p-3 lg:p-4 flex items-center space-x-4 lg:space-x-6 z-40">
             <div className="hidden sm:flex flex-col space-y-1">
                <span className="text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest">Width</span>
                <input type="range" min="1" max="24" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-20 lg:w-32 h-1 bg-slate-100 rounded-lg accent-indigo-600" />
             </div>
             <div className="hidden sm:block h-6 w-px bg-slate-100" />
             <div className="flex flex-col space-y-1">
                <span className="text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest">Color</span>
                <div className="flex space-x-1 lg:space-x-2">
                    {['#4F46E5', '#EF4444', '#10B981', '#000000'].map(c => (
                        <button key={c} onClick={() => setStrokeColor(c)} className={`w-4 h-4 lg:w-6 lg:h-6 rounded-full border-2 ${strokeColor === c ? 'border-slate-800' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                    ))}
                </div>
             </div>
          </div>
        )}

        <div className="absolute bottom-4 lg:bottom-8 left-0 right-0 lg:left-1/2 lg:-translate-x-1/2 flex items-center justify-center pointer-events-none z-40 px-4">
          <div className="bg-white/95 backdrop-blur border shadow-2xl rounded-2xl p-1 lg:p-2 flex items-center space-x-1 pointer-events-auto overflow-x-auto max-w-full scrollbar-hide">
            <ToolBtn icon="🖱️" label="Select" active={tool === 'select'} onClick={() => setTool('select')} disabled={!canDraw} />
            <ToolBtn icon="✏️" label="Draw" active={tool === 'pen'} onClick={() => setTool('pen')} disabled={!canDraw} />
            <ToolBtn icon="🔤" label="Text" active={tool === 'text'} onClick={() => setTool('text')} disabled={!canDraw} />
            <ToolBtn icon="📝" label="Note" active={tool === 'sticky'} onClick={() => setTool('sticky')} disabled={!canDraw} />
            <ToolBtn icon="🧹" label="Eraser" active={tool === 'erase'} onClick={() => setTool('erase')} disabled={!canDraw} />
            <div className="w-px h-6 bg-slate-100 mx-1 flex-shrink-0" />
            <ToolBtn icon="✨" label="AI" onClick={async () => {
               const canvas = canvasRef.current; if (!canvas) return;
               const shapes = await beautifyBoard(canvas.toDataURL('image/png').split(',')[1]);
               shapes.forEach(sh => applyOperation({ id: Math.random().toString(36).substr(2, 9), userId: user.id, timestamp: Date.now(), type: 'add', element: sh }));
            }} disabled={!canDraw} />
            <div className="w-px h-6 bg-slate-100 mx-1 flex-shrink-0" />
            <ToolBtn icon="↩️" label="Undo" onClick={undo} disabled={!canDraw} />
            <ToolBtn icon="↪️" label="Redo" onClick={redo} disabled={!canDraw} />
            {isHost && (
              <>
                <div className="w-px h-6 bg-slate-100 mx-1 flex-shrink-0" />
                <ToolBtn icon={meetingState.isLocked ? "🔓" : "🔒"} label="Lock" onClick={toggleLock} />
              </>
            )}
            <button className="lg:hidden flex flex-col items-center p-2 rounded-xl transition min-w-[48px] text-slate-400" onClick={() => setIsFeedOpen(!isFeedOpen)}>
              <span className="text-xl">👥</span>
              <span className="text-[8px] font-bold mt-1 uppercase">Feed</span>
            </button>
          </div>
        </div>

        <div className={`fixed inset-y-0 right-0 w-64 bg-white border-l shadow-2xl z-50 transform transition-transform duration-300 ${isFeedOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} lg:relative lg:translate-x-0`}>
          <div className="p-4 border-b flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-[10px] text-slate-500 uppercase tracking-widest">Live Feed</h3>
            <button className="lg:hidden" onClick={() => setIsFeedOpen(false)}>✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {participantsList.map((p: LocalParticipant) => (
              <div key={p.id} className="flex items-center space-x-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: p.color || '#cbd5e1' }}>{p.name[0]}</div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${p.isDrawing || p.isTyping ? 'bg-indigo-500 animate-ping' : 'bg-green-500'}`}></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                  <p className="text-[8px] text-slate-400 font-medium uppercase tracking-tighter">{p.role === UserRole.HOST ? 'Host' : 'Member'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolBtn = ({ icon, label, active, onClick, disabled }: { icon: string, label: string, active?: boolean, onClick?: () => void, disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled} className={`flex flex-col items-center p-1.5 lg:p-2 rounded-xl transition min-w-[44px] lg:min-w-[56px] ${disabled ? 'opacity-30' : active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
    <span className="text-lg lg:text-xl">{icon}</span>
    <span className="text-[7px] lg:text-[9px] font-bold mt-1 uppercase tracking-tighter">{label}</span>
  </button>
);

export default Whiteboard;