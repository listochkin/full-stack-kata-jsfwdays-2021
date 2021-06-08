import * as http from 'http';
import { networkInterfaces } from 'os';

export function startServer(port) {
  console.log('Starting server on port ' + port);
  server.listen(port, () => {
    Object.entries(networkInterfaces()).forEach(([name, interfaces]) => {
      interfaces
        .filter(iRecord => iRecord.family === 'IPv4')
        .map(iRecord => console.log(`http://${iRecord.address}:${port}`));
    });
  });
}

const server = http.createServer((request, response) => {
  response.write('Hello from server');
  response.end();
});
