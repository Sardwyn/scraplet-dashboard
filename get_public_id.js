import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform'
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT public_id, slug FROM public.overlays WHERE id = 2');
  console.log("PUBLIC_ID_RESULT:", res.rows[0]);
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
