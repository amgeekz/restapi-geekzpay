const app = require('../../../server');

module.exports = (req, res) => {
  req.url = '/webhook/summary' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
  return app(req, res);
};