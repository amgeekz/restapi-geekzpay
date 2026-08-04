// ============================================
// HIGHLIGHT.JS INIT
// ============================================
hljs.highlightAll();

// ============================================
// PAGE NAVIGATION
// ============================================
function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(pageId + '-page');
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const targetLinks = document.querySelectorAll(`.nav-link[data-page="${pageId}"]`);
    targetLinks.forEach(link => link.classList.add('active'));
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// NAVIGATION EVENTS
// ============================================
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function() {
        const page = this.getAttribute('data-page');
        showPage(page);
        
        // Tutup drawer di mobile
        if (window.innerWidth < 768) {
            document.getElementById('drawer').classList.add('hidden');
        }
    });
});

// ============================================
// MOBILE DRAWER
// ============================================
const drawer = document.getElementById('drawer');
document.getElementById('openMenu').onclick = () => drawer.classList.remove('hidden');
document.getElementById('closeMenu').onclick = () => drawer.classList.add('hidden');

drawer.onclick = (e) => {
    if (e.target === drawer.firstElementChild) {
        drawer.classList.add('hidden');
    }
};

drawer.querySelectorAll('[data-close]').forEach(a => {
    a.onclick = () => drawer.classList.add('hidden');
});

// ============================================
// BACK TO TOP
// ============================================
const toTop = document.getElementById('toTop');
window.onscroll = () => {
    toTop.classList.toggle('hidden', window.scrollY < 400);
};
toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

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
            alert('Masukkan token terlebih dahulu!');
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
                const empty = `
                    <div class="bg-white border-3 border-black rounded-xl p-6 text-center text-neutral-500 font-bold text-xs uppercase tracking-wider shadow-[3px_3px_0px_#111111]">
                        Belum ada data pembayaran masuk untuk token ini.
                    </div>`;
                tRows = `<tr><td colspan="5" class="p-8 text-center text-neutral-500 uppercase tracking-wider font-bold text-xs">Belum ada data pembayaran masuk untuk token ini.</td></tr>`;
                mCards = empty;
            } else {
                resData.data.forEach(ev => {
                    const dateStr = new Date(ev.received_at).toLocaleString('id-ID');
                    const msgStr = ev.body && ev.body.message ? ev.body.message : 
                                  (ev.body && ev.body.text ? ev.body.text : JSON.stringify(ev.body || {}));
                    const rupiahStr = Number(ev.amount).toLocaleString('id-ID');

                    tRows += `
                        <tr class="bg-white border-b-3 border-black hover:bg-[#fffef5]">
                            <td class="p-4 border-r-2 border-black font-mono text-neutral-600 break-all">${ev.event_id || 'unknown'}</td>
                            <td class="p-4 border-r-2 border-black text-neutral-800 whitespace-nowrap">${dateStr}</td>
                            <td class="p-4 border-r-2 border-black font-mono text-sm text-emerald-600 font-black whitespace-nowrap">Rp ${rupiahStr}</td>
                            <td class="p-4 border-r-2 border-black text-neutral-700 break-words font-semibold">${msgStr}</td>
                            <td class="p-4 font-mono text-neutral-400 whitespace-nowrap">${ev.ip || '0.0.0.0'}</td>
                        </tr>`;

                    mCards += `
                        <div class="bg-white border-3 border-black rounded-xl p-4 shadow-[5px_5px_0px_#111111] flex flex-col gap-2 font-bold">
                            <div class="flex items-center justify-between border-b-2 border-dashed border-black/20 pb-2">
                                <span class="font-mono text-[10px] text-neutral-500">${ev.event_id || 'unknown'}</span>
                                <span class="text-[10px] text-neutral-600">${dateStr}</span>
                            </div>
                            <div class="text-base font-mono font-black text-emerald-600">Rp ${rupiahStr}</div>
                            <div class="text-xs text-neutral-700 bg-[#fffef5] p-3 border-2 border-black rounded-lg font-semibold break-words">${msgStr}</div>
                            <div class="text-[10px] text-neutral-400 font-mono text-right">IP: ${ev.ip || '0.0.0.0'}</div>
                        </div>`;
                });
            }

            desktopBody.innerHTML = tRows;
            mobileContainer.innerHTML = mCards;

        } catch (err) {
            alert(`Gagal mengambil data: ${err.message}`);
            const errBlock = `
                <div class="bg-red-50 text-red-600 border-3 border-black rounded-xl p-4 font-bold text-xs uppercase tracking-wider shadow-[3px_3px_0px_#111111]">
                    Gagal tersambung ke server. Periksa koneksi internet Anda.
                </div>`;
            desktopBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-600 font-bold">${errBlock}</td></tr>`;
            mobileContainer.innerHTML = errBlock;
        } finally {
            btnFetchHistory.disabled = false;
            btnFetchHistory.textContent = 'Cari & Refresh Data ↻';
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
            if (!base) { alert('Isi nominal terlebih dahulu!'); return; }
            form.append('base_amount', base);
            const uniq = auto ? Math.floor(Math.random() * 999) + 1 : (uniqIn || '');
            if (!uniq) { alert('Kode unik wajib diisi!'); return; }
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
            btnDynamic.textContent = 'PROSES & BUAT GAMBAR QRIS';
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
            alert('File wajib berformat gambar!');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            alert('Ukuran file maksimal hanya boleh 2MB!');
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
                btnConvert.textContent = 'Mulai Baca Gambar';
            }
        };
    }

    if (btnCopyPayload) {
        btnCopyPayload.onclick = () => {
            const payloadText = jsonConverter.textContent;
            navigator.clipboard.writeText(payloadText).then(() => {
                alert('Teks berhasil disalin!');
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
        if (!token) { alert('Kolom token wajib diisi!'); return; }
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
            btnWebhook.textContent = 'KIRIM SIMULASI SEKARANG';
        }
    };

    if (btnWebhookReset) {
        btnWebhookReset.onclick = () => {
            document.getElementById('tiToken').value = '';
            document.getElementById('tiMode').value = 'json';
            document.getElementById('tiBody').value = '{ "message": "Pembayaran masuk Rp 10.338 dari ShopeePay" }';
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
            .then(reg => console.log('✅ Service Worker registered:', reg))
            .catch(err => console.warn('❌ Service Worker registration failed:', err));
    });
}

console.log('⚡ GeekzPay API Docs loaded!');
console.log('📌 Version: v2.0');
