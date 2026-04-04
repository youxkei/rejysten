const { onRequest } = require("firebase-functions/v2/https");
const { ogpHandler } = require("./ogpHandler");

exports.ogp = onRequest({ region: "asia-northeast1", invoker: "public" }, ogpHandler);
