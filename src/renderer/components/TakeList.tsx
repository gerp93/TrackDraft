import type { SongAudioState } from './SongAudio';
import { takeMeta } from './audioFormat';

interface Props {
  audio: SongAudioState;
}

/** The takes half of the audio panel: every generated rendition of this song, newest
 * first. Playing a take loads it into the docked player bar. Rendered at the bottom of
 * AudioPanel (see SongAudio.tsx). */
export default function TakeList({ audio }: Props) {
  const { takes, currentTake, loaded } = audio;

  return (
    <>
      <h3 className="audio-panel-subhead">Takes{takes.length ? ` (${takes.length})` : ''}</h3>
      {takes.length === 0 && (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          Each generation is kept here so you can compare them.
        </p>
      )}
      <ul className="take-list">
        {takes.map((take) => {
          const isCurrent = currentTake?.id === take.id;
          const isPlaying = loaded?.takeId === take.id;
          return (
            <li key={take.id} className={`take-row${isCurrent ? ' current' : ''}`}>
              <div className="take-row-header">
                <button
                  className="btn take-play"
                  disabled={audio.loadingTakeId === take.id || isPlaying}
                  onClick={() => audio.playTake(take.id)}
                  aria-label={`Play take ${audio.takeNumber(take.id)}`}
                  title={isPlaying ? 'In the player' : 'Play in the player bar'}
                >
                  {isPlaying ? '♪' : '▶'}
                </button>
                <span className="take-row-title">
                  <strong>Take {audio.takeNumber(take.id)}</strong>
                  <span className="text-muted"> · {takeMeta(take)}</span>
                </span>
                <button
                  className="btn btn-danger"
                  onClick={() => audio.deleteTake(take)}
                  aria-label={`Delete take ${audio.takeNumber(take.id)}`}
                >
                  Delete
                </button>
              </div>
              {audio.missingTakeIds.has(take.id) && (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  The audio file for this take isn't on this device.
                </div>
              )}
              <details style={{ marginTop: 4, fontSize: 12 }}>
                <summary className="text-muted" style={{ cursor: 'pointer' }}>
                  What was sent
                </summary>
                <pre className="live-song-text" style={{ marginTop: 6, fontSize: 12 }}>
                  {`${take.prompt}\n\n${take.lyrics}`}
                </pre>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}
