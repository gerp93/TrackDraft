/** One slot in a song's arrangement (top-to-bottom order), pointing at a Part's content.
 * Two placements can reference the same partId -- that's a repeated section. */
export interface PartPlacement {
  id: string;
  songId: string;
  partId: string;
  orderIndex: number;
  createdAt: string;
}

export interface CreatePlacementInput {
  songId: string;
  partId: string;
}
