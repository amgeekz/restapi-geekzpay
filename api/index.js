const app = require('../server');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://x');
  const u = url.searchParams.get('u') || '/';
  url.searchParams.delete('u');
  const rest = url.searchParams.toString();
  req.url = u + (rest ? `?${rest}` : '');
  return app(req, res);
};

module.exports.config = { runtime: 'nodejs20.x' };