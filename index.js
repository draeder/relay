const express = require('express');
const Gun = require('gun');

const PORT = process.env.PORT || 8765;
const app = express();

// Serve static files if needed
app.use(express.static('public'));

// Initialize Gun with the Express server
const server = app.listen(PORT, () => {
  console.log(`GUN relay server running on port ${PORT}`);
  console.log(`Access the relay at: http://localhost:${PORT}/gun`);
});

// Initialize Gun with the Express server
const gun = Gun({ web: server });

console.log('Combined relay started:');
console.log('- GUN relay is running on this process');
console.log('- Nostr relay (strfry) should be run separately via Docker or direct installation');
console.log('  See docker-compose.yml for Docker setup');
