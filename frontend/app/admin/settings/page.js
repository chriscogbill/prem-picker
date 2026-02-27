'use client';

import { useState } from 'react';
import { useAuth } from '../../../lib/AuthContext';
import { api } from '../../../lib/api';

export default function AdminSettingsPage() {
  const { user, loading, currentSeason } = useAuth();
  const [importing, setImporting] = useState(false);
  const [updatingResults, setUpdatingResults] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleImportFixtures() {
    setImporting(true);
    setMessage('');
    setError('');
    try {
      const result = await api.importFixtures(currentSeason);
      setMessage(result.message);
    } catch (err) {
      setError(err.message || 'Failed to import fixtures');
    } finally {
      setImporting(false);
    }
  }

  async function handleUpdateResults() {
    setUpdatingResults(true);
    setMessage('');
    setError('');
    try {
      const result = await api.updateResults(currentSeason);
      setMessage(result.message);
    } catch (err) {
      setError(err.message || 'Failed to update results');
    } finally {
      setUpdatingResults(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!user || user.role !== 'admin') {
    return <div className="card text-center"><p className="text-gray-600">Admin access required.</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Admin Settings</h1>

      {message && (
        <div className="bg-positive-100 border border-positive-400 text-positive-700 px-4 py-3 rounded">{message}</div>
      )}
      {error && (
        <div className="bg-danger-100 border border-danger-400 text-danger-700 px-4 py-3 rounded">{error}</div>
      )}

      <div className="card">
        <h2 className="font-bold text-lg mb-2">Current Season</h2>
        <p className="text-gray-600 mb-4">
          {currentSeason}/{(currentSeason + 1).toString().slice(-2)}
        </p>
      </div>

      <div className="card">
        <h2 className="font-bold text-lg mb-2">Fixture Management</h2>
        <p className="text-sm text-gray-600 mb-4">
          Import fixtures from football-data.org or update results for completed matches.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleImportFixtures}
            disabled={importing}
            className="btn-primary disabled:bg-gray-400"
          >
            {importing ? 'Importing...' : 'Import Fixtures'}
          </button>
          <button
            onClick={handleUpdateResults}
            disabled={updatingResults}
            className="btn-secondary disabled:bg-gray-400"
          >
            {updatingResults ? 'Updating...' : 'Update Results'}
          </button>
        </div>
      </div>
    </div>
  );
}
