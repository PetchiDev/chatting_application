import pg from 'pg';

const regions = [
  'ap-south-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-northeast-2',
  'us-east-1', 'us-west-1', 'eu-west-1', 'eu-central-1', 'sa-east-1',
];

const password = encodeURIComponent('ChatApplication@123');
const ref = 'nzxtkvrkbnbcxsniwnvx';

for (const region of regions) {
  for (const port of [5432, 6543]) {
    const cs = `postgresql://postgres.${ref}:${password}@aws-0-${region}.pooler.supabase.com:${port}/postgres`;
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

// reference query param format
for (const region of ['ap-south-1', 'us-east-1', 'eu-west-1']) {
  for (const port of [5432, 6543]) {
    const cs = `postgresql://postgres:${password}@aws-0-${region}.pooler.supabase.com:${port}/postgres?options=reference%3D${ref}`;
    const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      console.log(`OK: reference param aws-0-${region}:${port}`);
      await client.end();
      process.exit(0);
    } catch (e) {
      console.log(`FAIL: ref ${region}:${port} -> ${e.message}`);
    } finally {
      try { await client.end(); } catch {}
    }
  }
}

// IPv6 literal direct
const direct = new pg.Client({
  host: '2406:da1c:4c7:f802:e8bf:7876:6ec5:8ac0',
  port: 5432,
  user: 'postgres',
  password: 'ChatApplication@123',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
try {
  await direct.connect();
  console.log('OK: direct IPv6 literal');
  process.exit(0);
} catch (e) {
  console.log('FAIL: IPv6 literal ->', e.message);
}

process.exit(1);
