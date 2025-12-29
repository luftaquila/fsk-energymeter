FROM node:22-alpine

WORKDIR /home/node/fsk-energymeter
COPY viewer/package*.json viewer/

RUN npm --prefix viewer ci
COPY viewer/ viewer/
RUN npm --prefix viewer run build

# Install serve globally for static file serving
RUN npm install -g serve

EXPOSE 9400
CMD [ "serve", "-s", "viewer/dist", "-l", "9400" ]

