/** Fired whenever a part's saved content changes, or the viewed-version tab changes
 * (autosave, duplicate, delete, or just switching tabs). A part can appear at more than one
 * placement (a repeated chorus) or be summarized in the live full-song panel, so anything
 * showing a part's content listens for this instead of needing a shared state store.
 * `preferViewedVersionId`, when set, is a hint that every instance of this part should switch
 * to viewing that version too -- e.g. so all placements of a repeated chorus stay on the same
 * tab. Leave it unset for changes that shouldn't move anyone's viewed tab (like a plain autosave). */
export const PART_CHANGED_EVENT = 'trackdraft:partContentChanged';

export function notifyPartChanged(partId: string, preferViewedVersionId?: string) {
  window.dispatchEvent(new CustomEvent(PART_CHANGED_EVENT, { detail: { partId, preferViewedVersionId } }));
}
