const app = require('../../../server');

module.exports = (req, res) => {
  const rest = req.query.all || [];
  const segs = Array.isArray(rest) ? rest : [rest].filter(Boolean);

  const subPath = '/webhook/' + segs.join('/');
  const q = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  req.url = subPath + q;

  return app(req, res);
};