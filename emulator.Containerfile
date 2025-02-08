ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION}

ENV JAVA_TOOL_OPTIONS -Xmx4g
ENV GCLOUD_PROJECT_ID demo

WORKDIR /firebase

RUN apk add --no-cache openjdk11-jre gettext && npm install -g firebase-tools

RUN firebase setup:emulators:ui && firebase setup:emulators:firestore

RUN echo '{"projects": {"default": "demo"}}' > /firebase/.firebaserc

ADD ./firestore.local.rules /firebase/firebase.local.rules
RUN echo '{"firestore": {"rules": "firebase.local.rules"}}' > /firebase/firebase.json

CMD firebase emulators:start --only firestore
