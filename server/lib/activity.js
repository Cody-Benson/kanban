const pool = require('../db');

// Records a mutation in the activity log with its actor (the human user, or
// the agent API token acting on their behalf). Fire-safe: a logging failure
// must never fail the mutation it describes.
async function logActivity(req, { projectId, taskId, action, details }) {
  try {
    await pool.query(
      `INSERT INTO activity_log (project_id, task_id, user_id, actor_type, token_id, action, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        projectId ?? null,
        taskId ?? null,
        req.userId,
        req.actor?.type ?? 'human',
        req.actor?.tokenId ?? null,
        action,
        JSON.stringify(details || {}),
      ]
    );
  } catch (err) {
    console.error('Activity log write failed (non-fatal):', err.message);
  }
}

module.exports = { logActivity };
