const { createServer } = require('./server');

createServer({ port: process.env.PORT || 8765 });
