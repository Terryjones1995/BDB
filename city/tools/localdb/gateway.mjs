// node gateway.mjs      (PORT=54331, POSTGREST_PORT=54330)
// Stands in for Supabase's gateway in front of the local PostgREST: /rest/v1/* → PostgREST, with CORS.
// /nosetup/rest/v1/* answers the way a Supabase project does when the city SQL has never been run.
import http from 'http';
const TARGET = { host: '127.0.0.1', port: +(process.env.POSTGREST_PORT || 54330) };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, prefer', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (req.url.startsWith('/nosetup/rest/v1/rpc/')) {
    const fn = req.url.split('/').pop();
    res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${fn} in the schema cache` }));
    return;
  }
  if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404, cors); res.end(); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const headers = { ...req.headers, host: `${TARGET.host}:${TARGET.port}`, 'content-length': String(body.length) };
    const up = http.request({ ...TARGET, method: req.method, path: req.url.slice('/rest/v1'.length), headers }, (r) => {
      const h = {};
      for (const [k, v] of Object.entries(r.headers)) if (!k.toLowerCase().startsWith('access-control-')) h[k] = v;   // PostgREST sends its own; one set only
      Object.assign(h, cors);
      res.writeHead(r.statusCode, h);
      r.pipe(res);
    });
    up.on('error', () => { res.writeHead(502, cors); res.end(); });
    up.end(body);
  });
}).listen(+(process.env.PORT || 54331), '127.0.0.1');
