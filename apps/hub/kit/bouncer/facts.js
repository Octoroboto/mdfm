// Bouncer: turns an outgoing HTTP request into plain "facts" the policy can judge.
// Pure JavaScript (no Electron), so it is unit-tested on its own.
//
// facts = { scheme, method, host, path, search, fields: [form field names], form: {name: short value},
//           routeKey: "POST api.wistia.com /modern/folders/:id/subfolders" }

const MAX_VALUE = 200; // form values longer than this are cut (file contents are never kept)

// Path segments that look like ids become ":id" so "the same kind of request" can be counted.
function normalizePath(p) {
  return String(p || '/').split('/').map((seg) => {
    if (!seg) return seg;
    if (/^\d+$/.test(seg)) return ':id';
    if (/^[a-z0-9]{8,}$/i.test(seg) && /\d/.test(seg) && /[a-z]/i.test(seg)) return ':id';
    if (/^[0-9a-f-]{20,}$/i.test(seg)) return ':id';
    return seg;
  }).join('/');
}

const cut = (v) => { const s = String(v == null ? '' : v); return s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) : s; };

// Accepts a string, Buffer, Uint8Array, URLSearchParams or an array of Buffers (Electron uploadData).
function bodyText(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (Buffer.isBuffer(body)) return body.toString('latin1');
  if (body instanceof Uint8Array) return Buffer.from(body).toString('latin1');
  if (Array.isArray(body)) return body.map(bodyText).join('');
  return '';
}

// -> { fields: [...], form: {...}, kind }
function parseBody(body, contentType = '') {
  const text = bodyText(body);
  const out = { fields: [], form: {}, kind: 'none' };
  if (!text) return out;
  const ct = String(contentType || '').toLowerCase();
  const add = (k, v, isFile = false) => {
    if (!out.fields.includes(k)) out.fields.push(k);
    if (!isFile && !(k in out.form)) out.form[k] = cut(v);
  };
  const boundary = (ct.match(/boundary=([^;]+)/) || [])[1] || (text.match(/^--([^\r\n]+)\r?\n/) || [])[1];
  if (ct.includes('multipart/') || (boundary && /Content-Disposition: form-data/i.test(text))) {
    out.kind = 'multipart';
    const parts = text.split('--' + boundary);
    parts.forEach((part) => {
      const m = part.match(/Content-Disposition:\s*form-data;\s*name="([^"]*)"(;\s*filename="[^"]*")?/i);
      if (!m) return;
      const value = part.split(/\r?\n\r?\n/).slice(1).join('\n\n').replace(/\r?\n$/, '');
      add(m[1], value, !!m[2]);
    });
    return out;
  }
  const t = text.trim();
  if (ct.includes('json') || /^[{[]/.test(t)) {
    try {
      const j = JSON.parse(t);
      out.kind = 'json';
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        Object.entries(j).forEach(([k, v]) => add(k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
      }
      return out;
    } catch { /* fall through */ }
  }
  if (ct.includes('x-www-form-urlencoded') || /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(t)) {
    out.kind = 'form';
    new URLSearchParams(t).forEach((v, k) => add(k, v));
    return out;
  }
  out.kind = 'other';
  return out;
}

function byteLength(body) {
  if (body == null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return body.length;
  if (Array.isArray(body)) return body.reduce((n, b) => n + byteLength(b), 0);
  if (body instanceof URLSearchParams) return Buffer.byteLength(body.toString());
  return 0;
}

// req = { url, method, body?, contentType?, formFields? (names, when the body is a stream), bodyBytes? }
function requestFacts(req) {
  let u;
  try { u = new URL(req.url); } catch { return { ok: false, error: 'bad url', url: String(req.url) }; }
  const method = String(req.method || 'GET').toUpperCase();
  const scheme = u.protocol.replace(/:$/, '');
  const body = parseBody(req.body, req.contentType);
  if (Array.isArray(req.formFields)) req.formFields.forEach((k) => { if (!body.fields.includes(k)) body.fields.push(k); });
  if (req.formValues) Object.entries(req.formValues).forEach(([k, v]) => { if (!(k in body.form)) body.form[k] = cut(v); });
  // A path with a broken %-escape (e.g. "/50%off") can't be decoded: treat a network one as an
  // unreadable address (denied when enforcing) instead of throwing out of the request hook.
  let decodedPath;
  try { decodedPath = decodeURIComponent(u.pathname || '/'); } catch {
    if (NETWORK_SCHEMES.has(scheme)) return { ok: false, error: 'bad path encoding', url: String(req.url) };
    decodedPath = u.pathname || '/';
  }
  return {
    ok: true,
    scheme,
    method,
    host: u.hostname.toLowerCase(),
    path: decodedPath,
    search: u.search || '',
    fields: body.fields,
    form: body.form,
    bodyKind: body.kind,
    bodyBytes: Number.isFinite(req.bodyBytes) ? req.bodyBytes : byteLength(req.body),
    // GraphQL sends everything to one address, so its operation name is part of "the same kind of request".
    routeKey: `${method} ${u.hostname.toLowerCase()} ${normalizePath(u.pathname)}${/\/graphql$/.test(u.pathname) && body.form.operationName ? ' ' + body.form.operationName : ''}`,
  };
}

// Schemes Bouncer judges. Others (file:, data:, blob:, devtools:, about:) never reach the network.
const NETWORK_SCHEMES = new Set(['http', 'https', 'ws', 'wss']);

module.exports = { requestFacts, parseBody, normalizePath, NETWORK_SCHEMES };
