import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import SongList from './pages/SongList';
import SongDetail from './pages/SongDetail';
import Settings from './pages/Settings';
import AiLog from './pages/AiLog';
import Layout from './components/Layout';
import { ThemeProvider } from './context/ThemeContext';
import './themes.css';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<SongList />} />
            <Route path="/songs/:songId" element={<SongDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/ai-log" element={<AiLog />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
