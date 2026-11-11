import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAiSettings } from '../context/AiSettingsContext';
import { usePrivacy } from '../context/PrivacyContext';
import EyeIcon from './EyeIcon';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/', label: 'Songs', end: true },
  { to: '/ai-log', label: 'AI Log', requiresAi: true },
  { to: '/settings', label: 'Settings' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { aiEnabled } = useAiSettings();
  const { showHidden, setShowHidden } = usePrivacy();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.requiresAi || aiEnabled);

  return (
    <div className="app-root">
      <nav className="topbar">
        <div className="topbar-title">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="topbar-logo" />
          TrackDraft
        </div>
        <ul>
          {visibleNavItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <span className="topbar-spacer" />
        <button
          type="button"
          className={`privacy-toggle${showHidden ? ' active' : ''}`}
          title={showHidden ? 'Hide hidden songs' : 'Show hidden songs'}
          aria-label={showHidden ? 'Hide hidden songs' : 'Show hidden songs'}
          aria-pressed={showHidden}
          onClick={() => setShowHidden(!showHidden)}
        >
          <EyeIcon open={showHidden} />
        </button>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}
