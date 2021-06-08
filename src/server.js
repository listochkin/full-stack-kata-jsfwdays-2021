import * as http from 'http';
import { networkInterfaces } from 'os';
import { readFile } from 'fs/promises';
import { exec } from 'child_process';

export function startServer(port) {
  console.log('Starting server on port ' + port);
  server.listen(port, () => {
    Object.entries(networkInterfaces()).forEach(([name, interfaces]) => {
      interfaces
        .filter(iRecord => iRecord.family === 'IPv4')
        .map(iRecord => console.log(`http://${iRecord.address}:${port}`));
    });
  });

  setTimeout(() => {
    exec(`curl 'http://localhost:2021/'`);
  }, 200);
}

const server = http.createServer(async (request, response) => {
  const html = await readFile(new URL('./index.html', import.meta.url));
  response.write(html);
  response.end();
});
