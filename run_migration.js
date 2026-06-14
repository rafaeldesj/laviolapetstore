import postgres from 'postgres';

const regions = [
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1'
];

const password = 'petstorelaviola0605R@fa';
const projectRef = 'zxmjxxpyvwxhsycyxeyp';

async function tryRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const url = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:6543/postgres?sslmode=require`;
  
  try {
    const sql = postgres(url, { connect_timeout: 3 });
    await sql`SELECT 1`;
    console.log(`\n[SUCCESS] Connected to region: ${region} (${host})`);
    
    console.log('Running migration...');
    await sql`ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS support_decision TEXT;`;
    console.log('Added support_decision column.');
    
    await sql`ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS driver_returned BOOLEAN DEFAULT FALSE;`;
    console.log('Added driver_returned column.');

    await sql`ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;`;
    console.log('Dropped deliveries_status_check constraint if existed.');

    await sql`ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_status_check CHECK (status IN ('agendada', 'a-caminho', 'concluida', 'cancelada'));`;
    console.log('Added new deliveries_status_check constraint to include "cancelada".');
    
    await sql.end();
    return true;
  } catch (err) {
    const msg = err.message || '';
    if (!msg.includes('tenant/user') && !msg.includes('ENOTFOUND')) {
      console.log(`Region ${region}: database auth error (host found but login failed: ${msg})`);
    }
    return false;
  }
}

async function run() {
  console.log('Searching for the correct Supabase region pooler...');
  for (const region of regions) {
    const success = await tryRegion(region);
    if (success) {
      console.log('Migration completed successfully!');
      process.exit(0);
    }
  }
  console.error('\n[ERROR] All regions failed. The project might not be hosted on aws-0 or the region is different.');
  process.exit(1);
}

run();
