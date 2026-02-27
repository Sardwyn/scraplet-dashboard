import db from '../db.js';

export async function getClickstreamTrend(userId) {
  const result = await db.query(`
    SELECT
      action,
      COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days') AS current_count,
      COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '14 days' AND timestamp < NOW() - INTERVAL '7 days') AS previous_count
    FROM profile_clicks
    WHERE user_id = $1
    GROUP BY action
    ORDER BY current_count DESC
    LIMIT 10;
  `, [userId]);

  return result.rows.map(row => {
    const { action, current_count, previous_count } = row;
    const current = Number(current_count);
    const previous = Number(previous_count);
    const percentChange = previous > 0
      ? ((current - previous) / previous) * 100
      : current > 0 ? 100 : 0;

    return {
      action,
      currentCount: current,
      previousCount: previous,
      percentChange
    };
  });
}
