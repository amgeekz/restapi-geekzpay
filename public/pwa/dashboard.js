/**
 * GeekzPay PWA Monitor
 * Fix: QRIS Upload, Token tetap saat refresh
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_BASE: 'https://restapi.amgeekz.my.id',
    MAX_HISTORY: 200,
    POLLING_INTERVAL: 3000,
    DASHBOARD_LIMIT: 10
};

// ============================================
// STATE
// ============================================
const state = {
    token: localStorage.getItem('geekzpay_token') || '',
    soundEnabled: localStorage.getItem('geekzpay_sound') !== 'false',
    soundVolume: parseFloat(localStorage.getItem('geekzpay_sound_volume')) || 0.8,
    ttsEnabled: localStorage.getItem('geekzpay_tts') !== 'false',
    theme: localStorage.getItem('geekzpay_theme') || 'light',
    history: JSON.parse(localStorage.getItem('geekzpay_history') || '[]'),
    lastIds: new Set(JSON.parse(localStorage.getItem('geekzpay_last_ids') || '[]')),
    newCount: parseInt(localStorage.getItem('geekzpay_new_count')) || 0,
    stats: JSON.parse(localStorage.getItem('geekzpay_stats') || '{"daily":{},"monthly":{},"total":0,"totalAmount":0}'),
    pollingInterval: null,
    isPolling: false,
    isProcessing: false,
    customSound: localStorage.getItem('geekzpay_custom_sound') || null,
    customSoundName: localStorage.getItem('geekzpay_custom_sound_name') || null
};

// ============================================
// QRIS STATE
// ============================================
const QRIS_STATE = {
    imageData: localStorage.getItem('geekzpay_qris') || null,
    fileName: localStorage.getItem('geekzpay_qris_name') || null
};

// ============================================
// PLAY NOTIFICATION SOUND - SUARA KOIN JATUH
// ============================================
function playNotificationSound() {
    if (!state.soundEnabled) return;
    
    if (state.customSound) {
        try {
            const audio = new Audio(state.customSound);
            audio.volume = state.soundVolume;
            audio.play().catch(() => {});
            return;
        } catch (e) {}
    }
    
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const volume = state.soundVolume;
        const freqs = [2000, 1600, 1200, 800, 500];
        const durations = [0.06, 0.06, 0.08, 0.10, 0.15];
        const delays = [0, 80, 160, 250, 350];
        
        freqs.forEach((freq, i) => {
            setTimeout(() => {
                try {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = freq;
                    osc.type = 'sine';
                    const now = ctx.currentTime;
                    const vol = volume * (1 - i * 0.12);
                    gain.gain.setValueAtTime(0.01, now);
                    gain.gain.exponentialRampToValueAtTime(Math.max(vol * 0.3, 0.05), now + 0.01);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + durations[i]);
                    osc.start(now);
                    osc.stop(now + durations[i]);
                    
                    const bufSize = ctx.sampleRate * 0.025;
                    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let j = 0; j < bufSize; j++) {
                        data[j] = (Math.random() * 2 - 1) * 0.04 * volume;
                    }
                    const noise = ctx.createBufferSource();
                    noise.buffer = buf;
                    const ng = ctx.createGain();
                    ng.gain.value = volume * 0.06 * (1 - i * 0.1);
                    noise.connect(ng);
                    ng.connect(ctx.destination);
                    noise.start(now);
                    noise.stop(now + durations[i]);
                } catch (e) {}
            }, delays[i]);
        });
    } catch (e) {
        try {
            const audio = document.getElementById('notificationSound');
            if (audio) {
                audio.currentTime = 0;
                audio.volume = state.soundVolume;
                audio.play().catch(() => {});
            }
        } catch (err) {}
    }
}

// ============================================
// PAGE NAVIGATION
// ============================================
function navigateTo(page) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    
    document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.page-nav-btn[data-page="${page}"]`).classList.add('active');
}

document.querySelectorAll('.page-nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        navigateTo(this.dataset.page);
    });
});

// ============================================
// QRIS UPLOAD FUNCTIONS - FIX
// ============================================
function initQRISUpload() {
    const dropZone = document.getElementById('qrisDropZone');
    const fileInput = document.getElementById('qrisFileInput');
    const previewContainer = document.getElementById('qrisPreviewContainer');
    const previewImage = document.getElementById('qrisPreview');
    const showBtn = document.getElementById('qrisShowBtn');
    const modalImage = document.getElementById('qrisModalImage');
    
    // Jika ada QRIS tersimpan
    if (QRIS_STATE.imageData) {
        previewImage.src = QRIS_STATE.imageData;
        previewContainer.style.display = 'inline-block';
        showBtn.style.display = 'flex';
        modalImage.src = QRIS_STATE.imageData;
        dropZone.style.display = 'none';
    }
    
    // ===== FIX: Event listener untuk file input =====
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length) {
            handleQRISFile(e.target.files[0]);
        }
        // Reset agar bisa upload file yang sama lagi
        this.value = '';
    });
    
    // ===== FIX: Drag & Drop =====
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleQRISFile(e.dataTransfer.files[0]);
        }
    });
    
    // ===== FIX: Klik tombol upload =====
    document.querySelector('.qris-upload-btn')?.addEventListener('click', function(e) {
        e.stopPropagation();
        document.getElementById('qrisFileInput').click();
    });
}

function handleQRISFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('File harus gambar!');
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('Maksimal 2MB!');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const imageData = e.target.result;
        QRIS_STATE.imageData = imageData;
        QRIS_STATE.fileName = file.name;
        
        localStorage.setItem('geekzpay_qris', imageData);
        localStorage.setItem('geekzpay_qris_name', file.name);
        
        document.getElementById('qrisPreview').src = imageData;
        document.getElementById('qrisPreviewContainer').style.display = 'inline-block';
        document.getElementById('qrisShowBtn').style.display = 'flex';
        document.getElementById('qrisModalImage').src = imageData;
        document.getElementById('qrisDropZone').style.display = 'none';
        
        showToast(`QRIS "${file.name}" berhasil diupload!`);
    };
    reader.readAsDataURL(file);
}

function removeQRIS() {
    QRIS_STATE.imageData = null;
    QRIS_STATE.fileName = null;
    
    localStorage.removeItem('geekzpay_qris');
    localStorage.removeItem('geekzpay_qris_name');
    
    document.getElementById('qrisPreviewContainer').style.display = 'none';
    document.getElementById('qrisShowBtn').style.display = 'none';
    document.getElementById('qrisModalImage').src = '';
    document.getElementById('qrisDropZone').style.display = 'block';
    
    showToast('QRIS dihapus');
}
window.removeQRIS = removeQRIS;

function openQRISWidget() {
    if (!QRIS_STATE.imageData) {
        showToast('Upload QRIS terlebih dahulu!');
        return;
    }
    
    document.getElementById('qrisModalImage').src = QRIS_STATE.imageData;
    document.getElementById('qrisOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}
window.openQRISWidget = openQRISWidget;

function closeQRISWidget(event) {
    if (event && event.target !== event.currentTarget) {
        return;
    }
    document.getElementById('qrisOverlay').classList.remove('active');
    document.body.style.overflow = '';
}
window.closeQRISWidget = closeQRISWidget;

// ============================================
// SOUND UPLOAD CUSTOM
// ============================================
function initSoundUpload() {
    const dropZone = document.getElementById('soundDropZone');
    const fileInput = document.getElementById('soundFileInput');
    const previewContainer = document.getElementById('soundPreviewContainer');
    const fileName = document.getElementById('soundFileName');
    
    if (state.customSound) {
        previewContainer.style.display = 'inline-flex';
        fileName.textContent = state.customSoundName || 'custom.mp3';
        dropZone.style.display = 'none';
    }
    
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length) {
            handleSoundFile(e.target.files[0]);
        }
        this.value = '';
    });
    
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleSoundFile(e.dataTransfer.files[0]);
        }
    });
}

function handleSoundFile(file) {
    if (!file.type.startsWith('audio/')) {
        showToast('File harus audio!');
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('Maksimal 2MB!');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const audioData = e.target.result;
        state.customSound = audioData;
        state.customSoundName = file.name;
        
        localStorage.setItem('geekzpay_custom_sound', audioData);
        localStorage.setItem('geekzpay_custom_sound_name', file.name);
        
        document.getElementById('soundFileName').textContent = file.name;
        document.getElementById('soundPreviewContainer').style.display = 'inline-flex';
        document.getElementById('soundDropZone').style.display = 'none';
        
        showToast(`Suara "${file.name}" berhasil diupload!`);
    };
    reader.readAsDataURL(file);
}

function playCustomSound() {
    if (state.customSound) {
        try {
            const audio = new Audio(state.customSound);
            audio.volume = state.soundVolume;
            audio.play().catch(() => {});
        } catch (e) {
            showToast('Gagal memutar suara');
        }
    }
}
window.playCustomSound = playCustomSound;

function removeCustomSound() {
    state.customSound = null;
    state.customSoundName = null;
    
    localStorage.removeItem('geekzpay_custom_sound');
    localStorage.removeItem('geekzpay_custom_sound_name');
    
    document.getElementById('soundPreviewContainer').style.display = 'none';
    document.getElementById('soundDropZone').style.display = 'block';
    
    showToast('Suara custom dihapus');
}
window.removeCustomSound = removeCustomSound;

// ============================================
// DOM REFS
// ============================================
const DOM = {
    tokenInput: document.getElementById('tokenInput'),
    statusText: document.getElementById('statusText'),
    statusDot: document.getElementById('statusDot'),
    totalCount: document.getElementById('totalCount'),
    totalAmount: document.getElementById('totalAmount'),
    newCount: document.getElementById('newCount'),
    todayCount: document.getElementById('todayCount'),
    todayAmount: document.getElementById('todayAmount'),
    monthCount: document.getElementById('monthCount'),
    monthAmount: document.getElementById('monthAmount'),
    allCount: document.getElementById('allCount'),
    allAmount: document.getElementById('allAmount'),
    chartContainer: document.getElementById('chartContainer'),
    dashTransactionList: document.getElementById('dashTransactionList'),
    transactionList: document.getElementById('transactionList'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    permissionBanner: document.getElementById('permissionBanner'),
    dashHistoryCount: document.getElementById('dashHistoryCount'),
    historyCount: document.getElementById('historyCount'),
    themeIcon: document.querySelector('.theme-icon'),
    soundVolume: document.getElementById('soundVolume'),
    soundVolumeLabel: document.getElementById('soundVolumeLabel'),
    soundToggle: document.getElementById('soundToggle'),
    ttsToggle: document.getElementById('ttsToggle')
};

// ============================================
// THEME FUNCTIONS
// ============================================
function toggleTheme() {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    state.theme = newTheme;
    localStorage.setItem('geekzpay_theme', newTheme);
    applyTheme(newTheme);
}
window.toggleTheme = toggleTheme;

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (DOM.themeIcon) DOM.themeIcon.innerHTML = '<i class="fas fa-sun"></i>';
        document.getElementById('darkToggle').checked = true;
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (DOM.themeIcon) DOM.themeIcon.innerHTML = '<i class="fas fa-moon"></i>';
        document.getElementById('darkToggle').checked = false;
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.content = theme === 'dark' ? '#0f1420' : '#f0f4f8';
    }
}

// ============================================
// SAVE STATE
// ============================================
function saveState() {
    localStorage.setItem('geekzpay_history', JSON.stringify(state.history));
    localStorage.setItem('geekzpay_last_ids', JSON.stringify([...state.lastIds]));
    localStorage.setItem('geekzpay_new_count', String(state.newCount));
    localStorage.setItem('geekzpay_stats', JSON.stringify(state.stats));
}

// ============================================
// STATISTIK
// ============================================
function getTodayKey() { return new Date().toISOString().slice(0, 10); }
function getMonthKey() { return new Date().toISOString().slice(0, 7); }

function updateStats(amount) {
    const today = getTodayKey();
    const month = getMonthKey();
    
    if (!state.stats.daily[today]) state.stats.daily[today] = { count: 0, amount: 0 };
    if (!state.stats.monthly[month]) state.stats.monthly[month] = { count: 0, amount: 0 };
    
    state.stats.daily[today].count += 1;
    state.stats.daily[today].amount += amount;
    state.stats.monthly[month].count += 1;
    state.stats.monthly[month].amount += amount;
    state.stats.total += 1;
    state.stats.totalAmount += amount;
    
    saveState();
}

function calculateStatsFromHistory() {
    state.stats.daily = {};
    state.stats.monthly = {};
    state.stats.total = 0;
    state.stats.totalAmount = 0;
    
    state.history.forEach(item => {
        const date = new Date(item.time);
        const dayKey = date.toISOString().slice(0, 10);
        const monthKey = date.toISOString().slice(0, 7);
        const amount = item.amount || 0;
        
        if (!state.stats.daily[dayKey]) state.stats.daily[dayKey] = { count: 0, amount: 0 };
        if (!state.stats.monthly[monthKey]) state.stats.monthly[monthKey] = { count: 0, amount: 0 };
        
        state.stats.daily[dayKey].count += 1;
        state.stats.daily[dayKey].amount += amount;
        state.stats.monthly[monthKey].count += 1;
        state.stats.monthly[monthKey].amount += amount;
        state.stats.total += 1;
        state.stats.totalAmount += amount;
    });
    
    saveState();
}

function renderStats() {
    const today = getTodayKey();
    const month = getMonthKey();
    const todayData = state.stats.daily[today] || { count: 0, amount: 0 };
    const monthData = state.stats.monthly[month] || { count: 0, amount: 0 };
    
    DOM.todayCount.textContent = todayData.count;
    DOM.todayAmount.textContent = `Rp ${formatRupiah(todayData.amount)}`;
    DOM.monthCount.textContent = monthData.count;
    DOM.monthAmount.textContent = `Rp ${formatRupiah(monthData.amount)}`;
    DOM.allCount.textContent = state.stats.total;
    DOM.allAmount.textContent = `Rp ${formatRupiah(state.stats.totalAmount)}`;
}

function renderChart() {
    const container = DOM.chartContainer;
    if (!container) return;
    
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('id-ID', { weekday: 'short' });
        days.push({ key, label, count: state.stats.daily[key]?.count || 0 });
    }
    
    const hasData = days.some(d => d.count > 0);
    if (!hasData) {
        container.innerHTML = `<div class="chart-empty">Belum ada data 7 hari terakhir</div>`;
        return;
    }
    
    const maxCount = Math.max(...days.map(d => d.count), 1);
    const today = getTodayKey();
    
    container.innerHTML = days.map(day => {
        const height = Math.max((day.count / maxCount) * 100, 4);
        const isToday = day.key === today;
        return `
            <div class="chart-bar-wrapper">
                <div class="chart-bar-value">${day.count > 0 ? day.count : ''}</div>
                <div class="chart-bar ${isToday ? 'today' : ''}" style="height: ${height}%;"></div>
                <div class="chart-bar-label">${day.label}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// RENDER TRANSACTIONS
// ============================================
function renderTransactions() {
    const dashItems = state.history.slice(0, CONFIG.DASHBOARD_LIMIT);
    if (dashItems.length === 0) {
        DOM.dashTransactionList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-inbox"></i></div>
                <p>Belum ada transaksi</p>
                <span>Masukkan token di Pengaturan</span>
            </div>`;
        DOM.dashHistoryCount.textContent = '0';
    } else {
        DOM.dashTransactionList.innerHTML = dashItems.map((item, index) => {
            const isNew = index < state.newCount && index < 5;
            return `
                <div class="transaction-item ${isNew ? 'new' : ''}">
                    <div>
                        <div class="amount">Rp ${formatRupiah(item.amount)}</div>
                        <div class="info">${item.message}</div>
                    </div>
                    <div class="time">${formatTime(item.time)}</div>
                </div>`;
        }).join('');
        DOM.dashHistoryCount.textContent = state.history.length;
    }
    
    if (state.history.length === 0) {
        DOM.transactionList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-inbox"></i></div>
                <p>Belum ada transaksi</p>
                <span>Masukkan token di Pengaturan</span>
            </div>`;
        DOM.historyCount.textContent = '0';
    } else {
        DOM.transactionList.innerHTML = state.history.map((item, index) => {
            const isNew = index < state.newCount && index < 5;
            return `
                <div class="transaction-item ${isNew ? 'new' : ''}">
                    <div>
                        <div class="amount">Rp ${formatRupiah(item.amount)}</div>
                        <div class="info">${item.message}</div>
                    </div>
                    <div class="time">${formatTime(item.time)}</div>
                </div>`;
        }).join('');
        DOM.historyCount.textContent = state.history.length;
    }
}

// ============================================
// UPDATE STATS UI
// ============================================
function updateStatsUI() {
    const total = state.history.length;
    const totalAmt = state.history.reduce((s, i) => s + (i.amount || 0), 0);
    DOM.totalCount.textContent = total;
    DOM.totalAmount.textContent = `Rp ${formatRupiah(totalAmt)}`;
    DOM.newCount.textContent = state.newCount;
}

function updateBadge() {
    if (navigator.setAppBadge) navigator.setAppBadge(state.newCount);
}

// ============================================
// STATUS
// ============================================
function setStatus(type, text) {
    DOM.statusText.textContent = text;
}

// ============================================
// HELPERS
// ============================================
function formatRupiah(v) { return new Intl.NumberFormat('id-ID').format(v || 0); }
function formatTime(iso) {
    try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } 
    catch { return iso || ''; }
}
function showToast(msg) {
    DOM.toastMessage.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    DOM.toast.classList.add('show');
    clearTimeout(DOM.toast._timeout);
    DOM.toast._timeout = setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

// ============================================
// SAVE TOKEN - FIX: Simpan & Tampilkan di input
// ============================================
function saveToken() {
    const newToken = DOM.tokenInput.value.trim();
    if (!newToken) {
        showToast('Token tidak boleh kosong');
        return;
    }
    
    state.token = newToken;
    localStorage.setItem('geekzpay_token', newToken);
    
    showToast('Token tersimpan');
    
    // Reset state untuk token baru
    state.lastIds = new Set();
    state.history = [];
    state.newCount = 0;
    state.stats = { daily: {}, monthly: {}, total: 0, totalAmount: 0 };
    saveState();
    
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    
    startPolling();
}
window.saveToken = saveToken;

// ============================================
// POLLING
// ============================================
function startPolling() {
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = null;
    }
    
    if (!state.token) {
        showToast('Masukkan token di Pengaturan');
        return;
    }

    state.isPolling = true;
    setStatus('online', 'Online');
    DOM.statusDot.style.background = '#22b573';
    showToast('Monitoring aktif');
    
    pollData();
    state.pollingInterval = setInterval(pollData, CONFIG.POLLING_INTERVAL);
}

// ============================================
// POLLING - FETCH DATA
// ============================================
async function pollData() {
    if (!state.token) return;
    if (state.isProcessing) return;
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/webhook/status?token=${encodeURIComponent(state.token)}&limit=10`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const items = Array.isArray(data?.data) ? data.data : [];
        
        let newItems = 0;
        items.forEach(item => {
            const id = item.event_id || item.id;
            if (id && !state.lastIds.has(id)) {
                state.lastIds.add(id);
                newItems++;
                const amount = item.amount || 0;
                state.history.unshift({
                    id, amount,
                    time: item.received_at || new Date().toISOString(),
                    message: item.body?.message || 'Pembayaran masuk',
                    raw: item
                });
                updateStats(amount);
                
                if (state.soundEnabled) playNotificationSound();
                if (state.ttsEnabled) speakPayment(amount);
                showToast(`Pembayaran Rp ${formatRupiah(amount)} masuk`);
                sendPushNotification({ id, amount, message: item.body?.message || 'Pembayaran masuk' });
            }
        });
        
        if (newItems > 0) {
            state.newCount += newItems;
            if (state.history.length > CONFIG.MAX_HISTORY) {
                state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
            }
            saveState();
            renderTransactions();
            updateStatsUI();
            renderStats();
            renderChart();
            updateBadge();
            console.log(`${newItems} new payment(s) detected`);
        }
        
        setStatus('online', 'Online');
        DOM.statusDot.style.background = '#22b573';
        
    } catch (error) {
        console.warn('Polling error:', error);
        setStatus('error', 'Error');
        DOM.statusDot.style.background = '#ef5a6b';
    }
}
window.pollData = pollData;

// ============================================
// CLEAR HISTORY
// ============================================
function clearHistory() {
    if (!confirm('Hapus semua history & statistik?')) return;
    
    state.history = [];
    state.lastIds = new Set();
    state.newCount = 0;
    state.stats = { daily: {}, monthly: {}, total: 0, totalAmount: 0 };
    saveState();
    
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    updateBadge();
    if (navigator.clearAppBadge) navigator.clearAppBadge();
    
    showToast('Data dibersihkan');
}
window.clearHistory = clearHistory;

function clearAllData() {
    if (!confirm('Hapus SEMUA data (history, QRIS, suara custom)?')) return;
    
    state.history = [];
    state.lastIds = new Set();
    state.newCount = 0;
    state.stats = { daily: {}, monthly: {}, total: 0, totalAmount: 0 };
    
    QRIS_STATE.imageData = null;
    QRIS_STATE.fileName = null;
    localStorage.removeItem('geekzpay_qris');
    localStorage.removeItem('geekzpay_qris_name');
    document.getElementById('qrisPreviewContainer').style.display = 'none';
    document.getElementById('qrisShowBtn').style.display = 'none';
    document.getElementById('qrisModalImage').src = '';
    document.getElementById('qrisDropZone').style.display = 'block';
    
    state.customSound = null;
    state.customSoundName = null;
    localStorage.removeItem('geekzpay_custom_sound');
    localStorage.removeItem('geekzpay_custom_sound_name');
    document.getElementById('soundPreviewContainer').style.display = 'none';
    document.getElementById('soundDropZone').style.display = 'block';
    
    saveState();
    
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    updateBadge();
    if (navigator.clearAppBadge) navigator.clearAppBadge();
    
    showToast('Semua data dibersihkan');
}
window.clearAllData = clearAllData;

// ============================================
// TEXT-TO-SPEECH
// ============================================
function speakPayment(amount) {
    if (!state.ttsEnabled || !('speechSynthesis' in window)) return;
    try {
        const text = `Pembayaran masuk Rp ${formatRupiah(amount)}`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = state.soundVolume;
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find(v => v.lang.startsWith('id'));
        if (idVoice) utterance.voice = idVoice;
        window.speechSynthesis.speak(utterance);
    } catch (e) {}
}

// ============================================
// TOGGLE FUNCTIONS
// ============================================
function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('geekzpay_sound', String(state.soundEnabled));
    DOM.soundToggle.checked = state.soundEnabled;
    showToast(state.soundEnabled ? 'Suara ON' : 'Suara OFF');
}
window.toggleSound = toggleSound;

function toggleTts() {
    state.ttsEnabled = !state.ttsEnabled;
    localStorage.setItem('geekzpay_tts', String(state.ttsEnabled));
    DOM.ttsToggle.checked = state.ttsEnabled;
    showToast(state.ttsEnabled ? 'Voice ON' : 'Voice OFF');
    if (state.ttsEnabled) speakPayment(10000);
}
window.toggleTts = toggleTts;

function changeSoundVolume(value) {
    state.soundVolume = parseFloat(value);
    localStorage.setItem('geekzpay_sound_volume', String(state.soundVolume));
    DOM.soundVolumeLabel.textContent = `${Math.round(state.soundVolume * 100)}%`;
}
window.changeSoundVolume = changeSoundVolume;

// ============================================
// PUSH NOTIFICATION
// ============================================
function sendPushNotification(entry) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification('Pembayaran Masuk', {
                body: `Rp ${formatRupiah(entry.amount)} - ${entry.message}`,
                icon: '/icon128.png',
                badge: '/icon48.png',
                vibrate: [200, 100, 200],
                requireInteraction: true,
                tag: 'payment-' + entry.id
            });
        } catch (e) {}
    }
}

// ============================================
// SERVICE WORKER
// ============================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/pwa/sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(() => console.warn('SW failed'));
    }
}

// ============================================
// NOTIFICATION PERMISSION
// ============================================
function checkNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        DOM.permissionBanner.style.display = 'flex';
    }
}

function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(p => {
            if (p === 'granted') {
                DOM.permissionBanner.style.display = 'none';
                showToast('Notifikasi diizinkan');
            }
        });
    }
}
window.requestNotificationPermission = requestNotificationPermission;

// ============================================
// INIT - FIX: Token tetap diinput
// ============================================
function init() {
    applyTheme(state.theme);
    
    initQRISUpload();
    initSoundUpload();
    
    document.getElementById('darkToggle').checked = state.theme === 'dark';
    DOM.soundToggle.checked = state.soundEnabled;
    DOM.ttsToggle.checked = state.ttsEnabled;
    DOM.soundVolume.value = state.soundVolume;
    DOM.soundVolumeLabel.textContent = `${Math.round(state.soundVolume * 100)}%`;
    
    // ===== FIX: Token tetap terisi di input =====
    if (state.token) {
        DOM.tokenInput.value = state.token; // Tampilkan token di input
        startPolling();
    } else {
        DOM.tokenInput.value = '';
        setStatus('paused', 'Waiting Token');
        DOM.statusDot.style.background = '#f5a623';
        showToast('Masukkan token di Pengaturan');
    }
    
    calculateStatsFromHistory();
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    registerServiceWorker();
    checkNotificationPermission();
    
    console.log('GeekzPay Monitor loaded');
    console.log('Token:', state.token ? '✅ Tersimpan' : '❌ Kosong');
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeQRISWidget();
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        toggleTheme();
    }
});

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}