// api/server/qris/dynamic.js
const app = require('../../../server');
module.exports = (req, res) => {
  req.url = '/qris/dynamic' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
  return app(req, res);
};