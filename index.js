const express = require('express');
const request = require('request-promise-native');
const crypto = require('crypto');
const uniq = require('lodash/uniq');

const PORT = process.env.GOOGLEDOCIMAGES_PORT || 8000;

const app = express();

let simpleCache = {};
const hash = crypto.createHash('sha256');

const MINUTES = 60 * 1000;

function cleanCache() {
  Object.keys(simpleCache).forEach(key => {
    const entry = simpleCache[key];
    if (Date.now() - entry.timestamp > 5 * MINUTES) {
      delete simpleCache[key];
    }
  });
}

app.use(require('express-status-monitor')());

app.get('/', (res, req) => {
  const documentUrl = res.query.url;
  const urlHash = crypto
    .createHash('sha256')
    .update(documentUrl)
    .digest('hex');

  if (simpleCache[urlHash]) {
    req.send(simpleCache[urlHash].content);

    cleanCache();
  } else {
    request(documentUrl)
      .then(res => {
        const processedDocument = processDocument(documentUrl, res);
        req.send(processedDocument);

        simpleCache[urlHash] = {
          timestamp: Date.now(),
          content: processDocument
        };
      })
      .catch(reason => {
        req.status(reason.statusCode).send(reason.message);
      });
  }
});

function processDocument(documentUrl, body) {
  // Process static relative links
  const staticLinkRe = /(?:href|src)='(.*?)'/g;
  let staticLinkMatch;
  while ((staticLinkMatch = staticLinkRe.exec(body)) !== null) {
    body = body.replace(
      staticLinkMatch[1],
      'https://docs.google.com' + staticLinkMatch[1]
    );
  }

  // Process image links
  const imageLinkRe = /\(\/\/images-docs-opensocial\.googleusercontent\.com\/gadgets\/proxy\?url=(.*?)&(.*?)\)/;
  let imageLinkMatch;
  while ((imageLinkMatch = imageLinkRe.exec(body)) !== null) {
    const source = imageLinkMatch[0];
    const conversionResult = convertImageLink(
      source,
      imageLinkMatch[1],
      imageLinkMatch[2]
    );
    body = body.replace(source, conversionResult);
  }

  // Add a signature

  body = body.replace(
    /(Published by (?:[\s\S]+?))<\/span>/,
    '$1 fixed by SonOfMaw </span>'
  );

  return body;
}

function convertImageLink(source, imageUrl, params) {
  let imageWidth = /resize_w=([0-9]+)/.exec(params);
  let imageHeight = /resize_h=([0-9]+)/.exec(params);

  let imageWidthParam = imageWidth && '&width=' + imageWidth[1];
  let imageHeightParam = imageHeight && '&height=' + imageHeight[1];

  return (
    '(//resize.sonofmaw.co.uk/?url=' +
    imageUrl +
    (imageWidthParam || '') +
    (imageHeightParam || '') +
    ')'
  );
}

app.listen(PORT, () => console.log('Listening on port', PORT));
