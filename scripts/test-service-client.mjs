import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1];
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1];

console.log('URL:', url);
console.log('Service key starts with:', serviceKey?.substring(0, 20) + '...');
console.log('Anon key starts with:', anonKey?.substring(0, 20) + '...');

// Test with service client
const serviceClient = createClient(url, serviceKey);
const { count: serviceCount, error: serviceError } = await serviceClient
  .from('influencers')
  .select('*', { count: 'exact', head: true });

console.log('\n[Service Client]');
console.log('  count:', serviceCount);
console.log('  error:', serviceError);
console.log('  hasDbData:', (serviceCount || 0) > 100);

// Test with anon client
const anonClient = createClient(url, anonKey);
const { count: anonCount, error: anonError } = await anonClient
  .from('influencers')
  .select('*', { count: 'exact', head: true });

console.log('\n[Anon Client]');
console.log('  count:', anonCount);
console.log('  error:', anonError);
console.log('  hasDbData:', (anonCount || 0) > 100);
