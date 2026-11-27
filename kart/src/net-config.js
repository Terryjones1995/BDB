// BDB Supabase realtime server used for online races. The key is the PUBLIC anon key, already shipped in
// brawl/config.js. It can join / broadcast / track presence on any public realtime topic (every room of every
// BDB game) and reach PostgREST / Storage as the anon role, limited by the bdb-games RLS policies.
export const SUPABASE_URL = 'https://api.bigdickb.ca';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.GTURBzGaGuPyrAVNhth_4cG9ZTkRJRNy_hGHL5HAonY';
