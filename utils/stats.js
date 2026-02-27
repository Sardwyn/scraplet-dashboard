function calculateMarketability(stats = []) {
  if (!Array.isArray(stats) || stats.length === 0) return 'N/A';

  const totalFollowers = stats.reduce((sum, s) => sum + (s.followers || 0), 0);
  const totalCCV = stats.reduce((sum, s) => sum + (s.ccv || 0), 0);

  const freshCount = stats.filter(s => {
    const updated = new Date(s.last_updated);
    return Date.now() - updated.getTime() < 86400000; // within 24 hours
  }).length;

  // Optional: factor freshness into grade
  if (totalFollowers > 10000 && totalCCV > 100 && freshCount > 0) return 'A';
  if (totalFollowers > 5000) return 'B+';
  return 'C';
}

export { calculateMarketability };
