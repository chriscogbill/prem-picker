'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/AuthContext';
import { api } from '../../../lib/api';

export default function GameDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading, currentGameweek } = useAuth();
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [history, setHistory] = useState({});
  const [startGameweek, setStartGameweek] = useState(1);
  const [loadingData, setLoadingData] = useState(true);
  const [starting, setStarting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processGw, setProcessGw] = useState(currentGameweek || 1);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [loading, id]);

  useEffect(() => {
    if (currentGameweek) setProcessGw(currentGameweek);
  }, [currentGameweek]);

  async function loadData() {
    try {
      const [gameData, historyData] = await Promise.all([
        api.getGame(id),
        api.getGameHistory(id)
      ]);
      setGame(gameData.game);
      setPlayers(gameData.players);
      setHistory(historyData.history || {});
      setStartGameweek(historyData.startGameweek || gameData.game.start_gameweek || 1);
    } catch (error) {
      console.error('Error loading game:', error);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    setMessage('');
    try {
      await api.startGame(id);
      setMessage('Game started!');
      loadData();
    } catch (error) {
      setMessage(error.message || 'Failed to start game');
    } finally {
      setStarting(false);
    }
  }

  async function handleProcessResults() {
    setProcessing(true);
    setMessage('');
    try {
      const result = await api.processResults(id, processGw);
      setMessage(result.message);
      loadData();
    } catch (error) {
      setMessage(error.message || 'Failed to process results');
    } finally {
      setProcessing(false);
    }
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(game.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  if (loading || loadingData) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!game) {
    return <div className="card text-center"><p className="text-gray-600">Game not found.</p></div>;
  }

  const isGameAdmin = user && (user.email === game.admin_email || user.role === 'admin');
  const myPlayer = players.find(p => p.user_email === user?.email);

  // Build the list of gameweeks that have activity (picks or are in range)
  const historyGws = Object.keys(history).map(Number);
  const maxGw = Math.max(startGameweek, ...historyGws, currentGameweek || 0);
  const gameweeks = [];
  for (let gw = startGameweek; gw <= maxGw; gw++) {
    gameweeks.push(gw);
  }

  // Build a lookup: playerEmail -> gameweek -> pick info
  const pickLookup = {};
  players.forEach(p => { pickLookup[p.user_email] = {}; });

  Object.entries(history).forEach(([gw, gwData]) => {
    const gwNum = parseInt(gw);
    gwData.picks.forEach(pick => {
      if (!pickLookup[pick.user_email]) pickLookup[pick.user_email] = {};
      pickLookup[pick.user_email][gwNum] = pick;
    });
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{game.game_name}</h1>
          <p className="text-sm text-gray-500">
            {game.status === 'open' ? 'Waiting for players' :
             game.status === 'active' ? `Active - starts GW${game.start_gameweek}` :
             game.is_draw ? 'Completed - Draw' : 'Completed'}
          </p>
        </div>
      </div>

      {message && (
        <div className="bg-link-100 border border-link-300 text-link-700 px-4 py-3 rounded">
          {message}
        </div>
      )}

      {/* Admin controls */}
      {isGameAdmin && (
        <div className="card bg-gray-50">
          <h2 className="font-bold mb-3">Admin Controls</h2>

          {game.invite_code && (
            <div className="mb-4">
              <span className="text-sm text-gray-600">Invite Code: </span>
              <span className="font-mono font-bold text-primary-600">{game.invite_code}</span>
              <button onClick={copyInviteCode} className="ml-2 text-xs text-link-600 hover:underline cursor-pointer">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}

          <div className="flex gap-3 flex-wrap items-end">
            {game.status === 'open' && (
              <button onClick={handleStart} disabled={starting} className="btn-success disabled:bg-gray-400">
                {starting ? 'Starting...' : 'Start Game'}
              </button>
            )}

            {game.status === 'active' && (
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Process GW</label>
                  <select
                    value={processGw}
                    onChange={(e) => setProcessGw(parseInt(e.target.value))}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    {Array.from({ length: 38 }, (_, i) => i + 1).map(gw => (
                      <option key={gw} value={gw}>GW {gw}</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleProcessResults} disabled={processing} className="btn-primary text-sm disabled:bg-gray-400">
                  {processing ? 'Processing...' : 'Process Results'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standings Table — gameweek grid */}
      <div className="card">
        <h2 className="font-bold text-lg mb-4">Standings</h2>
        {gameweeks.length > 0 && game.status !== 'open' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 px-3 sticky left-0 bg-white z-10 min-w-[140px]">Player</th>
                  {gameweeks.map(gw => (
                    <th key={gw} className="text-center py-2 px-2 min-w-[70px] whitespace-nowrap">
                      GW{gw}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map(player => {
                  const isEliminated = player.status === 'eliminated';
                  const isWinner = player.status === 'winner';
                  const isDrawn = player.status === 'drawn';

                  return (
                    <tr key={player.player_id} className="border-b border-gray-100">
                      <td className={`py-2 px-3 font-medium sticky left-0 bg-white z-10 ${
                        isEliminated ? 'line-through text-gray-400' :
                        isWinner ? 'text-warning-600 font-bold' :
                        isDrawn ? 'text-warning-600' : ''
                      }`}>
                        {player.username}
                        {player.user_email === user?.email && (
                          <span className="text-xs text-gray-400 ml-1 no-underline">(you)</span>
                        )}
                        {isWinner && <span className="ml-1 text-xs">🏆</span>}
                      </td>
                      {gameweeks.map(gw => {
                        const pick = pickLookup[player.user_email]?.[gw];
                        const gwData = history[gw];
                        const isCurrentUser = player.user_email === user?.email;

                        return (
                          <PickCell
                            key={gw}
                            pick={pick}
                            gwData={gwData}
                            player={player}
                            gw={gw}
                            isCurrentUser={isCurrentUser}
                            currentGameweek={currentGameweek}
                            gameId={id}
                            router={router}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-4">
            {game.status === 'open'
              ? 'Game hasn\'t started yet — waiting for players.'
              : 'No picks yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

function PickCell({ pick, gwData, player, gw, isCurrentUser, currentGameweek, gameId, router }) {
  const isCurrentGw = gw === currentGameweek;
  const deadlineNotPassed = gwData ? !gwData.deadlinePassed : true;
  const canPick = isCurrentUser && isCurrentGw && deadlineNotPassed && player.status === 'alive';

  // No pick data at all for this gameweek
  if (!pick) {
    // If the player was already eliminated before this GW, show empty
    if (player.status === 'eliminated' && player.eliminated_gameweek && gw > player.eliminated_gameweek) {
      return <td className="py-2 px-2 text-center text-gray-200">—</td>;
    }
    // Current user can make a pick for this GW
    if (canPick) {
      return (
        <td className="py-2 px-2 text-center">
          <button
            onClick={() => router.push(`/games/${gameId}/pick`)}
            className="inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-primary-500 text-white hover:bg-primary-600 cursor-pointer"
          >
            Pick
          </button>
        </td>
      );
    }
    // Player is alive but hasn't picked yet (or GW hasn't started)
    return <td className="py-2 px-2 text-center text-gray-300">-</td>;
  }

  // Pick is hidden (deadline not passed, not own pick)
  if (pick.hidden) {
    return (
      <td className="py-2 px-2 text-center">
        <span className="inline-block w-6 h-6 bg-gray-200 rounded text-xs leading-6 text-gray-400" title="Pick hidden until deadline">
          ?
        </span>
      </td>
    );
  }

  // Pick is visible
  const resultColors = {
    win: 'bg-positive-100 text-positive-800',
    loss: 'bg-danger-100 text-danger-800 line-through',
    draw: 'bg-danger-100 text-danger-800 line-through',
  };

  const style = pick.result
    ? resultColors[pick.result] || 'bg-gray-100 text-gray-700'
    : 'bg-gray-100 text-gray-700';

  // Current user's own pick, still before deadline — show pick + change option
  if (canPick && !pick.result) {
    return (
      <td className="py-2 px-2 text-center">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${style}`}
          title={pick.team_name || ''}
        >
          {pick.team_short || pick.team_name || '?'}
        </span>
        <button
          onClick={() => router.push(`/games/${gameId}/pick`)}
          className="block mx-auto mt-0.5 text-[10px] text-primary-500 hover:text-primary-700 cursor-pointer"
        >
          Change
        </button>
      </td>
    );
  }

  return (
    <td className="py-2 px-2 text-center">
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${style}`}
        title={pick.team_name || ''}
      >
        {pick.team_short || pick.team_name || '?'}
      </span>
    </td>
  );
}
