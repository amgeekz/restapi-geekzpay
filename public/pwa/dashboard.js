/**
 * GeekzPay PWA Monitor
 * SSE Real-time dengan Auto Reconnect + Fallback Polling
 * Versi Lengkap - 2026
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_BASE: 'https://restapi.amgeekz.my.id',
    MAX_HISTORY: 200,
    SSE_RECONNECT_DELAY: 3000,
    SSE_MAX_RETRIES: 20,
    POLLING_INTERVAL: 5000,
    HEARTBEAT_TIMEOUT: 20000
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
    stats: JSON.parse(localStorage.getItem('geekzpay_stats') || '{"daily":{},"monthly":{},"total":0,"totalAmount":0}'),
    
    // SSE
    eventSource: null,
    isConnected: false,
    reconnectAttempts: 0,
    isProcessing: false,
    processedEvents: new Set(),
    reconnectTimer: null,
    heartbeatTimer: null,
    lastHeartbeat: Date.now(),
    
    // Fallback Polling
    pollingInterval: null,
    isPolling: false,
    useFallback: false
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
function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getMonthKey() {
    return new Date().toISOString().slice(0, 7);
}

function updateStats(amount) {
    const today = getTodayKey();
    const month = getMonthKey();
    
    if (!state.stats.daily[today]) {
        state.stats.daily[today] = { count: 0, amount: 0 };
    }
    if (!state.stats.monthly[month]) {
        state.stats.monthly[month] = { count: 0, amount: 0 };
    }
    
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
        
        if (!state.stats.daily[dayKey]) {
            state.stats.daily[dayKey] = { count: 0, amount: 0 };
        }
        if (!state.stats.monthly[monthKey]) {
            state.stats.monthly[monthKey] = { count: 0, amount: 0 };
        }
        
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
                <div class="chart-bar" style="height: ${height}%; background: ${isToday ? '#ff4088' : '#00c853'};"></div>
                <div class="chart-bar-label">${day.label}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// INIT
// ============================================
function init() {
    if (state.token) {
        DOM.tokenInput.value = state.token;
        startSSE();
    } else {
        DOM.tokenInput.value = '';
        setStatus('paused', 'Waiting Token');
        DOM.statusDot.style.background = '#ffa502';
        showToast('◆ Masukkan token terlebih dahulu');
    }
    
    calculateStatsFromHistory();
    updateSoundUI();
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    registerServiceWorker();
    checkNotificationPermission();
    
    console.log('◆ GeekzPay Monitor loaded');
    console.log('◆ Mode: SSE + Fallback Polling');
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
                showToast('◆ Notifikasi diizinkan');
            }
        });
    }
}
window.requestNotificationPermission = requestNotificationPermission;

// ============================================
// SSE - START
// ============================================
function startSSE() {
    // Matikan polling jika aktif
    stopPolling();
    
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
    state.useFallback = false;
    state.reconnectAttempts = 0;

    const url = `${CONFIG.API_BASE}/pwa/events?token=${encodeURIComponent(state.token)}`;
    
    try {
        state.eventSource = new EventSource(url);
        
        // ===== ON OPEN =====
        state.eventSource.onopen = () => {
            console.log('◆ SSE Connected');
            setStatus('online', 'Live');
            DOM.statusDot.style.background = '#00c853';
            state.isConnected = true;
            state.reconnectAttempts = 0;
            state.lastHeartbeat = Date.now();
            showToast('◆ Terhubung ke server');
            
            // Ambil history
            setTimeout(fetchHistory, 1000);
            
            // Monitor heartbeat
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = setInterval(() => {
                const elapsed = Date.now() - state.lastHeartbeat;
                if (elapsed > CONFIG.HEARTBEAT_TIMEOUT && state.isConnected) {
                    console.warn('⊘ Heartbeat timeout, reconnecting...');
                    state.isConnected = false;
                    if (state.eventSource) {
                        state.eventSource.close();
                        state.eventSource = null;
                    }
                    reconnectSSE();
                }
            }, 5000);
        };

        // ===== EVENT: CONNECTED =====
        state.eventSource.addEventListener('connected', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('◆ SSE confirmed:', data);
                state.lastHeartbeat = Date.now();
            } catch (e) {}
        });

        // ===== EVENT: PING (heartbeat) =====
        state.eventSource.addEventListener('ping', (event) => {
            state.lastHeartbeat = Date.now();
        });

        // ===== EVENT: PAYMENT =====
        state.eventSource.addEventListener('payment', (event) => {
            try {
                const data = JSON.parse(event.data);
                state.lastHeartbeat = Date.now();
                console.log('◆ Payment received via SSE:', data);
                
                const eventId = data.event_id || data.id;
                if (!eventId) {
                    console.warn('⊘ No event_id in payment data');
                    return;
                }
                
                // Cek duplikat
                if (state.processedEvents.has(eventId)) {
                    console.log('⊘ Event already processed:', eventId);
                    return;
                }
                if (state.lastIds.has(eventId)) {
                    console.log('⊘ Event already in history:', eventId);
                    return;
                }
                
                state.processedEvents.add(eventId);
                processPayment(data);
                
            } catch (e) {
                console.error('Error parsing payment data:', e);
            }
        });

        // ===== ON ERROR =====
        state.eventSource.onerror = (error) => {
            console.warn('⊘ SSE Error:', error);
            state.isConnected = false;
            if (state.eventSource) {
                state.eventSource.close();
                state.eventSource = null;
            }
            
            setStatus('error', 'Disconnected');
            DOM.statusDot.style.background = '#ff1744';
            
            // Auto reconnect
            reconnectSSE();
        };

    } catch (error) {
        console.error('⊘ SSE Failed:', error);
        setStatus('error', 'Connection Failed');
        startPollingFallback();
    }
}

// ============================================
// RECONNECT SSE
// ============================================
function reconnectSSE() {
    if (state.reconnectAttempts >= CONFIG.SSE_MAX_RETRIES) {
        console.warn('⊘ SSE max retries reached, switching to polling');
        startPollingFallback();
        return;
    }
    
    state.reconnectAttempts++;
    const delay = Math.min(CONFIG.SSE_RECONNECT_DELAY * Math.pow(1.5, state.reconnectAttempts - 1), 30000);
    
    console.log(`◆ Reconnect attempt ${state.reconnectAttempts} in ${delay}ms`);
    setStatus('loading', `Reconnect ${state.reconnectAttempts}...`);
    DOM.statusDot.style.background = '#ffa502';
    
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(() => {
        if (!state.isConnected) {
            startSSE();
        }
    }, delay);
}

// ============================================
// FALLBACK: POLLING
// ============================================
function startPollingFallback() {
    if (state.pollingInterval) return;
    
    state.useFallback = true;
    state.isPolling = true;
    setStatus('loading', 'Polling Mode');
    DOM.statusDot.style.background = '#ffa502';
    showToast('◆ Mode polling aktif');
    console.log('◆ Fallback polling started');
    
    // Polling immediately
    pollData();
    
    // Polling setiap 5 detik
    state.pollingInterval = setInterval(pollData, CONFIG.POLLING_INTERVAL);
}

function stopPolling() {
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = null;
        state.isPolling = false;
        state.useFallback = false;
        console.log('◆ Polling stopped');
    }
}

async function pollData() {
    if (!state.token) return;
    
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
                state.processedEvents.add(id);
                newItems++;
                const amount = item.amount || 0;
                state.history.unshift({
                    id, amount,
                    time: item.received_at || new Date().toISOString(),
                    message: item.body?.message || 'Pembayaran masuk',
                    raw: item
                });
                updateStats(amount);
                
                // Notifikasi tetap jalan
                if (state.soundEnabled) playNotificationSound();
                if (state.ttsEnabled) speakPayment(amount);
                showToast(`◆ Pembayaran Rp ${formatRupiah(amount)} masuk`);
                sendPushNotification({ id, amount, message: item.body?.message || 'Pembayaran masuk' });
            }
        });
        
        if (newItems > 0) {
            if (state.history.length > CONFIG.MAX_HISTORY) {
                state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
            }
            saveState();
            renderTransactions();
            updateStatsUI();
            renderStats();
            renderChart();
            updateBadge();
            console.log(`◆ Polling: ${newItems} new items`);
        }
        
        setStatus('online', 'Polling');
        DOM.statusDot.style.background = '#ffa502';
        
    } catch (error) {
        console.warn('⊘ Polling error:', error);
    }
}

// ============================================
// PROCESS PAYMENT
// ============================================
function processPayment(data) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    
    try {
        const id = data.event_id || data.id || Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        if (state.lastIds.has(id)) {
            state.isProcessing = false;
            return;
        }
        
        state.lastIds.add(id);
        state.processedEvents.add(id);
        
        const amount = data.amount || 0;
        const entry = {
            id, amount,
            time: data.received_at || new Date().toISOString(),
            message: data.message || data.body?.message || 'Pembayaran masuk',
            raw: data
        };
        
        state.history.unshift(entry);
        if (state.history.length > CONFIG.MAX_HISTORY) {
            state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
        }
        state.newCount += 1;
        
        updateStats(amount);
        saveState();
        
        if (state.soundEnabled) playNotificationSound();
        if (state.ttsEnabled) speakPayment(amount);
        
        showToast(`◆ Pembayaran Rp ${formatRupiah(amount)} masuk`);
        sendPushNotification(entry);
        
        renderTransactions();
        updateStatsUI();
        renderStats();
        renderChart();
        updateBadge();
        
        console.log(`◆ Payment processed: ${id} - Rp ${formatRupiah(amount)}`);
        
    } catch (e) {
        console.error('Process payment error:', e);
    } finally {
        state.isProcessing = false;
    }
}

// ============================================
// FETCH HISTORY
// ============================================
function fetchHistory() {
    if (!state.token) return;
    
    fetch(`${CONFIG.API_BASE}/webhook/status?token=${encodeURIComponent(state.token)}&limit=50`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            const items = Array.isArray(data?.data) ? data.data : [];
            let added = 0;
            
            items.forEach(item => {
                const id = item.event_id || item.id;
                if (id && !state.lastIds.has(id)) {
                    state.lastIds.add(id);
                    state.processedEvents.add(id);
                    added++;
                    const amount = item.amount || 0;
                    state.history.unshift({
                        id, amount,
                        time: item.received_at || new Date().toISOString(),
                        message: item.body?.message || 'Pembayaran masuk',
                        raw: item
                    });
                    updateStats(amount);
                }
            });
            
            if (added > 0) {
                if (state.history.length > CONFIG.MAX_HISTORY) {
                    state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
                }
                saveState();
                renderTransactions();
                updateStatsUI();
                renderStats();
                renderChart();
                console.log(`◆ Added ${added} items from history`);
            }
        })
        .catch(() => console.warn('⊘ Failed to fetch history'));
}
window.fetchHistory = fetchHistory;

// ============================================
// SAVE TOKEN
// ============================================
function saveToken() {
    const newToken = DOM.tokenInput.value.trim();
    if (!newToken) {
        showToast('⊘ Token tidak boleh kosong');
        return;
    }
    
    state.token = newToken;
    localStorage.setItem('geekzpay_token', state.token);
    showToast('◆ Token tersimpan');
    
    // Reset state untuk token baru
    state.lastIds = new Set();
    state.processedEvents = new Set();
    state.history = [];
    state.newCount = 0;
    state.stats = { daily: {}, monthly: {}, total: 0, totalAmount: 0 };
    saveState();
    
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    
    // Mulai SSE
    stopPolling();
    startSSE();
}
window.saveToken = saveToken;

// ============================================
// CLEAR HISTORY
// ============================================
function clearHistory() {
    if (!confirm('Hapus semua history & statistik?')) return;
    
    state.history = [];
    state.lastIds = new Set();
    state.processedEvents = new Set();
    state.newCount = 0;
    state.stats = { daily: {}, monthly: {}, total: 0, totalAmount: 0 };
    saveState();
    
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    updateBadge();
    if (navigator.clearAppBadge) navigator.clearAppBadge();
    
    showToast('◆ Data dibersihkan');
}
window.clearHistory = clearHistory;

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
        
        config.beeps.forEach((beep, i) => {
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
                        const bufSize = ctx.sampleRate * 0.015;
                        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
                        const data = buf.getChannelData(0);
                        for (let j = 0; j < bufSize; j++) {
                            data[j] = (Math.random() * 2 - 1) * 0.04;
                        }
                        const noise = ctx.createBufferSource();
                        noise.buffer = buf;
                        const ng = ctx.createGain();
                        ng.gain.value = volume * 0.1;
                        noise.connect(ng);
                        ng.connect(ctx.destination);
                        noise.start(now);
                        noise.stop(now + beep.duration);
                    }
                } catch (e) {}
            }, beep.delay * 1000);
        });
    } catch (e) {
        try {
            DOM.sound.currentTime = 0;
            DOM.sound.volume = state.soundVolume;
            DOM.sound.play();
        } catch (err) {}
    }
}

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
    updateSoundUI();
    showToast(state.soundEnabled ? '◆ Suara ON' : '⊘ Suara OFF');
}
window.toggleSound = toggleSound;

function toggleTts() {
    state.ttsEnabled = !state.ttsEnabled;
    localStorage.setItem('geekzpay_tts', String(state.ttsEnabled));
    updateSoundUI();
    showToast(state.ttsEnabled ? '◆ Voice ON' : '⊘ Voice OFF');
    if (state.ttsEnabled) speakPayment(10000);
}
window.toggleTts = toggleTts;

function testSound() {
    playNotificationSound();
    setTimeout(() => speakPayment(8500), 500);
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
    DOM.toggleSoundBtn.textContent = state.soundEnabled ? '♫ Suara' : '♫ Mute';
    DOM.toggleSoundBtn.className = state.soundEnabled ? 'neo-btn neo-btn-success' : 'neo-btn neo-btn-warning';
    
    DOM.toggleTtsBtn.textContent = state.ttsEnabled ? '🔊 Voice' : '🔊 Mute';
    DOM.toggleTtsBtn.className = state.ttsEnabled ? 'neo-btn neo-btn-success' : 'neo-btn neo-btn-warning';
    
    document.querySelectorAll('.sound-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sound === state.soundType);
    });
    
    const slider = document.getElementById('soundVolume');
    if (slider) slider.value = state.soundVolume;
    document.getElementById('soundVolumeLabel').textContent = `${Math.round(state.soundVolume * 100)}%`;
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
                badge: '/icon48.png',
                vibrate: [200, 100, 200],
                requireInteraction: true,
                tag: 'payment-' + entry.id
            });
        } catch (e) {}
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
            </div>`;
        return;
    }
    
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
}

function updateStatsUI() {
    const total = state.history.length;
    const totalAmt = state.history.reduce((s, i) => s + (i.amount || 0), 0);
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
function formatRupiah(v) {
    return new Intl.NumberFormat('id-ID').format(v || 0);
}

function formatTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch {
        return iso || '';
    }
}

function showToast(msg) {
    DOM.toastMessage.textContent = msg;
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
            .then(() => console.log('◆ Service Worker registered'))
            .catch(() => console.warn('⊘ SW failed'));
    }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') toggleSound();
    if (e.key === 't' || e.key === 'T') toggleTts();
    if (e.key === 'Enter' && document.activeElement === DOM.tokenInput) {
        saveToken();
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