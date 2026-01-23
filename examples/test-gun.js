// Example: Testing the GUN relay
const Gun = require('gun');

console.log('Testing GUN relay connection...');

// Connect to the relay
const gun = Gun(['http://localhost:8765/gun']);

// Test 1: Write and read data
console.log('\nTest 1: Write and read data');
gun.get('test-data').put({ 
  message: 'Hello from GUN relay!', 
  timestamp: Date.now(),
  test: true 
});

gun.get('test-data').on((data) => {
  console.log('✓ Data received:', data);
});

// Test 2: User authentication (using GUN's SEA)
setTimeout(() => {
  console.log('\nTest 2: Create a test entry');
  gun.get('users').get('testuser').put({ 
    name: 'Test User',
    created: new Date().toISOString()
  });
  
  gun.get('users').get('testuser').on((data) => {
    console.log('✓ User data:', data);
  });
}, 1000);

// Test 3: Lists/Arrays
setTimeout(() => {
  console.log('\nTest 3: Working with lists');
  const messages = gun.get('messages');
  
  messages.set({ 
    text: 'First message', 
    time: Date.now() 
  });
  
  messages.set({ 
    text: 'Second message', 
    time: Date.now() 
  });
  
  messages.map().on((msg, id) => {
    console.log('✓ Message:', msg);
  });
}, 2000);

console.log('\nTests running... (will output results above)');
console.log('Press Ctrl+C to exit\n');
