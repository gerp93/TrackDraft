export interface Song {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSongInput {
  title: string;
}

export interface UpdateSongInput {
  title?: string;
}
