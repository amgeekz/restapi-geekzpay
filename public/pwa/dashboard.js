/**
 * GeekzPay PWA Monitor
 * Dashboard untuk monitoring pembayaran real-time
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_BASE: 'https://restapi.amgeekz.my.id',
    POLLING_INTERVAL: 2000, // 2 detik
    MAX_HISTORY: 100,
    DEFAULT_TOKEN: 'USER123'
};

// ============================================
// STATE
// ============================================
const state = {
    token: localStorage.getItem('geekzpay_token') || CONFIG.DEFAULT_TOKEN,
    soundEnabled: localStorage.getItem('geekzpay_sound') !== 'false',
    history: JSON.parse(localStorage.getItem('geekzpay_history') || '[]'),
    lastIds: new Set(),
    newCount: 0,
    pollingInterval: null,
    isPolling: true
};

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
    transactionList: document.getElementById('transactionList'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    toggleSoundBtn: document.getElementById('toggleSoundBtn'),
    sound: document.getElementById('notificationSound')
};

// ============================================
// INIT
// ============================================
function init() {
    DOM.tokenInput.value = state.token;
    updateSoundButton();
    renderTransactions();
    updateStats();
    startPolling();
    registerServiceWorker();
    console.log('⚡ GeekzPay Monitor PWA loaded!');
    console.log('📌 Shortcuts: R = Refresh, M = Toggle Sound');
}

// ============================================
// CORE FUNCTIONS
// ============================================

/** Simpan token ke localStorage */
function saveToken() {
    const newToken = DOM.tokenInput.value.trim();
    if (!newToken) {
        showToast('⚠️ Token tidak boleh kosong!');
        return;
    }
    state.token = newToken;
    localStorage.setItem('geekzpay_token', state.token);
    showToast('✅ Token berhasil disimpan!');
    fetchData();
}
window.saveToken = saveToken;

/** Fetch data dari API */
async function fetchData() {
    if (!state.token) {
        showToast('⚠️ Masukkan token terlebih dahulu!');
        return;
    }

    try {
        setStatus('loading', 'Loading...');
        
        const url = `${CONFIG.API_BASE}/webhook/status?token=${encodeURIComponent(state.token)}&limit=10`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const items = normalizeData(data);
        
        processNewData(items);
        setStatus('online', 'Online');
        
    } catch (error) {
        console.error('Fetch error:', error);
        setStatus('error', 'Error');
        showToast('❌ Gagal mengambil data: ' + error.message);
    }
}
window.fetchData = fetchData;

/** Normalisasi data dari berbagai format */
function normalizeData(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.events)) return data.events;
    return data ? [data] : [];
}

/** Proses data baru */
function processNewData(items) {
    let newItems = 0;
    
    items.forEach(item => {
        const id = extractId(item);
        
        // Cek duplikasi
        if (!state.lastIds.has(id)) {
            state.lastIds.add(id);
            newItems++;
            
            // Buat entry
            const entry = {
                id: id,
                amount: parseAmount(item.amount || item.body?.amount || 0),
                time: item.received_at || item.time || item.created_at || new Date().toISOString(),
                message: extractMessage(item),
                raw: item
            };
            
            state.history.unshift(entry);
            
            // Notifikasi
            if (state.soundEnabled) {
                playNotificationSound();
            }
            showToast(`💳 Pembayaran Rp ${formatRupiah(entry.amount)} masuk!`);
        }
    });
    
    if (newItems > 0) {
        // Batasi history
        if (state.history.length > CONFIG.MAX_HISTORY) {
            state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
        }
        
        state.newCount += newItems;
        localStorage.setItem('geekzpay_history', JSON.stringify(state.history));
        
        renderTransactions();
        updateStats();
        updateBadge();
    }
}

/** Extract ID dari berbagai format */
function extractId(item) {
    return item.id || item.event_id || item._id || 
           item.body?.id || item.body?.event_id || 
           Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

/** Extract message dari berbagai format */
function extractMessage(item) {
    return item.message || item.body?.message || 
           item.body?.text || item.body?.raw || 
           'Pembayaran masuk';
}

/** Parse amount */
function parseAmount(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = String(value).replace(/[^\d]/g, '');
    return parseInt(cleaned) || 0;
}

// ============================================
// RENDER FUNCTIONS
// ============================================

/** Render daftar transaksi */
function renderTransactions() {
    if (state.history.length === 0) {
        DOM.transactionList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Belum ada transaksi</p>
                <small>Masukkan token dan tunggu notifikasi</small>
            </div>
        `;
        return;
    }

    const html = state.history.map((item, index) => {
        const isNew = index < state.newCount && index < 5;
        return `
            <div class="transaction-item ${isNew ? 'new' : ''}">
                <div>
                    <div class="amount">Rp ${formatRupiah(item.amount)}</div>
                    <div class="info">${item.message}</div>
                </div>
                <div class="time">${formatTime(item.time)}</div>
            </div>
        `;
    }).join('');

    DOM.transactionList.innerHTML = html;
}

/** Update statistik */
function updateStats() {
    const total = state.history.length;
    const totalAmt = state.history.reduce((sum, item) => sum + (item.amount || 0), 0);
    
    DOM.totalCount.textContent = total;
    DOM.totalAmount.textContent = `Rp ${formatRupiah(totalAmt)}`;
    DOM.newCount.textContent = state.newCount;
}

/** Update badge di icon aplikasi */
function updateBadge() {
    if (navigator.setAppBadge) {
        navigator.setAppBadge(state.newCount);
    }
}

// ============================================
// POLLING
// ============================================

function startPolling() {
    if (state.pollingInterval) clearInterval(state.pollingInterval);
    
    // Fetch immediately
    fetchData();
    
    // Then every interval
    state.pollingInterval = setInterval(fetchData, CONFIG.POLLING_INTERVAL);
    state.isPolling = true;
}

function stopPolling() {
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = null;
        state.isPolling = false;
        setStatus('paused', 'Paused');
    }
}

// ============================================
// NOTIFICATION SOUND
// ============================================

function playNotificationSound() {
    try {
        // Web Audio API
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // First beep
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.frequency.value = 800;
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.3);
        
        // Second beep (higher)
        setTimeout(() => {
            try {
                const osc2 = audioCtx.createOscillator();
                const gain2 = audioCtx.createGain();
                osc2.connect(gain2);
                gain2.connect(audioCtx.destination);
                osc2.frequency.value = 1000;
                osc2.type = 'sine';
                gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                osc2.start(audioCtx.currentTime);
                osc2.stop(audioCtx.currentTime + 0.2);
            } catch (e) { /* ignore */ }
        }, 200);
        
    } catch (e) {
        // Fallback ke HTML5 audio
        try {
            DOM.sound.currentTime = 0;
            DOM.sound.play().catch(() => {});
        } catch (err) {
            console.warn('Sound not supported');
        }
    }
}

function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('geekzpay_sound', String(state.soundEnabled));
    updateSoundButton();
    showToast(state.soundEnabled ? '🔊 Suara diaktifkan' : '🔇 Suara dimatikan');
}
window.toggleSound = toggleSound;

function updateSoundButton() {
    DOM.toggleSoundBtn.textContent = state.soundEnabled ? '🔊 Suara ON' : '🔇 Suara OFF';
    DOM.toggleSoundBtn.className = state.soundEnabled ? 'btn btn-success' : 'btn btn-warning';
}

// ============================================
// STATUS
// ============================================

function setStatus(type, text) {
    DOM.statusText.textContent = text;
    
    const colors = {
        online: '#00ff88',
        loading: '#ffa502',
        error: '#ff4757',
        paused: '#ffa502'
    };
    DOM.statusDot.style.background = colors[type] || '#888';
}

// ============================================
// HELPERS
// ============================================

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID').format(value || 0);
}

function formatTime(isoString) {
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    } catch {
        return isoString || '';
    }
}

function showToast(message) {
    DOM.toastMessage.textContent = message;
    DOM.toast.classList.add('show');
    clearTimeout(DOM.toast._timeout);
    DOM.toast._timeout = setTimeout(() => {
        DOM.toast.classList.remove('show');
    }, 3000);
}

function clearHistory() {
    if (confirm('Hapus semua history transaksi?')) {
        state.history = [];
        state.lastIds = new Set();
        state.newCount = 0;
        localStorage.setItem('geekzpay_history', JSON.stringify(state.history));
        renderTransactions();
        updateStats();
        if (navigator.clearAppBadge) {
            navigator.clearAppBadge();
        }
        showToast('🗑️ History dibersihkan');
    }
}
window.clearHistory = clearHistory;

// ============================================
// SERVICE WORKER
// ============================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/pwa/sw.js')
            .then(reg => console.log('✅ Service Worker registered:', reg))
            .catch(err => console.warn('❌ Service Worker registration failed:', err));
    }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') fetchData();
    if (e.key === 'm' || e.key === 'M') toggleSound();
});

// ============================================
// START
// ============================================

// Jalankan saat DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}