import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Song } from '../../shared/types/song';

export default function SongList() {
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

  async function handleDelete(id: string) {
    if (!confirm('Delete this song and all its parts/versions? This cannot be undone.')) return;
    await window.electronAPI.songs.delete(id);
    await load();
  }

  return (
    <div>
      <div className="page-header">
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
        </div>
      </div>

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : songs.length === 0 ? (
        <div className="text-muted">No songs yet -- create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {songs.map((song) => (
            <div
              key={song.id}
              className="card"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Link to={`/songs/${song.id}`} style={{ fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>
                {song.title}
              </Link>
              <button className="btn btn-danger" onClick={() => handleDelete(song.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
