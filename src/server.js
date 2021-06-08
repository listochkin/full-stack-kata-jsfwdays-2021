import * as http from 'http';
import { networkInterfaces } from 'os';
import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';

const SESSIONS = new Map();

let uploadPassword;

export function startServer(port, password) {
  console.log('Starting server on port ' + port);
  server.listen(port, () => {
    Object.entries(networkInterfaces()).forEach(([name, interfaces]) => {
      interfaces
        .filter(iRecord => iRecord.family === 'IPv4')
        .map(iRecord => console.log(`http://${iRecord.address}:${port}`));
    });
    uploadPassword = password;
  });

  setTimeout(() => {
    exec(`curl 'http://localhost:2021/'`);
  }, 200);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/login') {
    await performLogin(request, response);
  } else if (request.method === 'GET') {
    await serveContent(request, response);
  } else {
    response.statusCode = 400;
    response.end();
  }
});

async function performLogin(request, response) {
  let body = '';
  for await (const chunk of request) body += chunk;
  const formData = new URLSearchParams(body);
  const userPassword = formData.get('password');
  if (userPassword === uploadPassword) {
    // TODO save session
    const sessionId = randomUUID();
    const sessionExpiryDate = new Date(Date.now() + 5 * 60 * 1000);
    SESSIONS.set(sessionId, sessionExpiryDate);
    response.setHeader(
      'Set-Cookie',
      [
        `session=${sessionId}`,
        `Expires=${sessionExpiryDate.toISOString()}`,
        'HttpOnly',
      ].join(';')
    );

    response.statusCode = 302;
    response.setHeader('Location', `${request.headers.referer}`);
    response.end();
  } else {
    response.statusCode = 401;
    response.end();
  }
}

async function serveContent(request, response) {
  const html = await readFile(new URL('./index.html', import.meta.url), {
    encoding: 'utf8',
  });
  const cspNonce = randomUUID();
  response.setHeader(
    'Content-Security-Policy',
    `script-src 'nonce-${cspNonce}'`
  );
  response.write(html.replace('NONCE', cspNonce));
  response.end();
}
