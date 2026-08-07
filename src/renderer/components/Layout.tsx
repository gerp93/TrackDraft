import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAiSettings } from '../context/AiSettingsContext';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/', label: 'Songs', end: true },
  { to: '/ai-log', label: 'AI Log', requiresAi: true },
  { to: '/settings', label: 'Settings' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { aiEnabled } = useAiSettings();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.requiresAi || aiEnabled);

  return (
    <div className="app-root">
      <nav className="topbar">
        <div className="topbar-title">TrackDraft</div>
        <ul>
          {visibleNavItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}
