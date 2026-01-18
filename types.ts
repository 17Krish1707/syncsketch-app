
export enum UserRole {
  ADMIN = 'ADMIN',
  HOST = 'HOST',
  PARTICIPANT = 'PARTICIPANT'
}

export interface UserSettings {
  defaultPenColor: string;
  defaultStrokeWidth: number;
  defaultFontSize: number;
  defaultTool: 'select' | 'pen' | 'text' | 'sticky';
  autoSave: boolean;
  showLiveCursors: boolean;
  enableScreenShare: boolean;
  notificationsEnabled: boolean;
  muteSounds: boolean;
  autoAcceptInvites: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  settings?: UserSettings;
}

export interface BoardElement {
  id: string;
  type: 'path' | 'rect' | 'circle' | 'text' | 'sticky' | 'image';
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: { x: number; y: number }[];
  content?: string;
  color: string;
  strokeWidth?: number;
  userId: string;
  url?: string; // For images
  lastModified: number;
}

// Fixed: Added missing BoardOperation interface
export interface BoardOperation {
  id: string;
  userId: string;
  timestamp: number;
  type: 'add' | 'update' | 'delete' | 'reset';
  element?: BoardElement;
  elementId?: string;
}

// Fixed: Added missing MeetingState interface
export interface MeetingState {
  isLocked: boolean;
  hostId: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text?: string;
  audioUrl?: string;
  timestamp: number;
}

export interface Meeting {
  id: string;
  title: string;
  hostId: string;
  createdAt: number;
  lastModified: number;
  participants: string[];
  ended?: boolean;
}

export interface CursorPosition {
  userId: string;
  userName: string;
  x: number;
  y: number;
}
