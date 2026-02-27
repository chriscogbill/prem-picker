'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/AuthContext';
import { api } from '../../../lib/api';

export default function GameDetailPage() {
  const { id } = useParams();
  const { user, loading, currentGameweek } = useAuth();
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [history, setHistory] = useState({});
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

  const statusColors = {
    winner: 'text-warning-600 font-bold',
    alive: 'text-positive-600 font-semibold',
    drawn: 'text-warning-600 font-semibold',
    eliminated: 'text-danger-500',
  };

  const statusBg = {
    winner: 'bg-warning-50',
    alive: 'bg-positive-50',
    drawn: 'bg-warning-50',
    eliminated: '',
  };

  const gameweeks = Object.keys(history).map(Number).sort((a, b) => b - a);

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
        <div className="flex gap-2">
          {game.status === 'active' && myPlayer?.status === 'alive' && (
            <Link href={`/games/${id}/pick`} className="btn-primary">
              Make Pick
            </Link>
          )}
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

      {/* Standings Table */}
      <div className="card">
        <h2 className="font-bold text-lg mb-4">Standings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3">#</th>
                <th className="text-left py-2 px-3">Player</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-center py-2 px-3">Eliminated GW</th>
                <th className="text-center py-2 px-3">Picks Made</th>
                <th className="text-center py-2 px-3">Teams Used</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, idx) => (
                <tr key={player.player_id} className={`border-b border-gray-100 ${statusBg[player.status] || ''}`}>
                  <td className="py-2 px-3 text-gray-400">{idx + 1}</td>
                  <td className="py-2 px-3 font-medium">
                    {player.username}
                    {player.user_email === user?.email && (
                      <span className="text-xs text-gray-400 ml-1">(you)</span>
                    )}
                  </td>
                  <td className={`py-2 px-3 capitalize ${statusColors[player.status] || ''}`}>
                    {player.status === 'winner' ? 'Winner!' : player.status}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {player.eliminated_gameweek || '-'}
                  </td>
                  <td className="py-2 px-3 text-center">{player.picks_made}</td>
                  <td className="py-2 px-3 text-center">{player.teams_used || 0}/20</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gameweek History */}
      {gameweeks.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-lg mb-4">Pick History</h2>
          <div className="space-y-4">
            {gameweeks.map(gw => (
              <details key={gw} className="border border-gray-200 rounded-lg" open={gw === gameweeks[0]}>
                <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700 hover:bg-gray-50">
                  Gameweek {gw}
                </summary>
                <div className="px-4 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1">Player</th>
                        <th className="text-left py-1">Pick</th>
                        <th className="text-left py-1">Opponent</th>
                        <th className="text-center py-1">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history[gw].map(pick => (
                        <tr key={pick.pick_id} className="border-b border-gray-50">
                          <td className="py-1.5">{pick.username}</td>
                          <td className="py-1.5 font-medium">{pick.team_name}</td>
                          <td className="py-1.5 text-gray-500">{pick.opponent || '-'}</td>
                          <td className="py-1.5 text-center">
                            {pick.result === 'win' && <span className="text-positive-600 font-bold">W</span>}
                            {pick.result === 'draw' && <span className="text-warning-600 font-bold">D</span>}
                            {pick.result === 'loss' && <span className="text-danger-600 font-bold">L</span>}
                            {!pick.result && <span className="text-gray-400">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
