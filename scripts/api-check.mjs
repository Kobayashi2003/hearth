/**
 * Manual API exercise script. Logs in, then runs whatever sequence is passed on
 * the command line as a named scenario. Development helper only — the automated
 * coverage lives in test/.
 */
const BASE = process.env.HEARTH_API ?? 'http://127.0.0.1:5311/api';

let cookie = '';

export async function login(username = 'admin', password = 'hearth') {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);
  cookie = response.headers.getSetCookie()[0].split(';')[0];
}

export async function call(method, url, body, extraHeaders = {}) {
  const headers = { cookie, ...extraHeaders };
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 200);
  }
  return { status: response.status, body: parsed };
}

export async function upload(url, files) {
  const form = new FormData();
  for (const [relativePath, content] of Object.entries(files)) {
    // The field name carries the destination-relative path — see /upload.
    form.append(relativePath, new Blob([content]), relativePath.split('/').pop());
  }
  const response = await fetch(BASE + url, { method: 'POST', headers: { cookie }, body: form });
  return { status: response.status, body: await response.json().catch(() => null) };
}

export function report(label, result) {
  const status = result.status.toString().padEnd(3);
  console.log(`${label.padEnd(22)} ${status} ${JSON.stringify(result.body).slice(0, 160)}`);
}

export { BASE };
