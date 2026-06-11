import pg from 'pg';

const password = process.env.DB_PASSWORD;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!password || !ref) {
  console.error('Set DB_PASSWORD and SUPABASE_PROJECT_REF before running.');
  process.exit(1);
}

const encoded = encodeURIComponent(password);

const regions = [
  'ap-south-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-northeast-2',
  'us-east-1', 'us-west-1', 'eu-west-1', 'eu-central-1', 'sa-east-1',
];

for (const region of regions) {
  for (const port of [5432, 6543]) {
    const cs = `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:${port}/postgres`;
    const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const r = await client.query('SELECT 1 as ok');
      console.log(`OK: aws-0-${region}.pooler.supabase.com:${port}`, r.rows[0]);
      await client.end();
      process.exit(0);
    } catch (e) {
      console.log(`FAIL: ${region}:${port} -> ${e.message}`);
    } finally {
      try { await client.end(); } catch {}
    }
  }
}

process.exit(1);
