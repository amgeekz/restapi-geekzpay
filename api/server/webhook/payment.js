// api/server/webhook/payment.js
const app = require('../../../server');
module.exports = (req, res) => {
  req.url = '/webhook/payment' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
  return app(req, res);
};