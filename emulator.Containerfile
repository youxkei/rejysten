ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION}

WORKDIR /firebase

RUN apk add --no-cache openjdk25-jre gettext && npm install -g firebase-tools

RUN firebase setup:emulators:ui && firebase setup:emulators:firestore

RUN echo '{"projects": {"default": "demo"}}' > /firebase/.firebaserc

ENV JAVA_TOOL_OPTIONS "-Xms2g -Xmx4g -XX:+UseZGC"
ENV GCLOUD_PROJECT_ID demo

CMD firebase emulators:start --only firestore
