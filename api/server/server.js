// api/server/[...path].js  (CommonJS)
const app = require('../../server');

module.exports = (req, res) => {
  // Contoh req.url: "/api/server/diag?x=1"
  const original = req.url || '/';
  const marker = '/api/server';
  const i = original.indexOf(marker);

  // suffix yang harus diteruskan ke Express ("/diag?x=1" atau "/" kalau kosong)
  const suffix = i >= 0 ? original.slice(i + marker.length) : original;
  req.url = suffix && suffix !== '' ? suffix : '/';

  // Pastikan method & body tetap apa adanya; Express akan handle
  return app(req, res);
};