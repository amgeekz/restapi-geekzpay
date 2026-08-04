/**
 * GeekzPay API Docs - Main JavaScript
 * Elegant & Professional Version with Dark Mode
 */

// ============================================
// HIGHLIGHT.JS INIT
// ============================================
hljs.highlightAll();

// ============================================
// THEME
// ============================================
let currentTheme = localStorage.getItem('geekzpay_theme') || 'light';

function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('geekzpay_theme', theme);
    
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.querySelector('.theme-icon').textContent = '☀️';
        document.querySelector('meta[name="theme-color"]').content = '#0f1420';
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelector('.theme-icon').textContent = '🌙';
        document.querySelector('meta[name="theme-color"]').content = '#f0f4f8';
    }
}

function toggleTheme() {
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
}
window.toggleTheme = toggleTheme;

// ============================================
// PAGE NAVIGATION
// ============================================
function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId + '-page');
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.tab, .nav-link').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.page === pageId) el.classList.add('active');
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.showPage = showPage;

// ============================================
// TAB NAVIGATION
// ============================================
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        showPage(this.dataset.page);
        closeDrawer();
    });
});

// ============================================
// MOBILE DRAWER
// ============================================
const drawer = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');

function openDrawer() {
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeDrawer() {
    drawer.classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('openMenu').addEventListener('click', openDrawer);
document.getElementById('closeMenu').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

document.querySelectorAll('.drawer-nav .nav-link, .drawer-nav a[data-close]').forEach(el => {
    el.addEventListener('click', closeDrawer);
});

// ============================================
// BACK TO TOP
// ============================================
const toTop = document.getElementById('toTop');

window.addEventListener('scroll', () => {
    toTop.classList.toggle('visible', window.scrollY > 400);
});

toTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ============================================
// BASE URL
// ============================================
const baseInput = document.getElementById('baseUrl');

function getBase() {
    return window.location.origin.replace(/\/$/, '');
}

if (baseInput) {
    baseInput.value = getBase();
}

// ============================================
// TOAST
// ============================================
function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// UTILITY: SHOW JSON
// ============================================
function showJSON(el, text) {
    try {
        el.textContent = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        el.textContent = text;
    }
    hljs.highlightElement(el);
}

// ============================================
// HISTORY FEATURE
// ============================================
const btnFetchHistory = document.getElementById('btnFetchHistory');
if (btnFetchHistory) {
    btnFetchHistory.onclick = async () => {
        const token = document.getElementById('historyToken').value.trim();
        const limit = document.getElementById('historyLimit').value.trim() || '10';
        const desktopContainer = document.getElementById('desktopHistoryContainer');
        const desktopBody = document.getElementById('desktopHistoryBody');
        const mobileContainer = document.getElementById('mobileHistoryContainer');

        if (!token) {
            showToast('Masukkan token terlebih dahulu!');
            return;
        }

        btnFetchHistory.disabled = true;
        btnFetchHistory.textContent = 'Mencari Data...';

        const url = `${getBase()}/webhook/status?token=${encodeURIComponent(token)}&limit=${limit}`;

        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP Error: ${r.status}`);
            const resData = await r.json();

            desktopContainer.classList.remove('opacity-40');

            let tRows = '';
            let mCards = '';

            if (!resData.data || resData.data.length === 0) {
                const empty = `<div class="empty-card">Belum ada data pembayaran masuk untuk token ini.</div>`;
                tRows = `<tr><td colspan="5" class="empty">Belum ada data pembayaran masuk untuk token ini.</td></tr>`;
                mCards = empty;
            } else {
                resData.data.forEach(ev => {
                    const dateStr = new Date(ev.received_at).toLocaleString('id-ID');
                    const msgStr = ev.body && ev.body.message ? ev.body.message : 
                                  (ev.body && ev.body.text ? ev.body.text : JSON.stringify(ev.body || {}));
                    const rupiahStr = Number(ev.amount).toLocaleString('id-ID');

                    tRows += `
                        <tr>
                            <td>${ev.event_id || 'unknown'}</td>
                            <td>${dateStr}</td>
                            <td><strong style="color:var(--success);">Rp ${rupiahStr}</strong></td>
                            <td>${msgStr}</td>
                            <td>${ev.ip || '0.0.0.0'}</td>
                        </tr>`;

                    mCards += `
                        <div class="card" style="margin-bottom:8px;padding:12px;">
                            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);">
                                <span>${ev.event_id || 'unknown'}</span>
                                <span>${dateStr}</span>
                            </div>
                            <div style="font-size:15px;font-weight:700;color:var(--success);">Rp ${rupiahStr}</div>
                            <div style="font-size:11px;color:var(--text-secondary);word-break:break-word;">${msgStr}</div>
                            <div style="font-size:9px;color:var(--text-muted);text-align:right;margin-top:4px;">IP: ${ev.ip || '0.0.0.0'}</div>
                        </div>`;
                });
            }

            desktopBody.innerHTML = tRows;
            mobileContainer.innerHTML = mCards;

        } catch (err) {
            showToast(`Gagal mengambil data: ${err.message}`);
            const errBlock = `<div class="empty-card" style="color:var(--danger);">Gagal tersambung ke server: ${err.message}</div>`;
            desktopBody.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--danger);">${err.message}</td></tr>`;
            mobileContainer.innerHTML = errBlock;
        } finally {
            btnFetchHistory.disabled = false;
            btnFetchHistory.textContent = '🔍 Cari & Refresh Data';
        }
    };
}

// ============================================
// QRIS DYNAMIC
// ============================================
const btnDynamic = document.getElementById('btnDynamic');
const btnDynamicReset = document.getElementById('btnDynamicReset');
const outDynamic = document.getElementById('outDynamic');
const jsonDynamic = document.getElementById('jsonDynamic');
const metaDynamic = document.getElementById('metaDynamic');
const imgQR = document.getElementById('imgQR');

if (btnDynamic) {
    btnDynamic.onclick = async () => {
        const base = document.getElementById('tiBase').value;
        const uniqIn = document.getElementById('tiUnique').value;
        const auto = document.getElementById('tiAutoUnique').checked;
        const amount = document.getElementById('tiAmount').value;
        const payloadStatic = document.getElementById('tiPayload').value;

        const url = getBase() + '/qris/dynamic';
        const form = new URLSearchParams();

        if (amount) {
            form.append('amount', amount);
        } else {
            if (!base) { showToast('Isi nominal terlebih dahulu!'); return; }
            form.append('base_amount', base);
            const uniq = auto ? Math.floor(Math.random() * 999) + 1 : (uniqIn || '');
            if (!uniq) { showToast('Kode unik wajib diisi!'); return; }
            form.append('unique_code', uniq);
        }

        if (payloadStatic) form.append('payload_static', payloadStatic);
        form.append('qr', 'png');

        btnDynamic.disabled = true;
        btnDynamic.textContent = 'Menghubungi Server...';

        try {
            const start = performance.now();
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: form
            });
            const text = await r.text();
            const dur = Math.round(performance.now() - start);

            metaDynamic.textContent = `Status: ${r.status} • ${dur} ms • ${url}`;
            showJSON(jsonDynamic, text);

            try {
                const obj = JSON.parse(text);
                imgQR.src = obj.qr_png_data_url || '';
            } catch { imgQR.src = ''; }

            outDynamic.classList.remove('hidden');
            outDynamic.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            metaDynamic.textContent = `Error: ${err.message}`;
            showJSON(jsonDynamic, String(err));
            outDynamic.classList.remove('hidden');
        } finally {
            btnDynamic.disabled = false;
            btnDynamic.textContent = '⚡ Proses & Buat QRIS';
        }
    };

    btnDynamicReset.onclick = () => {
        document.getElementById('tiBase').value = '';
        document.getElementById('tiUnique').value = '';
        document.getElementById('tiAutoUnique').checked = false;
        document.getElementById('tiAmount').value = '';
        document.getElementById('tiPayload').value = '';
        outDynamic.classList.add('hidden');
    };
}

// ============================================
// QR CONVERTER
// ============================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const imagePreview = document.getElementById('imagePreview');
const btnConvert = document.getElementById('btnConvert');
const btnResetConverter = document.getElementById('btnResetConverter');
const outConverter = document.getElementById('outConverter');
const jsonConverter = document.getElementById('jsonConverter');
const metaConverter = document.getElementById('metaConverter');
const btnCopyPayload = document.getElementById('btnCopyPayload');

let currentFile = null;

if (dropZone) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('File wajib berformat gambar!');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showToast('Ukuran file maksimal hanya boleh 2MB!');
            return;
        }
        currentFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            previewSection.classList.remove('hidden');
            btnConvert.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    if (btnConvert) {
        btnConvert.onclick = async () => {
            if (!currentFile) {
                metaConverter.textContent = 'Error: File gambar kosong';
                showJSON(jsonConverter, JSON.stringify({ error: 'Tidak ada file' }));
                outConverter.classList.remove('hidden');
                return;
            }
            btnConvert.disabled = true;
            btnConvert.textContent = 'Membaca Gambar...';
            const formData = new FormData();
            formData.append('image', currentFile);
            try {
                const start = performance.now();
                const url = getBase() + '/qris/decode';
                const response = await fetch(url, { method: 'POST', body: formData });
                const responseText = await response.text();
                const dur = Math.round(performance.now() - start);
                metaConverter.textContent = `Status: ${response.status} • ${dur} ms`;
                showJSON(jsonConverter, responseText);
                outConverter.classList.remove('hidden');
                outConverter.scrollIntoView({ behavior: 'smooth' });
            } catch (err) {
                metaConverter.textContent = `Error: ${err.message}`;
                showJSON(jsonConverter, JSON.stringify({ error: err.message }));
                outConverter.classList.remove('hidden');
            } finally {
                btnConvert.disabled = false;
                btnConvert.textContent = 'Baca Gambar';
            }
        };
    }

    if (btnCopyPayload) {
        btnCopyPayload.onclick = () => {
            const payloadText = jsonConverter.textContent;
            navigator.clipboard.writeText(payloadText).then(() => {
                showToast('Teks berhasil disalin!');
            });
        };
    }

    if (btnResetConverter) {
        btnResetConverter.onclick = () => {
            fileInput.value = '';
            previewSection.classList.add('hidden');
            outConverter.classList.add('hidden');
            btnConvert.disabled = true;
            currentFile = null;
        };
    }
}

// ============================================
// WEBHOOK SIMULATOR
// ============================================
const btnWebhook = document.getElementById('btnWebhook');
const btnWebhookReset = document.getElementById('btnWebhookReset');
const outWebhook = document.getElementById('outWebhook');
const jsonWebhook = document.getElementById('jsonWebhook');
const metaWebhook = document.getElementById('metaWebhook');

if (btnWebhook) {
    btnWebhook.onclick = async () => {
        const token = document.getElementById('tiToken').value;
        const mode = document.getElementById('tiMode').value;
        const body = document.getElementById('tiBody').value;
        if (!token) { showToast('Kolom token wajib diisi!'); return; }
        const url = `${getBase()}/webhook/payment?token=${encodeURIComponent(token)}`;
        let headers = {};
        let payload;
        if (mode === 'json') {
            headers['Content-Type'] = 'application/json';
            payload = body;
        } else if (mode === 'form') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            try {
                const bodyObj = JSON.parse(body);
                const params = new URLSearchParams();
                for (const [key, value] of Object.entries(bodyObj)) { params.append(key, value); }
                payload = params;
            } catch {
                payload = new URLSearchParams();
                payload.append('message', body);
            }
        } else {
            headers['Content-Type'] = 'text/plain';
            payload = body;
        }
        btnWebhook.disabled = true;
        btnWebhook.textContent = 'Mengirimkan...';
        try {
            const start = performance.now();
            const response = await fetch(url, { method: 'POST', headers, body: payload });
            const responseText = await response.text();
            const dur = Math.round(performance.now() - start);
            metaWebhook.textContent = `Status: ${response.status} • ${dur} ms`;
            showJSON(jsonWebhook, responseText);
            outWebhook.classList.remove('hidden');
            outWebhook.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            metaWebhook.textContent = `Error: ${err.message}`;
            showJSON(jsonWebhook, JSON.stringify({ error: err.message }));
            outWebhook.classList.remove('hidden');
        } finally {
            btnWebhook.disabled = false;
            btnWebhook.textContent = '🚀 Kirim';
        }
    };

    if (btnWebhookReset) {
        btnWebhookReset.onclick = () => {
            document.getElementById('tiToken').value = '';
            document.getElementById('tiMode').value = 'json';
            document.getElementById('tiBody').value = '{ "message": "Pembayaran Rp 10.338" }';
            outWebhook.classList.add('hidden');
        };
    }
}

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/pwa/sw.js')
            .then(() => console.log('✅ Service Worker registered'))
            .catch(() => console.warn('❌ Service Worker registration failed'));
    });
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        toggleTheme();
    }
    if (e.key === 'Escape') {
        closeDrawer();
    }
});

// ============================================
// INIT
// ============================================
applyTheme(currentTheme);
console.log('⚡ GeekzPay API Docs loaded!');
console.log('📌 Version: v2.0');
console.log('🌓 Press Ctrl+L to toggle theme');