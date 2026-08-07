export type PartType = 'verse' | 'chorus' | 'intro' | 'outro' | 'bridge' | 'custom';

/** A content record -- the actual written section. A song's visible arrangement is a
 * separate ordered list of PartPlacements, each pointing at one of these; the same Part
 * can be placed more than once (a repeated chorus), so editing it updates every placement. */
export interface Part {
  id: string;
  songId: string;
  partType: PartType;
  customLabel: string | null;
  /** Instrumental section (e.g. a guitar solo) -- no lyrics expected. The editor skips the
   * lyric-specific controls and the live song panel shows it as a placeholder tag. */
  noLyrics: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartInput {
  songId: string;
  partType: PartType;
  customLabel?: string | null;
  noLyrics?: boolean;
}

export interface UpdatePartInput {
  customLabel?: string | null;
  noLyrics?: boolean;
}
