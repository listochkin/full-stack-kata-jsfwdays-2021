import { startServer } from './server.js';

const port = process.env.PORT || 2021;
const password = process.env.PASSWORD || 'letmeupload';

startServer(port, password);
