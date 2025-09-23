// api/server/[...path].js  (CommonJS)
const app = require('../../server');

module.exports = (req, res) => {
  // Ambil segmen path setelah /api/server/
  const segs = req.query.path || [];
  // Bentuk kembali URL agar Express lihat /diag, /qris/dynamic, dst
  const sub = Array.isArray(segs) ? '/' + segs.join('/') : '/';
  // Pertahankan query string (kalau ada)
  const q = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  req.url = sub + q;

  return app(req, res);
};
