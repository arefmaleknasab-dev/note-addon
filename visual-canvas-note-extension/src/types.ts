export type ConnectionSide = "top" | "right" | "bottom" | "left";
export type ConnectionDirection = "none" | "forward" | "both";

export interface Note {
  id: string;
  title: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string; // palette id
  createdAt: number;
}

export interface NoteConnectionEndpoint {
  noteId: string;
  side: ConnectionSide;
}

export interface NoteConnection {
  id: string;
  from: NoteConnectionEndpoint;
  to: NoteConnectionEndpoint;
  direction?: ConnectionDirection;
  color?: string;
  label?: string;
}

export interface NoteGroup {
  id: string;
  title: string;
  noteIds: string[];
  color: string; // palette id
  createdAt: number;
}

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

export interface PendingNote {
  id: string;
  text: string;
  createdAt: number;
}

export type Theme = "dark" | "light";

export interface PersistedState {
  notes: Note[];
  connections?: NoteConnection[];
  groups?: NoteGroup[];
  view: ViewState;
  theme: Theme;
}
