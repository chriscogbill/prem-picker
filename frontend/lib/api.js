const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth
  async register(email, username, password) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
  }

  async login(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  async getCurrentUser() {
    return this.request('/api/auth/me');
  }

  // Games
  async getGames(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/games?${query}`);
  }

  async getGame(id) {
    return this.request(`/api/games/${id}`);
  }

  async createGame(data) {
    return this.request('/api/games', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async joinGame(inviteCode) {
    return this.request('/api/games/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async startGame(id) {
    return this.request(`/api/games/${id}/start`, { method: 'POST' });
  }

  async getGameStandings(id) {
    return this.request(`/api/games/${id}/standings`);
  }

  async getGameHistory(id) {
    return this.request(`/api/games/${id}/history`);
  }

  // Picks
  async getMyPicks(gameId) {
    return this.request(`/api/games/${gameId}/my-picks`);
  }

  async getGameweekPicks(gameId, gameweek) {
    return this.request(`/api/games/${gameId}/picks/${gameweek}`);
  }

  async submitPick(gameId, plTeamId) {
    return this.request(`/api/games/${gameId}/picks`, {
      method: 'POST',
      body: JSON.stringify({ plTeamId }),
    });
  }

  async processResults(gameId, gameweek) {
    return this.request(`/api/games/${gameId}/process-results`, {
      method: 'POST',
      body: JSON.stringify({ gameweek }),
    });
  }

  async deleteGame(id) {
    return this.request(`/api/games/${id}`, { method: 'DELETE' });
  }

  async addPlayer(gameId, email, username) {
    return this.request(`/api/games/${gameId}/add-player`, {
      method: 'POST',
      body: JSON.stringify({ email, username }),
    });
  }

  async importPick(gameId, playerEmail, gameweek, teamShortName) {
    return this.request(`/api/games/${gameId}/import-pick`, {
      method: 'POST',
      body: JSON.stringify({ playerEmail, gameweek, teamShortName }),
    });
  }

  async setPlayerStatus(gameId, playerEmail, status, eliminatedGameweek) {
    return this.request(`/api/games/${gameId}/set-player-status`, {
      method: 'POST',
      body: JSON.stringify({ playerEmail, status, eliminatedGameweek }),
    });
  }

  // Fixtures
  async getFixtures(gameweek, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/fixtures/${gameweek}?${query}`);
  }

  async getDeadline(gameweek, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/fixtures/${gameweek}/deadline?${query}`);
  }

  async getPlTeams(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/fixtures/teams?${query}`);
  }

  async importFixtures(season, upcomingOnly = true) {
    return this.request('/api/fixtures/import', {
      method: 'POST',
      body: JSON.stringify({ season, upcomingOnly }),
    });
  }

  async updateResults(season) {
    return this.request('/api/fixtures/update-results', {
      method: 'POST',
      body: JSON.stringify({ season }),
    });
  }

  // Settings
  async getSettings() {
    return this.request('/api/settings');
  }

  async getSetting(key) {
    return this.request(`/api/settings/${key}`);
  }

  async updateSetting(key, value) {
    return this.request(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }

  async getCurrentGameweek() {
    const response = await this.getSetting('current_gameweek');
    return parseInt(response.value);
  }

  async getCurrentSeason() {
    const response = await this.getSetting('current_season');
    return parseInt(response.value);
  }
}

export const api = new ApiClient();
