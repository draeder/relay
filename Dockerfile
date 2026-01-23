FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Expose GUN relay port
EXPOSE 8765

# Start the GUN relay
CMD ["node", "index.js"]
