// api/server/[...path].js
const app = require('../../server');

module.exports = (req, res) => {
  const q = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  const segs = req.query.path || [];
  const sub = Array.isArray(segs) ? '/' + segs.join('/') : '/';
  req.url = sub + q;
  return app(req, res);
};