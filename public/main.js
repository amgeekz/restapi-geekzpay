/**
 * GeekzPay API Docs - Main JavaScript
 */

// ============================================
// THEME
// ============================================
let currentTheme = localStorage.getItem('theme') || 'light';

function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.querySelector('.theme-btn').textContent = '☀';
        document.querySelector('meta[name="theme-color"]').content = '#0f1420';
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelector('.theme-btn').textContent = '☾';
        document.querySelector('meta[name="theme-color"]').content = '#f0f4f8';
    }
}

function toggleTheme() {
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
}
window.toggleTheme = toggleTheme;

// ============================================
// MOBILE MENU
// ============================================
function toggleMenu() {
    document.getElementById('mobileMenu').classList.toggle('open');
}
window.toggleMenu = toggleMenu;

document.querySelectorAll('.mobile-menu nav a').forEach(el => {
    el.addEventListener('click', () => {
        document.getElementById('mobileMenu').classList.remove('open');
    });
});

// ============================================
// PAGE NAVIGATION
// ============================================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.tab, .mobile-menu nav a').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.page === pageId) el.classList.add('active');
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        showPage(this.dataset.page);
    });
});

document.querySelectorAll('.mobile-menu nav a[data-page]').forEach(el => {
    el.addEventListener('click', function(e) {
        e.preventDefault();
        showPage(this.dataset.page);
    });
});

// ============================================
// BASE URL
// ============================================
const baseInput = document.getElementById('baseUrl');
if (baseInput) {
    baseInput.value = window.location.origin;
}

function getBase() {
    return window.location.origin;
}

// ============================================
// TOAST
// ============================================
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// SHOW JSON
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
// HISTORY
// ============================================
document.getElementById('btnFetchHistory')?.addEventListener('click', async function() {
    const token = document.getElementById('historyToken').value.trim();
    const limit = document.getElementById('historyLimit').value.trim() || '10';
    const body = document.getElementById('historyBody');
    
    if (!token) { showToast('Masukkan token!'); return; }
    
    this.disabled = true;
    this.textContent = 'Loading...';
    
    try {
        const res = await fetch(`${getBase()}/webhook/status?token=${encodeURIComponent(token)}&limit=${limit}`);
        const data = await res.json();
        
        if (!data.data || data.data.length === 0) {
            body.innerHTML = '<div class="empty">Belum ada data</div>';
        } else {
            let html = '<div style="overflow-x:auto;"><table class="status-table"><thead><tr><th>ID</th><th>Waktu</th><th>Jumlah</th><th>Pesan</th></tr></thead><tbody>';
            data.data.forEach(ev => {
                const msg = ev.body?.message || ev.body?.text || '-';
                html += `<tr>
                    <td>${ev.event_id?.slice(0,8) || '-'}</td>
                    <td>${new Date(ev.received_at).toLocaleString('id-ID')}</td>
                    <td style="color:var(--success);font-weight:700;">Rp ${Number(ev.amount).toLocaleString('id-ID')}</td>
                    <td>${msg}</td>
                </tr>`;
            });
            html += '</tbody></table></div>';
            body.innerHTML = html;
        }
    } catch (err) {
        body.innerHTML = `<div class="empty" style="color:var(--danger);">Error: ${err.message}</div>`;
    }
    
    this.disabled = false;
    this.textContent = '🔍 Cari';
});

// ============================================
// QRIS DYNAMIC
// ============================================
document.getElementById('btnDynamic')?.addEventListener('click', async function() {
    const base = document.getElementById('tiBase').value;
    const uniqIn = document.getElementById('tiUnique').value;
    const auto = document.getElementById('tiAutoUnique').checked;
    const amount = document.getElementById('tiAmount').value;
    const payload = document.getElementById('tiPayload').value;
    
    const form = new URLSearchParams();
    
    if (amount) {
        form.append('amount', amount);
    } else {
        if (!base) { showToast('Isi nominal!'); return; }
        form.append('base_amount', base);
        const uniq = auto ? Math.floor(Math.random() * 999) + 1 : (uniqIn || '');
        if (!uniq) { showToast('Kode unik wajib!'); return; }
        form.append('unique_code', uniq);
    }
    if (payload) form.append('payload_static', payload);
    form.append('qr', 'png');
    
    this.disabled = true;
    this.textContent = 'Loading...';
    
    try {
        const res = await fetch(`${getBase()}/qris/dynamic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        const text = await res.text();
        document.getElementById('metaDynamic').textContent = `Status: ${res.status}`;
        showJSON(document.getElementById('jsonDynamic'), text);
        
        try {
            const obj = JSON.parse(text);
            document.getElementById('imgQR').src = obj.qr_png_data_url || '';
        } catch {}
        
        document.getElementById('outDynamic').classList.add('show');
    } catch (err) {
        showToast('Error: ' + err.message);
    }
    
    this.disabled = false;
    this.textContent = '⚡ Proses QRIS';
});

document.getElementById('btnDynamicReset')?.addEventListener('click', function() {
    ['tiBase','tiUnique','tiAmount','tiPayload'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('tiAutoUnique').checked = false;
    document.getElementById('outDynamic').classList.remove('show');
});

// ============================================
// QR CONVERTER
// ============================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const imagePreview = document.getElementById('imagePreview');
const btnConvert = document.getElementById('btnConvert');
let currentFile = null;

dropZone?.addEventListener('click', () => fileInput.click());
dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
dropZone?.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

fileInput?.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) { showToast('File harus gambar!'); return; }
    if (file.size > 2*1024*1024) { showToast('Maks 2MB!'); return; }
    currentFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        imagePreview.src = e.target.result;
        previewSection.style.display = 'block';
        btnConvert.disabled = false;
    };
    reader.readAsDataURL(file);
}

btnConvert?.addEventListener('click', async function() {
    if (!currentFile) return;
    this.disabled = true;
    this.textContent = 'Reading...';
    const formData = new FormData();
    formData.append('image', currentFile);
    
    try {
        const res = await fetch(`${getBase()}/qris/decode`, {
            method: 'POST',
            body: formData
        });
        const text = await res.text();
        document.getElementById('metaConverter').textContent = `Status: ${res.status}`;
        showJSON(document.getElementById('jsonConverter'), text);
        document.getElementById('outConverter').classList.add('show');
    } catch (err) {
        showToast('Error: ' + err.message);
    }
    
    this.disabled = false;
    this.textContent = 'Baca Gambar';
});

document.getElementById('btnResetConverter')?.addEventListener('click', function() {
    fileInput.value = '';
    previewSection.style.display = 'none';
    document.getElementById('outConverter').classList.remove('show');
    btnConvert.disabled = true;
    currentFile = null;
});

document.getElementById('btnCopyPayload')?.addEventListener('click', function() {
    const text = document.getElementById('jsonConverter').textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Tersalin!'));
});

// ============================================
// WEBHOOK
// ============================================
document.getElementById('btnWebhook')?.addEventListener('click', async function() {
    const token = document.getElementById('tiToken').value.trim();
    const mode = document.getElementById('tiMode').value;
    const body = document.getElementById('tiBody').value;
    
    if (!token) { showToast('Token wajib!'); return; }
    
    this.disabled = true;
    this.textContent = 'Sending...';
    
    const url = `${getBase()}/webhook/payment?token=${encodeURIComponent(token)}`;
    let headers = {}, payload = body;
    
    if (mode === 'json') {
        headers['Content-Type'] = 'application/json';
    } else if (mode === 'form') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        try {
            const obj = JSON.parse(body);
            const params = new URLSearchParams();
            for (const [k,v] of Object.entries(obj)) params.append(k, v);
            payload = params;
        } catch { payload = new URLSearchParams({message: body}); }
    } else {
        headers['Content-Type'] = 'text/plain';
    }
    
    try {
        const res = await fetch(url, { method: 'POST', headers, body: payload });
        const text = await res.text();
        document.getElementById('metaWebhook').textContent = `Status: ${res.status}`;
        showJSON(document.getElementById('jsonWebhook'), text);
        document.getElementById('outWebhook').classList.add('show');
    } catch (err) {
        showToast('Error: ' + err.message);
    }
    
    this.disabled = false;
    this.textContent = '▶ Kirim';
});

document.getElementById('btnWebhookReset')?.addEventListener('click', function() {
    document.getElementById('tiToken').value = '';
    document.getElementById('tiMode').value = 'json';
    document.getElementById('tiBody').value = '{"message": "Pembayaran Rp 10.338"}';
    document.getElementById('outWebhook').classList.remove('show');
});

// ============================================
// HIGHLIGHT
// ============================================
hljs.highlightAll();

// ============================================
// INIT
// ============================================
applyTheme(currentTheme);
console.log('GeekzPay API Docs loaded');