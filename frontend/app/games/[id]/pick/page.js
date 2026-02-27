'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/AuthContext';
import { api } from '../../../../lib/api';

export default function PickPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading, currentGameweek } = useAuth();
  const [teams, setTeams] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [myPicks, setMyPicks] = useState([]);
  const [playerStatus, setPlayerStatus] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [currentPick, setCurrentPick] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!loading && currentGameweek) {
      loadData();
    }
  }, [loading, currentGameweek]);

  // Countdown timer
  useEffect(() => {
    if (!deadline || deadlinePassed) return;

    const interval = setInterval(() => {
      const now = new Date();
      const dl = new Date(deadline);
      const diff = dl - now;

      if (diff <= 0) {
        setDeadlinePassed(true);
        setTimeLeft('Deadline passed');
        clearInterval(interval);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        days > 0 ? `${days}d ${hours}h ${minutes}m` :
        hours > 0 ? `${hours}h ${minutes}m ${seconds}s` :
        `${minutes}m ${seconds}s`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline, deadlinePassed]);

  async function loadData() {
    try {
      const [teamsData, fixturesData, picksData, deadlineData] = await Promise.all([
        api.getPlTeams(),
        api.getFixtures(currentGameweek),
        api.getMyPicks(id),
        api.getDeadline(currentGameweek)
      ]);

      setTeams(teamsData.teams || []);
      setFixtures(fixturesData.fixtures || []);
      setMyPicks(picksData.picks || []);
      setPlayerStatus(picksData.playerStatus);
      setDeadline(deadlineData.deadline);
      setDeadlinePassed(deadlineData.isPast || false);

      // Check if there's already a pick for this gameweek
      const thisWeekPick = picksData.picks?.find(p => p.gameweek === currentGameweek);
      if (thisWeekPick) {
        setCurrentPick(thisWeekPick);
        setSelectedTeam(thisWeekPick.team_id);
      }
    } catch (error) {
      console.error('Error loading pick data:', error);
      setError(error.message || 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleSubmit() {
    if (!selectedTeam) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const result = await api.submitPick(id, selectedTeam);
      setSuccess(result.message);
      setCurrentPick({ team_id: selectedTeam });
      // Refresh picks
      const picksData = await api.getMyPicks(id);
      setMyPicks(picksData.picks || []);
    } catch (err) {
      setError(err.message || 'Failed to submit pick');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || loadingData) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!user) {
    return <div className="card text-center"><p className="text-gray-600">Please log in.</p></div>;
  }

  if (playerStatus === 'eliminated') {
    return (
      <div className="card text-center">
        <div className="text-4xl mb-4">&#128532;</div>
        <h1 className="text-2xl font-bold text-danger-600 mb-2">Eliminated</h1>
        <p className="text-gray-600">You've been knocked out of this game.</p>
        <button onClick={() => router.push(`/games/${id}`)} className="btn-secondary mt-4">
          Back to Game
        </button>
      </div>
    );
  }

  // Build team data with fixture info and used status
  const usedTeamIds = new Set(myPicks.filter(p => p.gameweek !== currentGameweek).map(p => p.team_id));
  const allUsed = usedTeamIds.size >= 20;

  const fixtureMap = {};
  for (const f of fixtures) {
    fixtureMap[f.home_team_id] = { opponent: f.away_team, opponentShort: f.away_short, location: 'H', fixture: f };
    fixtureMap[f.away_team_id] = { opponent: f.home_team, opponentShort: f.home_short, location: 'A', fixture: f };
  }

  const teamsWithInfo = teams.map(t => ({
    ...t,
    fixture: fixtureMap[t.team_id],
    isUsed: !allUsed && usedTeamIds.has(t.team_id),
    hasFixture: !!fixtureMap[t.team_id],
  })).sort((a, b) => {
    if (a.isUsed !== b.isUsed) return a.isUsed ? 1 : -1;
    if (a.hasFixture !== b.hasFixture) return a.hasFixture ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Make Your Pick</h1>
          <p className="text-sm text-gray-500">Gameweek {currentGameweek}</p>
        </div>
        <button onClick={() => router.push(`/games/${id}`)} className="btn-secondary text-sm">
          Back to Game
        </button>
      </div>

      {/* Deadline */}
      <div className={`rounded-lg p-4 text-center ${
        deadlinePassed ? 'bg-danger-100 text-danger-700' :
        timeLeft && !timeLeft.includes('d') ? 'bg-warning-100 text-warning-700' :
        'bg-link-100 text-link-700'
      }`}>
        <p className="text-sm font-medium">
          {deadlinePassed ? 'Deadline has passed' : `Deadline: ${timeLeft}`}
        </p>
        {deadline && (
          <p className="text-xs mt-1">
            {new Date(deadline).toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            })}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-danger-100 border border-danger-400 text-danger-700 px-4 py-3 rounded">{error}</div>
      )}
      {success && (
        <div className="bg-positive-100 border border-positive-400 text-positive-700 px-4 py-3 rounded">{success}</div>
      )}

      {/* Current pick */}
      {currentPick && !deadlinePassed && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <p className="text-sm text-primary-700">
            Current pick: <strong>{teams.find(t => t.team_id === currentPick.team_id)?.name || 'Unknown'}</strong>
            <span className="text-primary-500 ml-2">(you can change this before the deadline)</span>
          </p>
        </div>
      )}

      {/* Team selection */}
      {!deadlinePassed ? (
        <div>
          <h2 className="font-bold mb-3">Select a team to win:</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {teamsWithInfo.map(team => {
              const isSelected = selectedTeam === team.team_id;
              const disabled = team.isUsed || !team.hasFixture;

              return (
                <button
                  key={team.team_id}
                  onClick={() => !disabled && setSelectedTeam(team.team_id)}
                  disabled={disabled}
                  className={`text-left p-4 rounded-lg border-2 transition-all cursor-pointer
                    ${isSelected
                      ? 'border-primary-500 bg-primary-50 shadow-md'
                      : disabled
                      ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    {team.crest_url && (
                      <img src={team.crest_url} alt="" className="w-8 h-8 object-contain" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold ${disabled ? 'line-through text-gray-400' : ''}`}>
                        {team.name}
                      </p>
                      {team.fixture ? (
                        <p className="text-xs text-gray-500">
                          vs {team.fixture.opponent} ({team.fixture.location})
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">No fixture this GW</p>
                      )}
                    </div>
                    {team.isUsed && (
                      <span className="text-xs text-gray-400 shrink-0">Used</span>
                    )}
                    {isSelected && (
                      <span className="text-primary-600 text-lg shrink-0">&#10003;</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedTeam && (
            <div className="mt-6 text-center">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-primary px-8 py-3 text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : currentPick ? 'Change Pick' : 'Confirm Pick'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-gray-600">
            {currentPick
              ? `Your pick: ${teams.find(t => t.team_id === currentPick.team_id)?.name || 'Unknown'}`
              : 'No pick submitted for this gameweek.'}
          </p>
        </div>
      )}

      {/* Past picks */}
      {myPicks.length > 0 && (
        <div className="card">
          <h2 className="font-bold mb-3">Your Previous Picks</h2>
          <div className="space-y-1">
            {myPicks.filter(p => p.gameweek !== currentGameweek).map(pick => (
              <div key={pick.pick_id} className="flex justify-between items-center py-1 text-sm border-b border-gray-100">
                <span className="text-gray-500">GW {pick.gameweek}</span>
                <span className="font-medium">{pick.team_name}</span>
                <span>
                  {pick.result === 'win' && <span className="text-positive-600 font-bold">W</span>}
                  {pick.result === 'draw' && <span className="text-warning-600 font-bold">D</span>}
                  {pick.result === 'loss' && <span className="text-danger-600 font-bold">L</span>}
                  {!pick.result && <span className="text-gray-400">-</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
