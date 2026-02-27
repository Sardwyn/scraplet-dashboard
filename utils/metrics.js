const metricsState = {
  scrapers: new Map(),
  followers: new Map(),
  api: new Map(),
  tests: {
    passed: 0,
    failed: 0,
    lastRun: null,
  },
  layout: new Map(),
  activity: {
    requestsTotal: 0,
    viewsTotal: 0,
    lastRequest: null,
    byUser: new Map(),
  },
};

function now() {
  return Date.now();
}

function toSeconds(timestamp) {
  if (!timestamp) return 0;
  return Math.floor(timestamp / 1000);
}

function sanitizeLabel(value) {
  if (value == null) return '';
  return String(value).replace(/\\/g, '').replace(/"/g, '\\"');
}

function normalizeDetail(detail) {
  if (!detail) return 'generic';
  const lower = detail.toLowerCase();
  if (lower.includes('timeout')) return 'timeout';
  if (lower.includes('not found')) return 'not_found';
  if (lower.includes('unauthorized')) return 'unauthorized';
  if (lower.includes('forbidden')) return 'forbidden';
  if (lower.includes('validation')) return 'validation_error';
  if (lower.includes('cache')) return 'cache_error';
  return 'error';
}

export function recordScraperRun({ platform, status }) {
  if (!platform) return;

  const entry = metricsState.scrapers.get(platform) || {
    success: 0,
    failure: 0,
    lastSuccess: null,
    lastFailure: null,
  };

  const timestamp = now();
  if (status === 'success') {
    entry.success += 1;
    entry.lastSuccess = timestamp;
  } else {
    entry.failure += 1;
    entry.lastFailure = timestamp;
  }

  metricsState.scrapers.set(platform, entry);
}

export function recordScraperSnapshot({
  userId,
  platform,
  followers = null,
  ccv = null,
  engagement = null,
  timestamp = null,
}) {
  if (!userId || !platform) return;

  const provided = timestamp instanceof Date
    ? timestamp.getTime()
    : Number(timestamp);
  const recordedAt = Number.isFinite(provided) ? provided : now();

  metricsState.followers.set(`${userId}:${platform}`, {
    userId,
    platform,
    followers: Number.isFinite(Number(followers)) ? Number(followers) : 0,
    ccv:        Number.isFinite(Number(ccv))       ? Number(ccv)       : 0,
    engagement: Number.isFinite(Number(engagement))? Number(engagement): 0,
    timestamp: recordedAt,
  });
}

export function recordApiStatus({
  service,
  status,
  platform = null,
  detail = null,
}) {
  if (!service || !status) return;

  const normalizedDetail = normalizeDetail(detail);
  const key = `${service}:${status}:${platform ?? 'none'}:${normalizedDetail}`;

  const entry = metricsState.api.get(key) || {
    service,
    status,
    platform,
    detail: normalizedDetail,
    count: 0,
    lastOccurrence: null,
  };

  entry.count += 1;
  entry.lastOccurrence = now();
  metricsState.api.set(key, entry);
}

export function recordTestRun({ passed = 0, failed = 0, timestamp = now() }) {
  metricsState.tests = {
    passed: Number(passed) || 0,
    failed: Number(failed) || 0,
    lastRun: timestamp,
  };
}

export function recordLayoutState({ userId, layout }) {
  if (!userId || !layout) return;

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const visibility = sections.reduce((acc, section) => {
    if (section && section.type) {
      acc[section.type] = section.visible === true;
    }
    return acc;
  }, {});

  metricsState.layout.set(userId, {
    visibility,
    showButtonIcons: layout.showButtonIcons === true,
    updatedAt: now(),
  });
}

export function recordProfileRequest({
  userId = null,
  username = null,
  status = 'received',
}) {
  metricsState.activity.requestsTotal += 1;
  metricsState.activity.lastRequest = now();

  if (userId) {
    const entry = metricsState.activity.byUser.get(userId) || {
      username,
      views: 0,
      lastView: null,
      statuses: {},
    };
    entry.statuses[status] = (entry.statuses[status] || 0) + 1;

    if (status === 'success') {
      entry.views += 1;
      entry.lastView = now();
      metricsState.activity.viewsTotal += 1;
    }

    metricsState.activity.byUser.set(userId, entry);
  }
}

export function getMetricsSnapshot() {
  const scrapers = Array.from(metricsState.scrapers.entries()).map(
    ([platform, data]) => ({ platform, ...data })
  );
  const followers = Array.from(metricsState.followers.values());
  const api       = Array.from(metricsState.api.values());
  const layout    = Array.from(metricsState.layout.entries()).map(
    ([userId, data]) => ({ userId, ...data })
  );
  const activity  = {
    requestsTotal: metricsState.activity.requestsTotal,
    viewsTotal:    metricsState.activity.viewsTotal,
    lastRequest:   metricsState.activity.lastRequest,
    byUser:        Array.from(metricsState.activity.byUser.entries()).map(
      ([userId, data]) => ({ userId, ...data })
    ),
  };

  return {
    scrapers,
    followers,
    api,
    tests: { ...metricsState.tests },
    layout,
    activity,
  };
}

export function resetMetrics() {
  metricsState.scrapers.clear();
  metricsState.followers.clear();
  metricsState.api.clear();
  metricsState.tests = { passed: 0, failed: 0, lastRun: null };
  metricsState.layout.clear();
  metricsState.activity = {
    requestsTotal: 0,
    viewsTotal: 0,
    lastRequest: null,
    byUser: new Map(),
  };
}

export function generatePrometheusMetrics() {
  const lines = [];

  lines.push('# HELP scraper_success_total Total successful scraper runs by platform.');
  lines.push('# TYPE scraper_success_total counter');
  for (const [platform, data] of metricsState.scrapers.entries()) {
    lines.push(`scraper_success_total{platform="${sanitizeLabel(platform)}"} ${data.success}`);
  }

  lines.push('# HELP scraper_failure_total Total failed scraper runs by platform.');
  lines.push('# TYPE scraper_failure_total counter');
  for (const [platform, data] of metricsState.scrapers.entries()) {
    lines.push(`scraper_failure_total{platform="${sanitizeLabel(platform)}"} ${data.failure}`);
  }

  lines.push('# HELP scraper_last_success_timestamp_seconds Unix timestamp of last successful scrape per platform.');
  lines.push('# TYPE scraper_last_success_timestamp_seconds gauge');
  for (const [platform, data] of metricsState.scrapers.entries()) {
    lines.push(
      `scraper_last_success_timestamp_seconds{platform="${sanitizeLabel(platform)}"} ${toSeconds(data.lastSuccess)}`
    );
  }

  lines.push('# HELP scraper_last_failure_timestamp_seconds Unix timestamp of last failed scrape per platform.');
  lines.push('# TYPE scraper_last_failure_timestamp_seconds gauge');
  for (const [platform, data] of metricsState.scrapers.entries()) {
    lines.push(
      `scraper_last_failure_timestamp_seconds{platform="${sanitizeLabel(platform)}"} ${toSeconds(data.lastFailure)}`
    );
  }

  lines.push('# HELP follower_count Latest follower count per user and platform.');
  lines.push('# TYPE follower_count gauge');
  for (const snapshot of metricsState.followers.values()) {
    lines.push(
      `follower_count{user_id="${sanitizeLabel(snapshot.userId)}",platform="${sanitizeLabel(snapshot.platform)}"} ${snapshot.followers}`
    );
  }

  lines.push('# HELP average_ccv Latest concurrent viewer count per user and platform.');
  lines.push('# TYPE average_ccv gauge');
  for (const snapshot of metricsState.followers.values()) {
    lines.push(
      `average_ccv{user_id="${sanitizeLabel(snapshot.userId)}",platform="${sanitizeLabel(snapshot.platform)}"} ${snapshot.ccv}`
    );
  }

  lines.push('# HELP engagement_score Latest engagement metric per user and platform.');
  lines.push('# TYPE engagement_score gauge');
  for (const snapshot of metricsState.followers.values()) {
    lines.push(
      `engagement_score{user_id="${sanitizeLabel(snapshot.userId)}",platform="${sanitizeLabel(snapshot.platform)}"} ${snapshot.engagement}`
    );
  }

  lines.push('# HELP follower_last_updated_timestamp_seconds Timestamp of the last follower snapshot per user and platform.');
  lines.push('# TYPE follower_last_updated_timestamp_seconds gauge');
  for (const snapshot of metricsState.followers.values()) {
    lines.push(
      `follower_last_updated_timestamp_seconds{user_id="${sanitizeLabel(snapshot.userId)}",platform="${sanitizeLabel(snapshot.platform)}"} ${toSeconds(snapshot.timestamp)}`
    );
  }

  lines.push('# HELP service_api_events_total API status events grouped by service, status, and platform.');
  lines.push('# TYPE service_api_events_total counter');
  for (const entry of metricsState.api.values()) {
    lines.push(
      `service_api_events_total{service="${sanitizeLabel(entry.service)}",status="${sanitizeLabel(entry.status)}",platform="${sanitizeLabel(entry.platform ?? 'none')}",detail="${sanitizeLabel(entry.detail)}"} ${entry.count}`
    );
  }

  lines.push('# HELP service_api_last_occurrence_timestamp_seconds Unix timestamp for last API event by service/status.');
  lines.push('# TYPE service_api_last_occurrence_timestamp_seconds gauge');
  for (const entry of metricsState.api.values()) {
    lines.push(
      `service_api_last_occurrence_timestamp_seconds{service="${sanitizeLabel(entry.service)}",status="${sanitizeLabel(entry.status)}",platform="${sanitizeLabel(entry.platform ?? 'none')}",detail="${sanitizeLabel(entry.detail)}"} ${toSeconds(entry.lastOccurrence)}`
    );
  }

  lines.push('# HELP test_run_pass_total Total passed tests from last recorded run.');
  lines.push('# TYPE test_run_pass_total gauge');
  lines.push(`test_run_pass_total ${metricsState.tests.passed}`);

  lines.push('# HELP test_run_fail_total Total failed tests from last recorded run.');
  lines.push('# TYPE test_run_fail_total gauge');
  lines.push(`test_run_fail_total ${metricsState.tests.failed}`);

  lines.push('# HELP test_last_run_timestamp_seconds Timestamp of last recorded test run.');
  lines.push('# TYPE test_last_run_timestamp_seconds gauge');
  lines.push(`test_last_run_timestamp_seconds ${toSeconds(metricsState.tests.lastRun)}`);

  lines.push('# HELP layout_section_visible Layout visibility map per user and section.');
  lines.push('# TYPE layout_section_visible gauge');
  for (const [userId, data] of metricsState.layout.entries()) {
    const visibility = data.visibility || {};
    for (const [section, isVisible] of Object.entries(visibility)) {
      lines.push(
        `layout_section_visible{user_id="${sanitizeLabel(userId)}",section="${sanitizeLabel(section)}"} ${isVisible ? 1 : 0}`
      );
    }
  }

  lines.push('# HELP layout_show_button_icons Whether button icons are enabled per user.');
  lines.push('# TYPE layout_show_button_icons gauge');
  for (const [userId, data] of metricsState.layout.entries()) {
    lines.push(
      `layout_show_button_icons{user_id="${sanitizeLabel(userId)}"} ${data.showButtonIcons ? 1 : 0}`
    );
  }

  lines.push('# HELP layout_last_updated_timestamp_seconds Last layout update timestamp per user.');
  lines.push('# TYPE layout_last_updated_timestamp_seconds gauge');
  for (const [userId, data] of metricsState.layout.entries()) {
    lines.push(
      `layout_last_updated_timestamp_seconds{user_id="${sanitizeLabel(userId)}"} ${toSeconds(data.updatedAt)}`
    );
  }

  lines.push('# HELP profile_requests_total Total profile requests received.');
  lines.push('# TYPE profile_requests_total counter');
  lines.push(`profile_requests_total ${metricsState.activity.requestsTotal}`);

  lines.push('# HELP profile_views_total Total successful public profile renders.');
  lines.push('# TYPE profile_views_total counter');
  lines.push(`profile_views_total ${metricsState.activity.viewsTotal}`);

  lines.push('# HELP profile_last_request_timestamp_seconds Timestamp of the last profile request.');
  lines.push('# TYPE profile_last_request_timestamp_seconds gauge');
  lines.push(`profile_last_request_timestamp_seconds ${toSeconds(metricsState.activity.lastRequest)}`);

  lines.push('# HELP profile_views_by_user_total Successful profile views per user.');
  lines.push('# TYPE profile_views_by_user_total counter');
  for (const [userId, data] of metricsState.activity.byUser.entries()) {
    lines.push(
      `profile_views_by_user_total{user_id="${sanitizeLabel(userId)}",username="${sanitizeLabel(data.username ?? '')}"} ${data.views}`
    );
  }

  lines.push('# HELP profile_last_view_timestamp_seconds Timestamp for the last successful profile view per user.');
  lines.push('# TYPE profile_last_view_timestamp_seconds gauge');
  for (const [userId, data] of metricsState.activity.byUser.entries()) {
    lines.push(
      `profile_last_view_timestamp_seconds{user_id="${sanitizeLabel(userId)}"} ${toSeconds(data.lastView)}`
    );
  }

  return lines.join('\n') + '\n';
}

export default {
  recordScraperRun,
  recordScraperSnapshot,
  recordApiStatus,
  recordTestRun,
  recordLayoutState,
  recordProfileRequest,
  getMetricsSnapshot,
  resetMetrics,
  generatePrometheusMetrics,
};
