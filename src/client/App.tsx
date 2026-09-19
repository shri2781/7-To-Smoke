import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth.js';
import { Layout } from './components/Layout.js';
import { Login } from './routes/Login.js';
import { NewGame } from './routes/NewGame.js';
import { Game } from './routes/Game.js';
import { History } from './routes/History.js';
import { Leaderboard } from './routes/Leaderboard.js';
import { Dancers } from './routes/Dancers.js';
import { Rules } from './routes/Rules.js';
import { useActiveTournament } from './hooks/useTournament.js';
import { useOfflineFlushSync } from './hooks/useTournament.js';

function Home() {
  const { data, isLoading } = useActiveTournament();
  if (isLoading) return null;
  return <Navigate to={data ? '/game' : '/new'} replace />;
}

export function App() {
  useOfflineFlushSync();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="new" element={<NewGame />} />
        <Route path="game" element={<Game />} />
        <Route path="game/:id" element={<Game />} />
        <Route path="history" element={<History />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="dancers" element={<Dancers />} />
        <Route path="rules" element={<Rules />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
