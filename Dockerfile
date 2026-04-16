FROM node:20-alpine

WORKDIR /app

# Build frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copy backend source
COPY backend/ ./backend/

# Data directory for persistence
RUN mkdir -p /app/data

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "backend/src/index.js"]
