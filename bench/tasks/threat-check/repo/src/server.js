import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sessions, invoices, users } from './store.js';

const RECEIPTS_DIR = path.resolve('receipts');

function currentUser(req) {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  return sessions.get(token);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function login(email, password) {
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) return null;
  const token = Math.random().toString(36).slice(2);
  sessions.set(token, user);
  return token;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login required' });

  // GET /invoices/:id
  const invoiceMatch = url.pathname.match(/^\/invoices\/(\d+)$/);
  if (req.method === 'GET' && invoiceMatch) {
    const invoice = invoices.get(Number(invoiceMatch[1]));
    if (!invoice) return json(res, 404, { error: 'not found' });
    return json(res, 200, invoice);
  }

  // GET /receipts?file=2024-03.pdf
  if (req.method === 'GET' && url.pathname === '/receipts') {
    const file = url.searchParams.get('file') ?? '';
    const data = await readFile(path.join(RECEIPTS_DIR, user.id, file));
    res.writeHead(200, { 'content-type': 'application/pdf' });
    return res.end(data);
  }

  // POST /avatar  { "url": "https://..." } — fetch and store the user's avatar
  if (req.method === 'POST' && url.pathname === '/avatar') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { url: avatarUrl } = JSON.parse(body);
    const response = await fetch(avatarUrl);
    user.avatar = Buffer.from(await response.arrayBuffer()).toString('base64');
    return json(res, 200, { ok: true, bytes: user.avatar.length });
  }

  json(res, 404, { error: 'not found' });
});

server.listen(8080);
