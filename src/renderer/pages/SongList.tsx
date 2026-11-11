import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Song } from '../../shared/types/song';
import { usePrivacy } from '../context/PrivacyContext';
import EyeIcon from '../components/EyeIcon';

export default function SongList() {
  const { showHidden } = usePrivacy();
  const [songs, setSongs] = useState<Song[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setSongs(await window.electronAPI.songs.getAll());
    setLoading(false);
  }

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    await window.electronAPI.songs.create({ title });
    setNewTitle('');
    await load();
  }

  async function handleToggleHidden(song: Song) {
    const updated = await window.electronAPI.songs.setHidden(song.id, !song.isHidden);
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this song and all its parts/versions? This cannot be undone.')) return;
    await window.electronAPI.songs.delete(id);
    await load();
  }

  // Privacy screen: hidden songs simply aren't listed until the topbar eye reveals them.
  const visibleSongs = songs.filter((song) => showHidden || !song.isHidden);

  return (
    <div>
      <div className="page-header page-header-hero">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="TrackDraft" className="hero-logo" />
        <h1>Songs</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New song title"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            Create Song
          </button>
          <Link to="/import" className="btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Import Lyrics…
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : visibleSongs.length === 0 ? (
        <div className="text-muted">No songs yet -- create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleSongs.map((song) => (
            <div
              key={song.id}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: song.isHidden ? 0.6 : 1,
              }}
            >
              <Link to={`/songs/${song.id}`} style={{ fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>
                {song.title}
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="song-hide-toggle"
                  title={song.isHidden ? 'Unhide song' : 'Hide song'}
                  aria-label={song.isHidden ? `Unhide ${song.title}` : `Hide ${song.title}`}
                  onClick={() => void handleToggleHidden(song)}
                >
                  <EyeIcon open={!song.isHidden} size={16} />
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(song.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
