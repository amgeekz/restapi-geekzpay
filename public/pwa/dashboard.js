/**
 * GeekzPay PWA Monitor
 * Dashboard untuk monitoring pembayaran real-time
 * Versi Profesional - Simbol Semua
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_BASE: 'https://restapi.amgeekz.my.id',
    POLLING_INTERVAL: 2000,
    MAX_HISTORY: 100,
    DEFAULT_TOKEN: '727e391bee5756aebc03084e04e0c9f229666b58542e169b49f419ad0904a297'
};

// ============================================
// STATE
// ============================================
const state = {
    token: localStorage.getItem('geekzpay_token') || CONFIG.DEFAULT_TOKEN,
    soundEnabled: localStorage.getItem('geekzpay_sound') !== 'false',
    soundType: localStorage.getItem('geekzpay_sound_type') || 'dana',
    soundVolume: parseFloat(localStorage.getItem('geekzpay_sound_volume')) || 0.7,
    history: JSON.parse(localStorage.getItem('geekzpay_history') || '[]'),
    lastIds: new Set(),
    newCount: 0,
    pollingInterval: null,
    isPolling: true,
    audioContext: null
};

// ============================================
// SOUND CONFIGURATION
// ============================================
const SOUNDS = {
    dana: {
        label: 'DANA',
        beeps: [
            { freq: 880, duration: 0.08, delay: 0 },
            { freq: 1100, duration: 0.06, delay: 0.1 },
            { freq: 1320, duration: 0.1, delay: 0.18 }
        ]
    },
    cash_register: {
        label: 'Kasir',
        beeps: [
            { freq: 1200, duration: 0.08, delay: 0 },
            { freq: 800, duration: 0.08, delay: 0.12 },
            { freq: 1400, duration: 0.1, delay: 0.25 },
            { freq: 1000, duration: 0.12, delay: 0.38 }
        ]
    },
    ding_dong: {
        label: 'Bel',
        beeps: [
            { freq: 880, duration: 0.15, delay: 0 },
            { freq: 1100, duration: 0.2, delay: 0.2 }
        ]
    },
    success: {
        label: 'Sukses',
        beeps: [
            { freq: 523, duration: 0.1, delay: 0 },
            { freq: 659, duration: 0.1, delay: 0.12 },
            { freq: 784, duration: 0.15, delay: 0.25 }
        ]
    }
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
    sound: document.getElementById('notificationSound'),
    permissionBanner: document.getElementById('permissionBanner')
};

// ============================================
// INIT
// ============================================
function init() {
    DOM.tokenInput.value = state.token;
    updateSoundUI();
    renderTransactions();
    updateStats();
    startPolling();
    registerServiceWorker();
    checkNotificationPermission();
    console.log('◆ GeekzPay Monitor PWA loaded');
    console.log('⌘ Shortcuts: R = Refresh, M = Toggle Sound');
}

// ============================================
// NOTIFICATION PERMISSION
// ============================================
function checkNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            DOM.permissionBanner.style.display = 'flex';
        } else if (Notification.permission === 'granted') {
            DOM.permissionBanner.style.display = 'none';
        }
    }
}

function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                DOM.permissionBanner.style.display = 'none';
                showToast('◆ Notifikasi diizinkan');
            } else {
                showToast('⊘ Notifikasi tidak diizinkan');
            }
        });
    }
}
window.requestNotificationPermission = requestNotificationPermission;

// ============================================
// CORE FUNCTIONS
// ============================================

function saveToken() {
    const newToken = DOM.tokenInput.value.trim();
    if (!newToken) {
        showToast('⊘ Token tidak boleh kosong');
        return;
    }
    state.token = newToken;
    localStorage.setItem('geekzpay_token', state.token);
    showToast('◆ Token berhasil disimpan');
    fetchData();
}
window.saveToken = saveToken;

async function fetchData() {
    if (!state.token) {
        showToast('⊘ Masukkan token terlebih dahulu');
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
        showToast('⊘ Gagal mengambil data: ' + error.message);
    }
}
window.fetchData = fetchData;

function normalizeData(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.events)) return data.events;
    return data ? [data] : [];
}

function processNewData(items) {
    let newItems = 0;
    
    items.forEach(item => {
        const id = extractId(item);
        
        if (!state.lastIds.has(id)) {
            state.lastIds.add(id);
            newItems++;
            
            const entry = {
                id: id,
                amount: parseAmount(item.amount || item.body?.amount || 0),
                time: item.received_at || item.time || item.created_at || new Date().toISOString(),
                message: extractMessage(item),
                raw: item
            };
            
            state.history.unshift(entry);
            
            if (state.soundEnabled) {
                playNotificationSound();
            }
            showToast(`◆ Pembayaran Rp ${formatRupiah(entry.amount)} masuk`);
            
            // Kirim notifikasi push
            sendPushNotification(entry);
        }
    });
    
    if (newItems > 0) {
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

function extractId(item) {
    return item.id || item.event_id || item._id || 
           item.body?.id || item.body?.event_id || 
           Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

function extractMessage(item) {
    return item.message || item.body?.message || 
           item.body?.text || item.body?.raw || 
           'Pembayaran masuk';
}

function parseAmount(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = String(value).replace(/[^\d]/g, '');
    return parseInt(cleaned) || 0;
}

// ============================================
// NOTIFICATION SOUND - DANA STYLE
// ============================================
function playNotificationSound() {
    if (!state.soundEnabled) return;

    try {
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const ctx = state.audioContext;
        const config = SOUNDS[state.soundType] || SOUNDS.dana;
        const volume = state.soundVolume;

        config.beeps.forEach((beep, index) => {
            setTimeout(() => {
                try {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    
                    osc.frequency.value = beep.freq;
                    osc.type = 'sine';
                    
                    const now = ctx.currentTime;
                    gain.gain.setValueAtTime(0.01, now);
                    gain.gain.exponentialRampToValueAtTime(volume * 0.35, now + 0.01);
                    gain.gain.exponentialRampToValueAtTime(volume * 0.01, now + beep.duration);
                    
                    osc.start(now);
                    osc.stop(now + beep.duration);
                    
                    // Efek tambahan untuk suara DANA
                    if (state.soundType === 'dana') {
                        const bufferSize = ctx.sampleRate * 0.015;
                        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                        const data = buffer.getChannelData(0);
                        for (let i = 0; i < bufferSize; i++) {
                            data[i] = (Math.random() * 2 - 1) * 0.03;
                        }
                        const noise = ctx.createBufferSource();
                        noise.buffer = buffer;
                        const noiseGain = ctx.createGain();
                        noiseGain.gain.value = volume * 0.08;
                        noise.connect(noiseGain);
                        noiseGain.connect(ctx.destination);
                        noise.start(now);
                        noise.stop(now + beep.duration);
                    }
                } catch (e) { /* ignore */ }
            }, beep.delay * 1000);
        });

    } catch (e) {
        // Fallback
        try {
            DOM.sound.currentTime = 0;
            DOM.sound.volume = state.soundVolume;
            DOM.sound.play().catch(() => {});
        } catch (err) {
            console.warn('Sound not supported');
        }
    }
}

function testSound() {
    playNotificationSound();
}
window.testSound = testSound;

function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('geekzpay_sound', String(state.soundEnabled));
    updateSoundUI();
    showToast(state.soundEnabled ? '◆ Suara diaktifkan' : '⊘ Suara dimatikan');
}
window.toggleSound = toggleSound;

function changeSoundType(type) {
    if (SOUNDS[type]) {
        state.soundType = type;
        localStorage.setItem('geekzpay_sound_type', type);
        updateSoundUI();
        testSound();
        showToast(`◆ Suara: ${SOUNDS[type].label}`);
    }
}
window.changeSoundType = changeSoundType;

function changeSoundVolume(value) {
    state.soundVolume = parseFloat(value);
    localStorage.setItem('geekzpay_sound_volume', String(state.soundVolume));
    updateSoundUI();
}
window.changeSoundVolume = changeSoundVolume;

function updateSoundUI() {
    // Update button
    if (DOM.toggleSoundBtn) {
        DOM.toggleSoundBtn.textContent = state.soundEnabled ? '♫ Suara ON' : '♫ Suara OFF';
        DOM.toggleSoundBtn.className = state.soundEnabled ? 'neo-btn neo-btn-success' : 'neo-btn neo-btn-warning';
    }
    
    // Update sound type buttons
    document.querySelectorAll('.sound-type-btn').forEach(btn => {
        const type = btn.dataset.sound;
        btn.classList.toggle('active', type === state.soundType);
    });
    
    // Update volume slider
    const slider = document.getElementById('soundVolume');
    if (slider) {
        slider.value = state.soundVolume;
    }
    const volLabel = document.getElementById('soundVolumeLabel');
    if (volLabel) {
        volLabel.textContent = `${Math.round(state.soundVolume * 100)}%`;
    }
}

// ============================================
// PUSH NOTIFICATION
// ============================================
function sendPushNotification(entry) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification('◆ Pembayaran Masuk', {
                body: `Rp ${formatRupiah(entry.amount)} - ${entry.message}`,
                icon: '/icon128.png',
                badge: '/icon128.png',
                vibrate: [200, 100, 200],
                requireInteraction: true,
                tag: 'payment-' + entry.id
            });
        } catch (e) { /* ignore */ }
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderTransactions() {
    if (state.history.length === 0) {
        DOM.transactionList.innerHTML = `
            <div class="empty-state neo-card">
                <div class="empty-icon">⊘</div>
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

function updateStats() {
    const total = state.history.length;
    const totalAmt = state.history.reduce((sum, item) => sum + (item.amount || 0), 0);
    
    DOM.totalCount.textContent = total;
    DOM.totalAmount.textContent = `Rp ${formatRupiah(totalAmt)}`;
    DOM.newCount.textContent = state.newCount;
}

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
    fetchData();
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
// STATUS
// ============================================

function setStatus(type, text) {
    DOM.statusText.textContent = text;
    const colors = {
        online: '#00c853',
        loading: '#ffa502',
        error: '#ff1744',
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
        showToast('◆ History dibersihkan');
    }
}
window.clearHistory = clearHistory;

// ============================================
// SERVICE WORKER
// ============================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/pwa/sw.js')
            .then(reg => console.log('◆ Service Worker registered:', reg))
            .catch(err => console.warn('⊘ Service Worker registration failed:', err));
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}