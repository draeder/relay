#!/bin/bash

# Test script for the nostr relay using websocat
# Install websocat: cargo install websocat

echo "Testing Nostr relay (strfry)..."
echo "Connecting to ws://localhost:7777"
echo ""

# Test if websocat is installed
if ! command -v websocat &> /dev/null; then
    echo "Error: websocat is not installed"
    echo "Install it with: cargo install websocat"
    echo "Or use: npm install -g wscat"
    exit 1
fi

# Send a REQ message to get recent events
echo "Sending REQ message to fetch recent events..."
echo '["REQ","test-subscription",{"kinds":[1],"limit":10}]' | websocat -n1 ws://localhost:7777

echo ""
echo "Test complete!"
echo ""
echo "To test interactively, run:"
echo "  websocat ws://localhost:7777"
echo ""
echo "Then send commands like:"
echo '  ["REQ","mysub",{"kinds":[1],"limit":5}]'
echo '  ["CLOSE","mysub"]'
