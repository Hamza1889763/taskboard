# ---------- TaskBoard web image ----------
# Small official base image (Alpine Linux + Node.js 20 LTS)
FROM node:20-alpine

# Metadata (good practice)
LABEL maintainer="fa23-bse-060@cuilahore.edu.pk" \
      project="CSC418 DevOps Lab Mid" \
      app="taskboard-web"

# Run in production mode
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# 1) Copy only package files first -> Docker caches the npm install layer.
#    Code changes won't force dependencies to reinstall.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# 2) Copy the application source (files in .dockerignore are skipped)
COPY . .

# Security: do not run as root. The node image ships a "node" user.
RUN chown -R node:node /app
USER node

# Document which port the app listens on
EXPOSE 3000

# Docker marks the container healthy/unhealthy using our /health endpoint
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the app (exec form so Node receives stop signals correctly)
CMD ["node", "server.js"]
