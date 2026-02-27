const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const pool = require('./src/db/connection');

// Separate pool for the shared auth/session database (cogsAuth)
const authPool = process.env.AUTH_DATABASE_URL
  ? new Pool({
      connectionString: process.env.AUTH_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      user: process.env.DB_USER || 'chriscogbill',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.AUTH_DB_NAME || 'cogsAuth',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT || '5432'),
    });

// Import routes
const gamesRouter = require('./src/routes/games');
const picksRouter = require('./src/routes/picks');
const fixturesRouter = require('./src/routes/fixtures');
const settingsRouter = require('./src/routes/settings');

const app = express();
const PORT = process.env.PORT || 3003;

// ============================================
// Middleware
// ============================================

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3004,http://localhost:3002').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

const isProduction = process.env.NODE_ENV === 'production';
const cookieConfig = {
  secure: isProduction,
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-subdomain fetch with credentials
  maxAge: 24 * 60 * 60 * 1000
};

if (process.env.COOKIE_DOMAIN) {
  cookieConfig.domain = process.env.COOKIE_DOMAIN;
}

app.use(session({
  store: new pgSession({
    pool: authPool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'cogs-shared-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: cookieConfig
}));

app.use(express.json());

// Lazy sync: ensure authenticated users have a profile in the local user_profiles table
app.use(async (req, res, next) => {
  if (req.session?.userId && req.session?.email) {
    try {
      await pool.query(
        `INSERT INTO user_profiles (user_id, email, username, full_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username, full_name = EXCLUDED.full_name`,
        [req.session.userId, req.session.email, req.session.username || req.session.email, null]
      );
    } catch (err) {
      console.error('User profile sync error:', err.message);
    }
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  const sessionInfo = req.session?.userId ? `[User: ${req.session.email}]` : '[Not authenticated]';
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} ${sessionInfo}`);
  next();
});

// ============================================
// Routes
// ============================================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    let authDbStatus = 'unknown';
    let sessionCount = 0;
    try {
      const sessResult = await authPool.query('SELECT COUNT(*) as cnt FROM session');
      sessionCount = sessResult.rows[0].cnt;
      authDbStatus = 'connected';
    } catch (authErr) {
      authDbStatus = `error: ${authErr.message}`;
    }
    res.json({
      status: 'healthy',
      database: 'connected',
      authDatabase: authDbStatus,
      sessionCount,
      sessionInfo: {
        hasSessionId: !!req.sessionID,
        hasUserId: !!req.session?.userId,
        cookieHeader: req.headers.cookie ? 'present' : 'missing'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Prem Picker API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      games: '/api/games',
      fixtures: '/api/fixtures',
      teams: '/api/teams',
      settings: '/api/settings',
      health: '/health'
    }
  });
});

// ============================================
// Auth proxy routes
// Forwards auth requests to cogs-auth server-to-server,
// then sets the session locally so the cookie comes from
// this origin (api-plpicker.cogs.tech) — avoids cross-origin cookie issues.
// ============================================
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3002';

app.post('/api/auth/login', async (req, res) => {
  try {
    const authResponse = await fetch(`${AUTH_SERVICE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await authResponse.json();

    if (authResponse.ok && data.success && data.user) {
      req.session.userId = data.user.userId;
      req.session.email = data.user.email;
      req.session.username = data.user.username;
      req.session.role = data.user.role;
    }

    res.status(authResponse.status).json(data);
  } catch (error) {
    console.error('Auth proxy error (login):', error);
    res.status(502).json({ success: false, error: 'Auth service unavailable' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const authResponse = await fetch(`${AUTH_SERVICE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await authResponse.json();

    if (authResponse.ok && data.success && data.user) {
      req.session.userId = data.user.userId;
      req.session.email = data.user.email;
      req.session.username = data.user.username;
      req.session.role = data.user.role;
    }

    res.status(authResponse.status).json(data);
  } catch (error) {
    console.error('Auth proxy error (register):', error);
    res.status(502).json({ success: false, error: 'Auth service unavailable' });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (req.session?.userId) {
    res.json({
      success: true,
      user: {
        userId: req.session.userId,
        email: req.session.email,
        username: req.session.username,
        role: req.session.role || 'user'
      }
    });
  } else {
    res.status(401).json({ success: false, error: 'Not authenticated' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out' });
  });
});

app.use('/api/games', gamesRouter);
app.use('/api/fixtures', fixturesRouter);
app.use('/api/settings', settingsRouter);
// Picks are nested under games: /api/games/:id/picks, /api/games/:id/my-picks, etc.
// Mounted in games router

// ============================================
// Error Handling
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error')
  });
});

// ============================================
// Server Startup
// ============================================

app.listen(PORT, async () => {
  console.log('\n===========================================');
  console.log('Prem Picker API');
  console.log('===========================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    const result = await pool.query('SELECT COUNT(*) as game_count FROM games');
    console.log(`✓ Database connected (${result.rows[0].game_count} games)`);
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
  }

  console.log('\nAvailable endpoints:');
  console.log('  GET  /health                          - Health check');
  console.log('  GET  /api/games                       - List games');
  console.log('  POST /api/games                       - Create game');
  console.log('  GET  /api/games/:id                   - Game details');
  console.log('  GET  /api/games/:id/standings          - Game standings');
  console.log('  POST /api/games/:id/picks              - Submit pick');
  console.log('  GET  /api/fixtures/:gameweek            - Gameweek fixtures');
  console.log('  GET  /api/teams                        - PL teams');
  console.log('===========================================\n');
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await pool.end();
  await authPool.end();
  process.exit(0);
});
