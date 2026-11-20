# Stage 1: install every package and compile the TypeScript to JavaScript.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Stage 2: the image that runs. Only production packages and the compiled code: no compiler, no tests.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The API runs as the unprivileged "node" user, so it must own the photo folder.
RUN mkdir uploads && chown node:node uploads
USER node
EXPOSE 3000
# node directly, not "npm start": one process that receives Docker's stop signal itself
# and shuts down cleanly (see server.ts).
CMD ["node", "dist/server.js"]
