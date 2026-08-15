export interface Song {
  id: string;
  title: string;
  styleNotes: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSongInput {
  title: string;
}

export interface UpdateSongInput {
  title?: string;
  styleNotes?: string;
  notes?: string;
}
