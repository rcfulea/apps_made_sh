# Build stage - build the React frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source files
COPY . .

# Build the frontend
RUN npm run build

# Production stage - Node.js server
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy server and built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.cjs ./
COPY --from=builder /app/public/images ./public/images

# Create data and uploads directories
RUN mkdir -p data public/uploads

# Copy initial data (if exists)
COPY --from=builder /app/data ./data

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.cjs"]
