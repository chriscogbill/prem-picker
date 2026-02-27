const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { requireAdmin } = require('../middleware/requireAuth');
const { getCurrentSeason, autoDetectGameweek } = require('../helpers/settings');

// GET /api/settings - Get all settings (with auto-detected gameweek)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value, description, updated_at
       FROM app_settings
       ORDER BY setting_key`
    );

    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = {
        value: row.setting_value,
        description: row.description,
        updated_at: row.updated_at
      };
    });

    // Auto-detect gameweek from fixture dates if fixtures exist
    const season = parseInt(settings.current_season?.value) || 2024;
    const detectedGw = await autoDetectGameweek(pool, season);
    if (detectedGw != null) {
      settings.current_gameweek.value = String(detectedGw);
    }

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/settings/:key - Get specific setting
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    const result = await pool.query(
      `SELECT setting_value, description, updated_at
       FROM app_settings
       WHERE setting_key = $1`,
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    let value = result.rows[0].setting_value;

    // Auto-detect gameweek from fixture dates
    if (key === 'current_gameweek') {
      const season = await getCurrentSeason(pool);
      const detectedGw = await autoDetectGameweek(pool, season);
      if (detectedGw != null) {
        value = String(detectedGw);
      }
    }

    res.json({
      success: true,
      key,
      value,
      description: result.rows[0].description,
      updated_at: result.rows[0].updated_at
    });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/settings/:key - Update setting (admin only)
router.put('/:key', requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value && value !== 0) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    const result = await pool.query(
      `UPDATE app_settings
       SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = $2
       RETURNING *`,
      [value, key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({
      success: true,
      message: `Setting '${key}' updated successfully`,
      setting: {
        key: result.rows[0].setting_key,
        value: result.rows[0].setting_value,
        description: result.rows[0].description,
        updated_at: result.rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
