async function getCurrentSeason(pool) {
  const result = await pool.query(
    "SELECT setting_value FROM app_settings WHERE setting_key = 'current_season'"
  );
  return parseInt(result.rows[0]?.setting_value) || 2024;
}

async function getCurrentGameweek(pool) {
  const result = await pool.query(
    "SELECT setting_value FROM app_settings WHERE setting_key = 'current_gameweek'"
  );
  return parseInt(result.rows[0]?.setting_value) || 1;
}

module.exports = { getCurrentSeason, getCurrentGameweek };
