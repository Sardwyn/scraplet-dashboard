export default async function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return res.redirect('/auth/login');
  }

  // Optionally revalidate user exists
  try {
    const { query } = await import('../db.js');
    const { rows } = await query('SELECT id FROM users WHERE id=$1 LIMIT 1', [
      req.session.user.id,
    ]);
    if (!rows.length) {
      req.session.destroy(() => {});
      return res.redirect('/auth/login');
    }
  } catch (err) {
    console.error('[requireAuth] DB check failed:', err);
  }

  next();
}
