const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { requireAuth, requireAdmin, requireGameAdmin } = require('../middleware/requireAuth');
const { getCurrentSeason, getCurrentGameweek } = require('../helpers/settings');
const picksRouter = require('./picks');

// Mount picks routes under /api/games/:id/
router.use('/:id', picksRouter);

// GET /api/games - List games
router.get('/', async (req, res) => {
  try {
    const season = req.query.season || await getCurrentSeason(pool);

    const result = await pool.query(
      `SELECT g.game_id, g.game_name, g.season, g.admin_email, g.start_gameweek,
              g.status, g.is_draw, g.created_at,
              COUNT(gp.player_id) AS player_count,
              COUNT(gp.player_id) FILTER (WHERE gp.status = 'alive') AS alive_count
       FROM games g
       LEFT JOIN game_players gp ON g.game_id = gp.game_id
       WHERE g.season = $1
       GROUP BY g.game_id
       ORDER BY g.status ASC, g.created_at DESC`,
      [season]
    );

    // If user is authenticated, add their membership info
    if (req.session?.email) {
      const memberResult = await pool.query(
        `SELECT game_id, status AS player_status
         FROM game_players
         WHERE user_email = $1`,
        [req.session.email]
      );
      const memberMap = {};
      memberResult.rows.forEach(r => { memberMap[r.game_id] = r.player_status; });

      result.rows.forEach(game => {
        game.user_status = memberMap[game.game_id] || null;
        game.is_member = !!memberMap[game.game_id];
      });
    }

    res.json({ success: true, games: result.rows });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/games/:id - Get game detail with players
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const gameResult = await pool.query(
      `SELECT * FROM games WHERE game_id = $1`,
      [id]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }

    const game = gameResult.rows[0];

    const playersResult = await pool.query(
      `SELECT gp.player_id, gp.user_email, gp.username, gp.status,
              gp.eliminated_gameweek, gp.joined_at,
              COUNT(p.pick_id) AS picks_made
       FROM game_players gp
       LEFT JOIN picks p ON gp.player_id = p.game_player_id
       WHERE gp.game_id = $1
       GROUP BY gp.player_id
       ORDER BY
         CASE gp.status
           WHEN 'winner' THEN 1
           WHEN 'alive' THEN 2
           WHEN 'drawn' THEN 3
           WHEN 'eliminated' THEN 4
         END,
         gp.eliminated_gameweek DESC NULLS FIRST`,
      [id]
    );

    // Only include invite_code if the user is the game admin
    const isAdmin = req.session?.email === game.admin_email || req.session?.role === 'admin';

    res.json({
      success: true,
      game: {
        ...game,
        invite_code: isAdmin ? game.invite_code : undefined
      },
      players: playersResult.rows
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/games - Create a new game
router.post('/', requireAuth, async (req, res) => {
  try {
    const { gameName, startGameweek } = req.body;

    if (!gameName) {
      return res.status(400).json({ success: false, error: 'gameName is required' });
    }

    const season = await getCurrentSeason(pool);
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    const result = await pool.query(
      `INSERT INTO games (game_name, season, created_by_email, admin_email, invite_code, start_gameweek)
       VALUES ($1, $2, $3, $3, $4, $5)
       RETURNING *`,
      [gameName, season, req.session.email, inviteCode, startGameweek || 1]
    );

    const game = result.rows[0];

    // Auto-add the creator as a player
    await pool.query(
      `INSERT INTO game_players (game_id, user_email, username)
       VALUES ($1, $2, $3)`,
      [game.game_id, req.session.email, req.session.username || req.session.email]
    );

    res.status(201).json({
      success: true,
      game,
      message: `Game created! Share invite code: ${inviteCode}`
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Invite code conflict, please try again' });
    }
    console.error('Error creating game:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/games/join - Join a game via invite code
router.post('/join', requireAuth, async (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ success: false, error: 'inviteCode is required' });
    }

    const gameResult = await pool.query(
      'SELECT * FROM games WHERE invite_code = $1',
      [inviteCode.toUpperCase()]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid invite code' });
    }

    const game = gameResult.rows[0];

    if (game.status !== 'open') {
      return res.status(400).json({ success: false, error: 'This game is no longer accepting players' });
    }

    // Check if already a member
    const existingResult = await pool.query(
      'SELECT * FROM game_players WHERE game_id = $1 AND user_email = $2',
      [game.game_id, req.session.email]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'You are already in this game' });
    }

    await pool.query(
      `INSERT INTO game_players (game_id, user_email, username)
       VALUES ($1, $2, $3)`,
      [game.game_id, req.session.email, req.session.username || req.session.email]
    );

    res.json({
      success: true,
      game_id: game.game_id,
      message: `Joined "${game.game_name}" successfully`
    });
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/games/:id/start - Start a game (game admin only)
router.post('/:id/start', requireAuth, requireGameAdmin(), async (req, res) => {
  try {
    const { id } = req.params;

    const gameResult = await pool.query('SELECT * FROM games WHERE game_id = $1', [id]);
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }

    const game = gameResult.rows[0];

    if (game.status !== 'open') {
      return res.status(400).json({ success: false, error: 'Game is not in open status' });
    }

    // Need at least 2 players
    const playerCount = await pool.query(
      'SELECT COUNT(*) AS count FROM game_players WHERE game_id = $1',
      [id]
    );

    if (parseInt(playerCount.rows[0].count) < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 players to start a game' });
    }

    await pool.query(
      `UPDATE games SET status = 'active' WHERE game_id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Game started!'
    });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/games/:id/standings - Get game standings
router.get('/:id/standings', async (req, res) => {
  try {
    const { id } = req.params;

    const gameResult = await pool.query('SELECT * FROM games WHERE game_id = $1', [id]);
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }

    const playersResult = await pool.query(
      `SELECT gp.player_id, gp.user_email, gp.username, gp.status,
              gp.eliminated_gameweek,
              COUNT(p.pick_id) AS picks_made,
              COUNT(DISTINCT p.pl_team_id) AS teams_used
       FROM game_players gp
       LEFT JOIN picks p ON gp.player_id = p.game_player_id
       WHERE gp.game_id = $1
       GROUP BY gp.player_id
       ORDER BY
         CASE gp.status
           WHEN 'winner' THEN 1
           WHEN 'alive' THEN 2
           WHEN 'drawn' THEN 3
           WHEN 'eliminated' THEN 4
         END,
         gp.eliminated_gameweek DESC NULLS FIRST`,
      [id]
    );

    res.json({
      success: true,
      game: gameResult.rows[0],
      standings: playersResult.rows
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/games/:id/history - Get pick history per gameweek
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const currentGameweek = await getCurrentGameweek(pool);

    const result = await pool.query(
      `SELECT p.pick_id, p.gameweek, p.result,
              gp.username, gp.user_email, gp.status AS player_status,
              t.name AS team_name, t.short_name AS team_short,
              -- Get the fixture for this pick's team in this gameweek
              CASE
                WHEN f_home.fixture_id IS NOT NULL THEN
                  CONCAT(at_away.short_name, ' (H)')
                WHEN f_away.fixture_id IS NOT NULL THEN
                  CONCAT(ht_home.short_name, ' (A)')
              END AS opponent
       FROM picks p
       JOIN game_players gp ON p.game_player_id = gp.player_id
       JOIN pl_teams t ON p.pl_team_id = t.team_id
       LEFT JOIN pl_fixtures f_home ON f_home.home_team_id = p.pl_team_id
         AND f_home.gameweek = p.gameweek AND f_home.season = (SELECT setting_value::int FROM app_settings WHERE setting_key = 'current_season')
       LEFT JOIN pl_teams at_away ON f_home.away_team_id = at_away.team_id
       LEFT JOIN pl_fixtures f_away ON f_away.away_team_id = p.pl_team_id
         AND f_away.gameweek = p.gameweek AND f_away.season = (SELECT setting_value::int FROM app_settings WHERE setting_key = 'current_season')
       LEFT JOIN pl_teams ht_home ON f_away.home_team_id = ht_home.team_id
       WHERE p.game_id = $1
       ORDER BY p.gameweek DESC, gp.username`,
      [id]
    );

    // Group by gameweek
    const history = {};
    result.rows.forEach(row => {
      if (!history[row.gameweek]) {
        history[row.gameweek] = [];
      }
      history[row.gameweek].push(row);
    });

    res.json({
      success: true,
      history,
      currentGameweek
    });
  } catch (error) {
    console.error('Error fetching game history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
