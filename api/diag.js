// api/server/diag.js  (CommonJS)
const app = require('../../server');
module.exports = (req, res) => {
  // paksa path ke /diag agar router Express kamu kena
  req.url = '/diag' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
  return app(req, res);
};