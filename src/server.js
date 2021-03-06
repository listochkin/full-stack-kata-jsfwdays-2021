import * as http from 'http';
import { networkInterfaces } from 'os';
import { readFile, access, stat, opendir, rename } from 'fs/promises';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { join as pathJoin } from 'path';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import formidable from 'formidable';

const SESSIONS = new Map();

const root = process.cwd();
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
    exec(`curl 'http://localhost:2021/src'`);
  }, 200);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/login') {
    await performLogin(request, response);
  } else if (request.method === 'GET') {
    await serveContent(request, response);
  } else if (request.method === 'POST' && request.url === '/upload') {
    await performFileUpload(request, response);
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

    redirectBack(request, response);
  } else {
    response.statusCode = 401;
    response.end();
  }
}

async function serveContent(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const path = url.pathname;
  const absolutePath = pathJoin(root, path);
  const { relativePath } = /\/(?<relativePath>.*)/.exec(path).groups;

  try {
    await access(absolutePath);
  } catch (error) {
    response.statusCode = 404;
    response.end();
    return;
  }

  const isDownload = !!url.searchParams.get('download');

  let isDirectory;
  try {
    isDirectory = (await stat(absolutePath)).isDirectory();
  } catch (error) {}

  if (isDownload && !isDirectory) {
    await pipeline(createReadStream(absolutePath), response);
    return;
  }

  const html = await readFile(new URL('./index.html', import.meta.url), {
    encoding: 'utf8',
  });

  const { header, footer } =
    /(?<header>[\s\S]+)CONTENT(?<footer>[\s\S]+)/m.exec(html).groups;

  const cspNonce = randomUUID();
  response.setHeader(
    'Content-Security-Policy',
    `script-src 'nonce-${cspNonce}'`
  );
  response.write(header.replace('NONCE', cspNonce));

  if (isDirectory) {
    await pipeline(
      listing(absolutePath, relativePath),
      async function* (stream) {
        for await (const chunk of stream) yield chunk;
        yield footer;
      },
      response
    );
  } else {
    await pipeline(
      createReadStream(absolutePath),
      async function* (stream) {
        yield '<pre>';
        for await (const chunk of stream) yield chunk;
        yield '</pre>';
        yield footer;
      },
      response
    );
  }
}

async function* listing(absolutePath, relativePath) {
  const directories = [];
  const files = [];
  const rootInfo = await opendir(absolutePath);
  for await (const dirInfo of rootInfo) {
    if (dirInfo.isDirectory()) {
      directories.push(dirInfo.name);
    } else {
      files.push(dirInfo.name);
    }
  }

  directories.sort();
  yield '<ul>';
  for (const name of directories)
    yield `
      <li>
        <a href="${relativePath}/${name}">${name}</a>
      </li>
    `;

  files.sort();
  for (const name of files)
    yield `
      <li>
        <a href="${relativePath}/${name}">${name}</a>
        <a href="${relativePath}/${name}?download=1" download>??????</a>
      </li>
    `;
  yield '</ul>';
}

async function performFileUpload(request, response) {
  if (!isLoggedIn(request)) {
    response.statusCode = 401;
    response.end();
    return;
  }

  const formParser = new formidable.IncomingForm();

  const {
    files: { uploadFile },
  } = await new Promise((resolve, reject) => {
    formParser.parse(request, (error, fields, files) => {
      if (error) reject(error);
      else resolve({ fields, files });
    });
  });

  let newPath = pathJoin(
    root,
    new URL(request.headers.referer).pathname,
    uploadFile.name
  );
  try {
    await access(newPath);
    newPath += '.' + randomUUID();
  } catch (error) {}

  await rename(uploadFile.path, newPath);

  redirectBack(request, response);
}

function redirectBack(request, response) {
  response.statusCode = 302;
  response.setHeader('Location', `${request.headers.referer}`);
  response.end();
}

function isLoggedIn(request) {
  const sessionId = (request.headers.cookie || '')
    .split(';')
    .map(cookie => new URLSearchParams(cookie))
    .filter(usp => usp.has('session'))
    .map(usp => usp.get('session'))
    .find(s => s.length === 36);
  return SESSIONS.has(sessionId) && SESSIONS.get(sessionId) > new Date();
}
