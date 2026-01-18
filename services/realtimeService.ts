import { io, Socket } from "socket.io-client";

type Callback<T = any> = (data: T) => void;

class RealtimeService {
  private socket: Socket;
  private listeners = new Map<string, Set<Callback>>();

  constructor() {
    this.socket = io(
      (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3001",
      {
        transports: ["websocket"],
        autoConnect: true,
        reconnection: true,
      }
    );

    this.socket.on("connect", () => {
      console.log("✅ Socket connected:", this.socket.id);
    });

    this.socket.on("disconnect", reason => {
      console.warn("⚠️ Socket disconnected:", reason);
    });

    this.socket.onAny((event, data) => {
      const cbs = this.listeners.get(event);
      if (cbs) cbs.forEach(cb => cb(data));
    });
  }

  /* ---------------- SOCKET ACCESS ---------------- */

  getSocket(): Socket {
    return this.socket;
  }

  /* ---------------- ROOM ---------------- */

  joinRoom(roomId: string, user: any) {
    if (!this.socket.connected) {
        this.socket.connect();
    }
    this.socket.emit("join-room", { roomId, user });
  }

  leaveRoom(roomId: string, userId: string) {
    this.socket.emit("leave-room", { roomId, userId });
    // REMOVED: this.socket.disconnect();  <-- THIS WAS THE BUG
  }

  /* ---------------- EMIT ---------------- */

  emit(event: string, data?: any) {
    if (!this.socket.connected) return;
    this.socket.emit(event, data);
  }

  /* ---------------- SUBSCRIBE ---------------- */

  subscribe<T = any>(event: string, callback: Callback<T>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  unsubscribe<T = any>(event: string, callback: Callback<T>) {
    this.listeners.get(event)?.delete(callback);
  }

  /* ---------------- STATE ---------------- */

  saveState(key: string, value: any) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  loadState<T = any>(key: string): T | null {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  clearState(key: string) {
    localStorage.removeItem(key);
  }
}

export const realtime = new RealtimeService();