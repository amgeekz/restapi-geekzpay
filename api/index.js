// api/index.js
const app = require('../server');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://x');
  const u = url.searchParams.get('u') || '/';
  url.searchParams.delete('u');
  const restQuery = url.searchParams.toString();
  req.url = u + (restQuery ? `?${restQuery}` : '');
  return app(req, res);
};