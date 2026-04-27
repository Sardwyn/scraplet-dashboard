// src/insights/detectors/index.js
// All six pattern detector pure functions.
// Each returns a PatternResult object or null.
// Never throws for any input.

// ── Day of Week Detector ──────────────────────────────────────────────────────
// Requires >= 10 sessions, >= 2 distinct days
export function dayOfWeekDetector(sessions, metricKey = 'messages_per_minute') {
  try {
    if (!sessions || sessions.length < 10) return null;
    const byDay = {};
    for (const s of sessions) {
      const day = new Date(s.started_at).getDay();
      if (!byDay[day]) byDay[day] = [];
      const val = Number(s[metricKey]);
      if (isFinite(val)) byDay[day].push(val);
    }
    const days = Object.keys(byDay).filter(d => byDay[d].length > 0);
    if (days.length < 2) return null;
    const means = {};
    for (const d of days) {
      means[d] = byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length;
    }
    const bestDay = days.reduce((a, b) => means[a] > means[b] ? a : b);
    const worstDay = days.reduce((a, b) => means[a] < means[b] ? a : b);
    const pctDiff = means[worstDay] > 0
      ? Math.round(((means[bestDay] - means[worstDay]) / means[worstDay]) * 100)
      : null;
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return {
      type: 'day_of_week',
      metric_key: metricKey,
      bestDay: dayNames[bestDay],
      worstDay: dayNames[worstDay],
      bestMean: Math.round(means[bestDay] * 10) / 10,
      worstMean: Math.round(means[worstDay] * 10) / 10,
      pctDiff,
      supporting_data: { means: Object.fromEntries(days.map(d => [dayNames[d], Math.round(means[d]*10)/10])), sessionCount: sessions.length }
    };
  } catch { return null; }
}

// ── Session Length Sweet Spot ─────────────────────────────────────────────────
// Requires >= 5 sessions with duration and peak_ccv
export function sessionLengthSweetSpot(sessions) {
  try {
    const valid = (sessions || []).filter(s => isFinite(s.duration_minutes) && isFinite(s.peak_ccv) && s.duration_minutes > 0);
    if (valid.length < 5) return null;
    const sorted = [...valid].sort((a, b) => b.peak_ccv - a.peak_ccv);
    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);
    const durations = top3.map(s => s.duration_minutes);
    const rangeStart = Math.min(...durations);
    const rangeEnd = Math.max(...durations);
    if (rangeStart === rangeEnd && top3.length < 3) return null;
    const topMeanCcv = Math.round(top3.reduce((a, s) => a + s.peak_ccv, 0) / top3.length);
    const otherMeanCcv = rest.length > 0
      ? Math.round(rest.reduce((a, s) => a + s.peak_ccv, 0) / rest.length)
      : null;
    return {
      type: 'session_length_sweet_spot',
      rangeStart: Math.round(rangeStart / 6) / 10, // hours to 1dp
      rangeEnd: Math.round(rangeEnd / 6) / 10,
      topMeanCcv,
      otherMeanCcv,
      supporting_data: { top3Durations: durations, sessionCount: valid.length }
    };
  } catch { return null; }
}

// ── MPM Decay Detector ────────────────────────────────────────────────────────
// Requires >= 5 sessions with mpm_buckets (array of {minute, mpm})
export function mpmDecayDetector(sessions) {
  try {
    const withBuckets = (sessions || []).filter(s => Array.isArray(s.mpm_buckets) && s.mpm_buckets.length > 2);
    if (withBuckets.length < 5) return null;
    // Aggregate mean MPM per minute bucket across sessions
    const bucketTotals = {};
    const bucketCounts = {};
    for (const s of withBuckets) {
      for (const b of s.mpm_buckets) {
        const min = Math.round(b.minute / 10) * 10; // 10-min buckets
        bucketTotals[min] = (bucketTotals[min] || 0) + b.mpm;
        bucketCounts[min] = (bucketCounts[min] || 0) + 1;
      }
    }
    const buckets = Object.keys(bucketTotals).map(m => ({
      minute: Number(m),
      meanMpm: bucketTotals[m] / bucketCounts[m]
    })).sort((a, b) => a.minute - b.minute);
    if (buckets.length < 3) return null;
    const peakMpm = Math.max(...buckets.map(b => b.meanMpm));
    const decayThreshold = peakMpm * 0.75; // 25% drop
    const decayBucket = buckets.find(b => b.meanMpm <= decayThreshold && b.minute > 0);
    if (!decayBucket) return null;
    const pctDrop = Math.round(((peakMpm - decayBucket.meanMpm) / peakMpm) * 100);
    return {
      type: 'mpm_decay',
      decayMinute: decayBucket.minute,
      pctDrop,
      peakMpm: Math.round(peakMpm * 10) / 10,
      supporting_data: { buckets: buckets.slice(0, 12), sessionCount: withBuckets.length }
    };
  } catch { return null; }
}

// ── Game/Category Correlation ─────────────────────────────────────────────────
// Requires >= 5 sessions with game_name and messages_per_minute
export function gameCategoryCorrelation(sessions, metricKey = 'messages_per_minute') {
  try {
    const valid = (sessions || []).filter(s => s.game_name && isFinite(s[metricKey]));
    if (valid.length < 5) return null;
    const byGame = {};
    for (const s of valid) {
      const g = s.game_name;
      if (!byGame[g]) byGame[g] = [];
      byGame[g].push(Number(s[metricKey]));
    }
    const games = Object.keys(byGame);
    if (games.length < 2) return null;
    const means = {};
    for (const g of games) {
      means[g] = byGame[g].reduce((a, b) => a + b, 0) / byGame[g].length;
    }
    const topGame = games.reduce((a, b) => means[a] > means[b] ? a : b);
    const otherSessions = valid.filter(s => s.game_name !== topGame);
    const otherMean = otherSessions.length > 0
      ? otherSessions.reduce((a, s) => a + Number(s[metricKey]), 0) / otherSessions.length
      : null;
    const multiplier = otherMean && otherMean > 0
      ? Math.round((means[topGame] / otherMean) * 10) / 10
      : null;
    return {
      type: 'game_category_correlation',
      metric_key: metricKey,
      topGame,
      topMean: Math.round(means[topGame] * 10) / 10,
      otherMean: otherMean ? Math.round(otherMean * 10) / 10 : null,
      multiplier,
      supporting_data: { counts: Object.fromEntries(games.map(g => [g, byGame[g].length])), means: Object.fromEntries(games.map(g => [g, Math.round(means[g]*10)/10])) }
    };
  } catch { return null; }
}

// ── Retention Trend Detector ──────────────────────────────────────────────────
// Requires >= 5 sessions with returning_viewer_rate, ordered by date
export function retentionTrendDetector(sessions) {
  try {
    const valid = (sessions || [])
      .filter(s => isFinite(s.returning_viewer_rate))
      .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    if (valid.length < 5) return null;
    const oldest = valid[0].returning_viewer_rate;
    const newest = valid[valid.length - 1].returning_viewer_rate;
    if (oldest === 0) return null;
    const pctChange = Math.round(((newest - oldest) / oldest) * 100);
    if (Math.abs(pctChange) <= 10) return null;
    const trend = pctChange > 0 ? 'improving' : 'declining';
    return {
      type: 'retention_trend',
      trend,
      pctChange,
      oldestRate: Math.round(oldest * 100),
      newestRate: Math.round(newest * 100),
      supporting_data: { sessionCount: valid.length, pctChange }
    };
  } catch { return null; }
}

// ── Growth Velocity Detector ──────────────────────────────────────────────────
// Requires >= 10 sessions with follower snapshots
export function growthVelocityDetector(sessions) {
  try {
    const valid = (sessions || [])
      .filter(s => isFinite(s.follower_count) && s.started_at)
      .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    if (valid.length < 10) return null;
    const now = new Date(valid[valid.length - 1].started_at);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const recent = valid.filter(s => new Date(s.started_at) >= thirtyDaysAgo);
    const baseline = valid.filter(s => new Date(s.started_at) >= sixtyDaysAgo && new Date(s.started_at) < thirtyDaysAgo);
    if (recent.length < 3 || baseline.length < 3) return null;
    const recentGrowth = recent[recent.length-1].follower_count - recent[0].follower_count;
    const baselineGrowth = baseline[baseline.length-1].follower_count - baseline[0].follower_count;
    if (baselineGrowth === 0) return null;
    const multiplier = Math.round((recentGrowth / baselineGrowth) * 10) / 10;
    const trend = multiplier > 1.5 ? 'accelerating' : multiplier < 0.5 ? 'decelerating' : null;
    if (!trend) return null;
    return {
      type: 'growth_velocity',
      trend,
      multiplier,
      recentGrowth,
      baselineGrowth,
      supporting_data: { recentSessions: recent.length, baselineSessions: baseline.length }
    };
  } catch { return null; }
}
