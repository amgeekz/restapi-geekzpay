const app = require('../../server');

module.exports = (req, res) => {
  const segs = req.query.path || [];
  const sub = Array.isArray(segs) ? '/' + segs.join('/') : '/';
  const q = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  req.url = sub + q;

  return app(req, res);
};