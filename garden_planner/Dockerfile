# Multi‑stage Dockerfile for the self‑hosted garden planner
FROM node:20-alpine AS base

# Create application directory
WORKDIR /app

# Copy package metadata (not strictly needed but kept for completeness)
COPY package.json .

# Copy source files
COPY server.js ./
COPY data ./data
COPY public ./public

# No npm install required because we use no external dependencies.

# Expose the application port
EXPOSE 3000

# Default command to run the server
CMD ["node", "server.js"]