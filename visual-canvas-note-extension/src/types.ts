export interface NoteSource {
  title: string;
  url: string;
}

export interface Note {
  id: string;
  title: string;
  text: string;
  x: number;
  y: number;
  width: number;
  color: string; // palette id
  createdAt: number;
  source?: NoteSource | null;
}

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

export interface PendingNote {
  id: string;
  text: string;
  url: string;
  pageTitle: string;
  createdAt: number;
}

export type Theme = "dark" | "light";

export interface PersistedState {
  notes: Note[];
  view: ViewState;
  theme: Theme;
}
