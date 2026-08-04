/**
 * GeekzPay PWA Monitor
 * Menggunakan SSE (Server-Sent Events) untuk real-time
 * Dengan Statistik Harian, Bulanan, dan Grafik
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_BASE: 'https://restapi.amgeekz.my.id',
    MAX_HISTORY: 200,
    RECONNECT_DELAY: 3000
};

// ============================================
// STATE
// ============================================
const state = {
    token: localStorage.getItem('geekzpay_token') || '',
    soundEnabled: localStorage.getItem('geekzpay_sound') !== 'false',
    soundType: localStorage.getItem('geekzpay_sound_type') || 'dana',
    soundVolume: parseFloat(localStorage.getItem('geekzpay_sound_volume')) || 0.8,
    ttsEnabled: localStorage.getItem('geekzpay_tts') !== 'false',
    history: JSON.parse(localStorage.getItem('geekzpay_history') || '[]'),
    lastIds: new Set(JSON.parse(localStorage.getItem('geekzpay_last_ids') || '[]')),
    newCount: parseInt(localStorage.getItem('geekzpay_new_count')) || 0,
    eventSource: null,
    isConnected: false,
    audioContext: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    isProcessing: false,
    processedEvents: new Set(),
    // ===== STATISTIK =====
    stats: JSON.parse(localStorage.getItem('geekzpay_stats') || '{"daily":{},"monthly":{},"total":0,"totalAmount":0}')
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
    // Statistik
    todayCount: document.getElementById('todayCount'),
    todayAmount: document.getElementById('todayAmount'),
    monthCount: document.getElementById('monthCount'),
    monthAmount: document.getElementById('monthAmount'),
    allCount: document.getElementById('allCount'),
    allAmount: document.getElementById('allAmount'),
    chartContainer: document.getElementById('chartContainer'),
    transactionList: document.getElementById('transactionList'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    toggleSoundBtn: document.getElementById('toggleSoundBtn'),
    toggleTtsBtn: document.getElementById('toggleTtsBtn'),
    sound: document.getElementById('notificationSound'),
    permissionBanner: document.getElementById('permissionBanner')
};

// ============================================
// SAVE STATE KE LOCALSTORAGE
// ============================================
function saveState() {
    localStorage.setItem('geekzpay_history', JSON.stringify(state.history));
    localStorage.setItem('geekzpay_last_ids', JSON.stringify([...state.lastIds]));
    localStorage.setItem('geekzpay_new_count', String(state.newCount));
    localStorage.setItem('geekzpay_stats', JSON.stringify(state.stats));
}

// ============================================
// STATISTIK FUNCTIONS
// ============================================

/** Dapatkan key untuk hari ini (YYYY-MM-DD) */
function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

/** Dapatkan key untuk bulan ini (YYYY-MM) */
function getMonthKey() {
    return new Date().toISOString().slice(0, 7);
}

/** Update statistik dengan transaksi baru */
function updateStats(amount) {
    const today = getTodayKey();
    const month = getMonthKey();
    
    // Inisialisasi jika belum ada
    if (!state.stats.daily[today]) {
        state.stats.daily[today] = { count: 0, amount: 0 };
    }
    if (!state.stats.monthly[month]) {
        state.stats.monthly[month] = { count: 0, amount: 0 };
    }
    
    // Update harian
    state.stats.daily[today].count += 1;
    state.stats.daily[today].amount += amount;
    
    // Update bulanan
    state.stats.monthly[month].count += 1;
    state.stats.monthly[month].amount += amount;
    
    // Update total
    state.stats.total += 1;
    state.stats.totalAmount += amount;
    
    // Simpan
    saveState();
}

/** Hitung statistik dari history (untuk initial load) */
function calculateStatsFromHistory() {
    const today = getTodayKey();
    const month = getMonthKey();
    
    // Reset statistik
    state.stats.daily = {};
    state.stats.monthly = {};
    state.stats.total = 0;
    state.stats.totalAmount = 0;
    
    state.history.forEach(item => {
        const date = new Date(item.time);
        const dayKey = date.toISOString().slice(0, 10);
        const monthKey = date.toISOString().slice(0, 7);
        const amount = item.amount || 0;
        
        // Harian
        if (!state.stats.daily[dayKey]) {
            state.stats.daily[dayKey] = { count: 0, amount: 0 };
        }
        state.stats.daily[dayKey].count += 1;
        state.stats.daily[dayKey].amount += amount;
        
        // Bulanan
        if (!state.stats.monthly[monthKey]) {
            state.stats.monthly[monthKey] = { count: 0, amount: 0 };
        }
        state.stats.monthly[monthKey].count += 1;
        state.stats.monthly[monthKey].amount += amount;
        
        // Total
        state.stats.total += 1;
        state.stats.totalAmount += amount;
    });
    
    saveState();
}

/** Render statistik ke UI */
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

/** Render grafik 7 hari terakhir */
function renderChart() {
    const container = DOM.chartContainer;
    if (!container) return;
    
    // Get last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('id-ID', { weekday: 'short' });
        days.push({
            key: key,
            label: label,
            count: state.stats.daily[key]?.count || 0,
            amount: state.stats.daily[key]?.amount || 0
        });
    }
    
    // Cek apakah ada data
    const hasData = days.some(d => d.count > 0);
    
    if (!hasData) {
        container.innerHTML = `<div class="chart-empty">Belum ada data 7 hari terakhir</div>`;
        return;
    }
    
    // Cari max untuk skala
    const maxCount = Math.max(...days.map(d => d.count), 1);
    
    let html = '';
    days.forEach(day => {
        const heightPercent = (day.count / maxCount) * 100;
        const barHeight = Math.max(heightPercent, 4); // minimal 4px
        const isToday = day.key === getTodayKey();
        
        html += `
            <div class="chart-bar-wrapper">
                <div class="chart-bar-value">${day.count > 0 ? day.count : ''}</div>
                <div class="chart-bar" style="height: ${barHeight}%; background: ${isToday ? '#ff4088' : '#00c853'};"></div>
                <div class="chart-bar-label">${day.label}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// INIT
// ============================================
function init() {
    if (state.token) {
        DOM.tokenInput.value = state.token;
        connectSSE();
    } else {
        DOM.tokenInput.value = '';
        DOM.tokenInput.placeholder = 'Masukkan Token GeekzPay...';
        setStatus('paused', 'Waiting Token');
        DOM.statusDot.style.background = '#ffa502';
        showToast('◆ Masukkan token terlebih dahulu');
    }
    
    // ===== Hitung statistik dari history =====
    calculateStatsFromHistory();
    
    updateSoundUI();
    renderTransactions();
    updateStats();
    renderStats();
    renderChart();
    registerServiceWorker();
    checkNotificationPermission();
    
    console.log('◆ GeekzPay Monitor PWA loaded (SSE Mode)');
    console.log(`◆ LastIds: ${state.lastIds.size} entries`);
    console.log(`◆ Total transaksi: ${state.stats.total}`);
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
// SSE - CONNECT
// ============================================
function connectSSE() {
    if (!state.token) {
        showToast('⊘ Masukkan token terlebih dahulu');
        return;
    }

    if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
    }

    setStatus('loading', 'Connecting...');
    DOM.statusDot.style.background = '#ffa502';

    const url = `${CONFIG.API_BASE}/pwa/events?token=${encodeURIComponent(state.token)}`;
    
    try {
        state.eventSource = new EventSource(url);
        
        state.eventSource.onopen = () => {
            console.log('◆ SSE Connected');
            setStatus('online', 'Live');
            DOM.statusDot.style.background = '#00c853';
            state.isConnected = true;
            state.reconnectAttempts = 0;
            showToast('◆ Terhubung ke server real-time');
            fetchHistory();
        };

        state.eventSource.addEventListener('payment', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('◆ Payment received:', data);
                
                const eventId = data.event_id || data.id;
                if (eventId) {
                    if (state.processedEvents.has(eventId)) {
                        console.log('⊘ Event sudah diproses (memory):', eventId);
                        return;
                    }
                    if (state.lastIds.has(eventId)) {
                        console.log('⊘ Event sudah diproses (storage):', eventId);
                        return;
                    }
                    state.processedEvents.add(eventId);
                }
                
                processPayment(data);
            } catch (e) {
                console.error('Error parsing payment data:', e);
            }
        });

        state.eventSource.onerror = (error) => {
            console.warn('⊘ SSE Error:', error);
            state.isConnected = false;
            state.eventSource.close();
            state.eventSource = null;
            
            setStatus('error', 'Disconnected');
            DOM.statusDot.style.background = '#ff1744';
            
            if (state.reconnectAttempts < state.maxReconnectAttempts) {
                state.reconnectAttempts++;
                const delay = CONFIG.RECONNECT_DELAY * Math.min(state.reconnectAttempts, 5);
                console.log(`◆ Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts})`);
                setTimeout(connectSSE, delay);
            } else {
                showToast('⊘ Gagal terhubung ke server, refresh halaman');
            }
        };

    } catch (error) {
        console.error('⊘ Failed to create SSE connection:', error);
        setStatus('error', 'Connection Failed');
        showToast('⊘ Gagal terhubung ke server');
    }
}

// ============================================
// PROCESS PAYMENT
// ============================================
function processPayment(data) {
    if (state.isProcessing) {
        console.log('⊘ Still processing, skipping...');
        return;
    }
    state.isProcessing = true;
    
    try {
        const id = data.event_id || data.id || Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        
        if (state.lastIds.has(id)) {
            console.log('⊘ Duplicate detected (final check):', id);
            state.isProcessing = false;
            return;
        }
        
        state.lastIds.add(id);
        state.processedEvents.add(id);
        
        const amount = data.amount || 0;
        const message = data.message || data.body?.message || 'Pembayaran masuk';
        
        const entry = {
            id: id,
            amount: amount,
            time: data.received_at || new Date().toISOString(),
            message: message,
            raw: data
        };
        
        state.history.unshift(entry);
        if (state.history.length > CONFIG.MAX_HISTORY) {
            state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
        }
        state.newCount += 1;
        
        // ===== UPDATE STATISTIK =====
        updateStats(amount);
        
        saveState();
        
        // NOTIFIKASI
        if (state.soundEnabled) {
            playNotificationSound();
        }
        
        if (state.ttsEnabled) {
            speakPayment(amount);
        }
        
        showToast(`◆ Pembayaran Rp ${formatRupiah(amount)} masuk`);
        sendPushNotification(entry);
        
        // ===== UPDATE UI =====
        renderTransactions();
        updateStats();
        renderStats();
        renderChart();
        updateBadge();
        
        console.log(`◆ Processed payment: ${id} - Rp ${formatRupiah(amount)}`);
        
    } catch (error) {
        console.error('Error processing payment:', error);
    } finally {
        state.isProcessing = false;
    }
}

// ============================================
// FETCH HISTORY
// ============================================
function fetchHistory() {
    if (!state.token) return;
    
    console.log('◆ Fetching history...');
    
    fetch(`${CONFIG.API_BASE}/webhook/status?token=${encodeURIComponent(state.token)}&limit=50`)
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => {
            const items = Array.isArray(data?.data) ? data.data : [];
            console.log(`◆ Got ${items.length} items from history`);
            
            let newItems = 0;
            
            items.forEach(item => {
                const id = item.event_id || item.id;
                if (!id) return;
                
                if (state.lastIds.has(id)) {
                    return;
                }
                
                state.lastIds.add(id);
                state.processedEvents.add(id);
                newItems++;
                
                const amount = item.amount || 0;
                state.history.unshift({
                    id: id,
                    amount: amount,
                    time: item.received_at || new Date().toISOString(),
                    message: item.body?.message || 'Pembayaran masuk',
                    raw: item
                });
                
                // ===== UPDATE STATISTIK =====
                updateStats(amount);
            });
            
            if (newItems > 0) {
                if (state.history.length > CONFIG.MAX_HISTORY) {
                    state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
                }
                saveState();
                renderTransactions();
                updateStats();
                renderStats();
                renderChart();
                console.log(`◆ Added ${newItems} new items from history`);
            }
        })
        .catch(err => {
            console.warn('⊘ Gagal fetch history:', err);
        });
}
window.fetchHistory = fetchHistory;

// ============================================
// SAVE TOKEN
// ============================================
function saveToken() {
    const newToken = DOM.tokenInput.value.trim();
    if (!newToken) {
        showToast('⊘ Token tidak boleh kosong');
        DOM.tokenInput.focus();
        return;
    }
    
    state.token = newToken;
    localStorage.setItem('geekzpay_token', state.token);
    showToast('◆ Token berhasil disimpan');
    
    // Reset state untuk token baru
    state.lastIds = new Set();
    state.processedEvents = new Set();
    state.history = [];
    state.newCount = 0;
    state.stats = { daily: {}, monthly: {}, total: 0, totalAmount: 0 };
    saveState();
    
    renderTransactions();
    updateStats();
    renderStats();
    renderChart();
    
    connectSSE();
}
window.saveToken = saveToken;

// ============================================
// CLEAR HISTORY
// ============================================
function clearHistory() {
    if (!confirm('Hapus semua history transaksi?')) return;
    
    state.history = [];
    state.lastIds = new Set();
    state.processedEvents = new Set();
    state.newCount = 0;
    state.stats = { daily: {}, monthly: {}, total: 0, totalAmount: 0 };
    
    saveState();
    
    renderTransactions();
    updateStats();
    renderStats();
    renderChart();
    updateBadge();
    
    if (navigator.clearAppBadge) {
        navigator.clearAppBadge();
    }
    
    showToast('◆ History & statistik dibersihkan');
    console.log('◆ History cleared, stats reset');
}
window.clearHistory = clearHistory;

// ============================================
// NOTIFICATION SOUND
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
                    gain.gain.exponentialRampToValueAtTime(volume * 0.4, now + 0.01);
                    gain.gain.exponentialRampToValueAtTime(volume * 0.01, now + beep.duration);
                    
                    osc.start(now);
                    osc.stop(now + beep.duration);
                    
                    if (state.soundType === 'dana') {
                        const bufferSize = ctx.sampleRate * 0.015;
                        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                        const data = buffer.getChannelData(0);
                        for (let i = 0; i < bufferSize; i++) {
                            data[i] = (Math.random() * 2 - 1) * 0.04;
                        }
                        const noise = ctx.createBufferSource();
                        noise.buffer = buffer;
                        const noiseGain = ctx.createGain();
                        noiseGain.gain.value = volume * 0.1;
                        noise.connect(noiseGain);
                        noiseGain.connect(ctx.destination);
                        noise.start(now);
                        noise.stop(now + beep.duration);
                    }
                } catch (e) { /* ignore */ }
            }, beep.delay * 1000);
        });

    } catch (e) {
        try {
            DOM.sound.currentTime = 0;
            DOM.sound.volume = state.soundVolume;
            DOM.sound.play().catch(() => {});
        } catch (err) {
            console.warn('Sound not supported');
        }
    }
}

// ============================================
// TEXT-TO-SPEECH
// ============================================
function speakPayment(amount) {
    if (!state.ttsEnabled) return;
    
    try {
        if (!('speechSynthesis' in window)) {
            console.warn('TTS not supported');
            return;
        }
        
        const rupiah = formatRupiah(amount);
        const text = `Pembayaran masuk Rp ${rupiah}`;
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = state.soundVolume;
        
        const voices = window.speechSynthesis.getVoices();
        const indonesianVoice = voices.find(v => v.lang.startsWith('id'));
        if (indonesianVoice) {
            utterance.voice = indonesianVoice;
        }
        
        window.speechSynthesis.speak(utterance);
        console.log(`◆ TTS: "${text}"`);
        
    } catch (e) {
        console.warn('TTS error:', e);
    }
}

// ============================================
// TOGGLE FUNCTIONS
// ============================================
function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('geekzpay_sound', String(state.soundEnabled));
    updateSoundUI();
    showToast(state.soundEnabled ? '◆ Suara diaktifkan' : '⊘ Suara dimatikan');
}
window.toggleSound = toggleSound;

function toggleTts() {
    state.ttsEnabled = !state.ttsEnabled;
    localStorage.setItem('geekzpay_tts', String(state.ttsEnabled));
    updateSoundUI();
    showToast(state.ttsEnabled ? '◆ Voice ON' : '⊘ Voice OFF');
    if (state.ttsEnabled) {
        speakPayment(10000);
    }
}
window.toggleTts = toggleTts;

function testSound() {
    playNotificationSound();
    setTimeout(() => {
        speakPayment(8500);
    }, 500);
}
window.testSound = testSound;

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
    if (DOM.toggleSoundBtn) {
        DOM.toggleSoundBtn.textContent = state.soundEnabled ? '♫ Suara ON' : '♫ Suara OFF';
        DOM.toggleSoundBtn.className = state.soundEnabled ? 'neo-btn neo-btn-success' : 'neo-btn neo-btn-warning';
    }
    
    if (DOM.toggleTtsBtn) {
        DOM.toggleTtsBtn.textContent = state.ttsEnabled ? '🔊 Voice ON' : '🔊 Voice OFF';
        DOM.toggleTtsBtn.className = state.ttsEnabled ? 'neo-btn neo-btn-success' : 'neo-btn neo-btn-warning';
    }
    
    document.querySelectorAll('.sound-type-btn').forEach(btn => {
        const type = btn.dataset.sound;
        btn.classList.toggle('active', type === state.soundType);
    });
    
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
            const rupiah = formatRupiah(entry.amount);
            new Notification('◆ Pembayaran Masuk', {
                body: `Rp ${rupiah} - ${entry.message}`,
                icon: '/icon128.png',
                badge: '/icon48.png',
                vibrate: [200, 100, 200, 100, 300],
                requireInteraction: true,
                tag: 'payment-' + entry.id,
                silent: false
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
                <small>Masukkan token dan tunggu notifikasi real-time</small>
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
    if (e.key === 'h' || e.key === 'H') fetchHistory();
    if (e.key === 'm' || e.key === 'M') toggleSound();
    if (e.key === 't' || e.key === 'T') toggleTts();
    if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active === DOM.tokenInput) {
            saveToken();
        }
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