/**
 * GeekzPay PWA Monitor
 * Elegant & Professional Version with Dark Mode
 * Polling Mode - Simple & Stabil
 * Dengan QRIS Upload + Custom Sound
 * FIX: Suara notifikasi dan voice berjalan
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_BASE: 'https://restapi.amgeekz.my.id',
    MAX_HISTORY: 200,
    POLLING_INTERVAL: 3000
};

// ============================================
// STATE
// ============================================
const state = {
    token: localStorage.getItem('geekzpay_token') || '',
    soundEnabled: localStorage.getItem('geekzpay_sound') !== 'false',
    soundType: localStorage.getItem('geekzpay_sound_type') || 'coin',
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
// SOUND CONFIGURATION - COIN DROP
// ============================================
const SOUNDS = {
    coin: {
        label: 'Coin Drop',
        beeps: [
            { freq: 1200, duration: 0.06, delay: 0 },
            { freq: 900, duration: 0.06, delay: 0.1 },
            { freq: 700, duration: 0.08, delay: 0.2 },
            { freq: 500, duration: 0.1, delay: 0.32 },
            { freq: 400, duration: 0.15, delay: 0.46 }
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
    permissionBanner: document.getElementById('permissionBanner'),
    historyCount: document.getElementById('historyCount'),
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.querySelector('.theme-icon'),
    // QRIS
    qrisDropZone: document.getElementById('qrisDropZone'),
    qrisFileInput: document.getElementById('qrisFileInput'),
    qrisPreviewContainer: document.getElementById('qrisPreviewContainer'),
    qrisPreview: document.getElementById('qrisPreview'),
    qrisShowBtn: document.getElementById('qrisShowBtn'),
    qrisModalImage: document.getElementById('qrisModalImage'),
    qrisOverlay: document.getElementById('qrisOverlay'),
    // Sound Custom
    soundDropZone: document.getElementById('soundDropZone'),
    soundFileInput: document.getElementById('soundFileInput'),
    soundPreviewContainer: document.getElementById('soundPreviewContainer'),
    soundPreviewName: document.getElementById('soundPreviewName'),
    customSoundBtn: document.getElementById('customSoundBtn')
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
        DOM.themeIcon.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.documentElement.removeAttribute('data-theme');
        DOM.themeIcon.innerHTML = '<i class="fas fa-moon"></i>';
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.content = theme === 'dark' ? '#0f1420' : '#f0f4f8';
    }
}

// ============================================
// QRIS UPLOAD FUNCTIONS
// ============================================

function initQRISUpload() {
    const dropZone = DOM.qrisDropZone;
    const fileInput = DOM.qrisFileInput;
    const previewContainer = DOM.qrisPreviewContainer;
    const previewImage = DOM.qrisPreview;
    const showBtn = DOM.qrisShowBtn;
    const modalImage = DOM.qrisModalImage;
    
    if (QRIS_STATE.imageData) {
        previewImage.src = QRIS_STATE.imageData;
        previewContainer.style.display = 'inline-block';
        showBtn.style.display = 'flex';
        modalImage.src = QRIS_STATE.imageData;
        dropZone.style.display = 'none';
    }
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleQRISFile(e.target.files[0]);
        }
        fileInput.value = '';
    });
    
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
            handleQRISFile(e.dataTransfer.files[0]);
        }
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
    reader.onload = (e) => {
        const imageData = e.target.result;
        QRIS_STATE.imageData = imageData;
        QRIS_STATE.fileName = file.name;
        
        localStorage.setItem('geekzpay_qris', imageData);
        localStorage.setItem('geekzpay_qris_name', file.name);
        
        DOM.qrisPreview.src = imageData;
        DOM.qrisPreviewContainer.style.display = 'inline-block';
        DOM.qrisShowBtn.style.display = 'flex';
        DOM.qrisModalImage.src = imageData;
        DOM.qrisDropZone.style.display = 'none';
        
        showToast(`QRIS "${file.name}" berhasil diupload!`);
    };
    reader.readAsDataURL(file);
}

function removeQRIS() {
    QRIS_STATE.imageData = null;
    QRIS_STATE.fileName = null;
    
    localStorage.removeItem('geekzpay_qris');
    localStorage.removeItem('geekzpay_qris_name');
    
    DOM.qrisPreviewContainer.style.display = 'none';
    DOM.qrisShowBtn.style.display = 'none';
    DOM.qrisModalImage.src = '';
    DOM.qrisDropZone.style.display = 'block';
    
    showToast('QRIS dihapus');
}
window.removeQRIS = removeQRIS;

function openQRISWidget() {
    if (!QRIS_STATE.imageData) {
        showToast('Upload QRIS terlebih dahulu!');
        return;
    }
    
    DOM.qrisModalImage.src = QRIS_STATE.imageData;
    DOM.qrisOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}
window.openQRISWidget = openQRISWidget;

function closeQRISWidget(event) {
    if (event && event.target !== event.currentTarget) {
        return;
    }
    DOM.qrisOverlay.classList.remove('active');
    document.body.style.overflow = '';
}
window.closeQRISWidget = closeQRISWidget;

// ============================================
// CUSTOM SOUND FUNCTIONS
// ============================================

function initSoundUpload() {
    const dropZone = DOM.soundDropZone;
    const fileInput = DOM.soundFileInput;
    const previewContainer = DOM.soundPreviewContainer;
    const previewName = DOM.soundPreviewName;
    
    if (state.customSound) {
        previewContainer.style.display = 'flex';
        previewName.textContent = state.customSoundName || 'custom.mp3';
        dropZone.style.display = 'none';
        if (DOM.customSoundBtn) {
            DOM.customSoundBtn.style.display = 'flex';
        }
    }
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleSoundFile(e.target.files[0]);
        }
        fileInput.value = '';
    });
    
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
            handleSoundFile(e.dataTransfer.files[0]);
        }
    });
}

function handleSoundFile(file) {
    if (!file.type.startsWith('audio/')) {
        showToast('File harus audio!');
        return;
    }
    if (file.size > 1 * 1024 * 1024) {
        showToast('Maksimal 1MB!');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const audioData = e.target.result;
        state.customSound = audioData;
        state.customSoundName = file.name;
        
        localStorage.setItem('geekzpay_custom_sound', audioData);
        localStorage.setItem('geekzpay_custom_sound_name', file.name);
        
        DOM.soundPreviewContainer.style.display = 'flex';
        DOM.soundPreviewName.textContent = file.name;
        DOM.soundDropZone.style.display = 'none';
        if (DOM.customSoundBtn) {
            DOM.customSoundBtn.style.display = 'flex';
        }
        
        // ===== AUTO SWITCH KE CUSTOM =====
        state.soundType = 'custom';
        localStorage.setItem('geekzpay_sound_type', 'custom');
        updateSoundUI();
        
        // Test play
        setTimeout(playCustomSound, 300);
        
        showToast(`Suara "${file.name}" berhasil diupload dan aktif!`);
    };
    reader.readAsDataURL(file);
}

function playCustomSound() {
    if (!state.customSound) return;
    try {
        const audio = new Audio(state.customSound);
        audio.volume = state.soundVolume;
        audio.play().catch(() => {});
    } catch (e) {
        showToast('Gagal memutar suara custom');
    }
}
window.playCustomSound = playCustomSound;

function removeCustomSound() {
    state.customSound = null;
    state.customSoundName = null;
    
    localStorage.removeItem('geekzpay_custom_sound');
    localStorage.removeItem('geekzpay_custom_sound_name');
    
    DOM.soundPreviewContainer.style.display = 'none';
    DOM.soundDropZone.style.display = 'block';
    if (DOM.customSoundBtn) {
        DOM.customSoundBtn.style.display = 'none';
    }
    
    // ===== KEMBALI KE COIN =====
    state.soundType = 'coin';
    localStorage.setItem('geekzpay_sound_type', 'coin');
    updateSoundUI();
    
    showToast('Suara custom dihapus, kembali ke Coin');
}
window.removeCustomSound = removeCustomSound;

// ============================================
// NOTIFICATION SOUND FUNCTIONS
// ============================================

function playNotificationSound() {
    if (!state.soundEnabled) {
        console.log('🔇 Sound disabled');
        return;
    }
    
    console.log('🔊 Playing sound, type:', state.soundType);
    
    // ===== PRIORITAS: CUSTOM SOUND =====
    if (state.soundType === 'custom' && state.customSound) {
        try {
            const audio = new Audio(state.customSound);
            audio.volume = state.soundVolume;
            audio.play().then(() => {
                console.log('✅ Custom sound played');
            }).catch((err) => {
                console.warn('❌ Custom sound failed, fallback to coin:', err);
                playCoinSound();
            });
            return;
        } catch (e) {
            console.warn('❌ Custom sound error, fallback to coin:', e);
            playCoinSound();
        }
        return;
    }
    
    // Default: Coin
    console.log('🪙 Playing coin sound');
    playCoinSound();
}

function playCoinSound() {
    try {
        if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = state.audioContext;
        const config = SOUNDS.coin;
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
                    gain.gain.exponentialRampToValueAtTime(volume * 0.35, now + 0.01);
                    gain.gain.exponentialRampToValueAtTime(volume * 0.01, now + beep.duration);
                    osc.start(now);
                    osc.stop(now + beep.duration);
                    
                    const bufSize = ctx.sampleRate * 0.01;
                    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let j = 0; j < bufSize; j++) {
                        data[j] = (Math.random() * 2 - 1) * 0.03;
                    }
                    const noise = ctx.createBufferSource();
                    noise.buffer = buf;
                    const ng = ctx.createGain();
                    ng.gain.value = volume * 0.08;
                    noise.connect(ng);
                    ng.connect(ctx.destination);
                    noise.start(now);
                    noise.stop(now + beep.duration);
                } catch (e) {}
            }, beep.delay * 1000);
        });
        
        console.log('✅ Coin sound played');
    } catch (e) {
        console.warn('❌ Coin sound failed, fallback to audio element:', e);
        try { 
            DOM.sound.currentTime = 0; 
            DOM.sound.volume = state.soundVolume; 
            DOM.sound.play(); 
        } catch (err) {}
    }
}

// ============================================
// FETCH HISTORY
// ============================================
async function fetchHistory() {
    if (!state.token) {
        console.warn('No token, skipping fetchHistory');
        return;
    }
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/webhook/status?token=${encodeURIComponent(state.token)}&limit=20`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const items = Array.isArray(data?.data) ? data.data : [];
        
        if (items.length === 0) {
            DOM.transactionList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fas fa-inbox"></i></div>
                    <p>Belum ada transaksi</p>
                    <span>Masukkan token dan tunggu notifikasi</span>
                </div>`;
            DOM.historyCount.textContent = '0';
            return;
        }
        
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
            console.log(`${newItems} item(s) loaded from history`);
        }
        
    } catch (error) {
        console.warn('Fetch history error:', error);
        DOM.transactionList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div>
                <p>Gagal mengambil data</p>
                <span>Pastikan token benar dan coba refresh</span>
            </div>`;
    }
}
window.fetchHistory = fetchHistory;

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
// INIT
// ============================================
function init() {
    applyTheme(state.theme);
    
    initQRISUpload();
    initSoundUpload();
    
    if (state.token) {
        DOM.tokenInput.value = state.token;
        startPolling();
        setTimeout(fetchHistory, 500);
    } else {
        DOM.tokenInput.value = '';
        setStatus('paused', 'Waiting Token');
        DOM.statusDot.style.background = '#f5a623';
        showToast('Masukkan token terlebih dahulu');
    }
    
    calculateStatsFromHistory();
    updateSoundUI();
    renderTransactions();
    updateStatsUI();
    renderStats();
    renderChart();
    registerServiceWorker();
    checkNotificationPermission();
    
    console.log('GeekzPay Monitor loaded');
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
// POLLING
// ============================================
function startPolling() {
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = null;
    }
    
    if (!state.token) {
        showToast('Masukkan token terlebih dahulu');
        return;
    }

    state.isPolling = true;
    setStatus('online', 'Online');
    DOM.statusDot.style.background = '#22b573';
    showToast('Monitoring aktif');
    
    pollData();
    state.pollingInterval = setInterval(pollData, CONFIG.POLLING_INTERVAL);
}

function stopPolling() {
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = null;
        state.isPolling = false;
        console.log('Polling stopped');
    }
}

// ============================================
// POLLING - FETCH DATA (FIX SUARA)
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
                
                // ===== PLAY SOUND & VOICE =====
                console.log('🔔 Payment detected, playing sound...');
                
                // 1. Suara notifikasi
                if (state.soundEnabled) {
                    playNotificationSound();
                }
                
                // 2. Voice (Text-to-Speech)
                if (state.ttsEnabled) {
                    speakPayment(amount);
                }
                
                // 3. Toast
                showToast(`Pembayaran Rp ${formatRupiah(amount)} masuk`);
                
                // 4. Push Notification
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
// SAVE TOKEN
// ============================================
function saveToken() {
    const newToken = DOM.tokenInput.value.trim();
    if (!newToken) {
        showToast('Token tidak boleh kosong');
        return;
    }
    
    state.token = newToken;
    localStorage.setItem('geekzpay_token', state.token);
    showToast('Token tersimpan');
    
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
    setTimeout(fetchHistory, 500);
}
window.saveToken = saveToken;

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

// ============================================
// TEXT-TO-SPEECH
// ============================================
function speakPayment(amount) {
    if (!state.ttsEnabled || !('speechSynthesis' in window)) {
        console.log('🔇 TTS disabled or not supported');
        return;
    }
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
        console.log(`🗣️ TTS: "${text}"`);
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
    showToast(state.soundEnabled ? 'Suara ON' : 'Suara OFF');
}
window.toggleSound = toggleSound;

function toggleTts() {
    state.ttsEnabled = !state.ttsEnabled;
    localStorage.setItem('geekzpay_tts', String(state.ttsEnabled));
    updateSoundUI();
    showToast(state.ttsEnabled ? 'Voice ON' : 'Voice OFF');
    if (state.ttsEnabled) speakPayment(10000);
}
window.toggleTts = toggleTts;

function changeSoundType(type) {
    if (type === 'custom' && !state.customSound) {
        showToast('Upload suara custom terlebih dahulu!');
        return;
    }
    state.soundType = type;
    localStorage.setItem('geekzpay_sound_type', type);
    updateSoundUI();
    // Test sound
    playNotificationSound();
    showToast(`Suara: ${type === 'coin' ? 'Coin Drop' : 'Custom'}`);
}
window.changeSoundType = changeSoundType;

function changeSoundVolume(value) {
    state.soundVolume = parseFloat(value);
    localStorage.setItem('geekzpay_sound_volume', String(state.soundVolume));
    updateSoundUI();
}
window.changeSoundVolume = changeSoundVolume;

function updateSoundUI() {
    DOM.toggleSoundBtn.innerHTML = state.soundEnabled ? '<i class="fas fa-volume-up"></i> Suara' : '<i class="fas fa-volume-mute"></i> Mute';
    DOM.toggleSoundBtn.className = state.soundEnabled ? 'btn btn-soft active' : 'btn btn-soft';
    
    DOM.toggleTtsBtn.innerHTML = state.ttsEnabled ? '<i class="fas fa-microphone"></i> Voice' : '<i class="fas fa-microphone-slash"></i> Mute';
    DOM.toggleTtsBtn.className = state.ttsEnabled ? 'btn btn-soft active' : 'btn btn-soft';
    
    document.querySelectorAll('.sound-btn').forEach(btn => {
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
// RENDER FUNCTIONS
// ============================================
function renderTransactions() {
    if (state.history.length === 0) {
        DOM.transactionList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-inbox"></i></div>
                <p>Belum ada transaksi</p>
                <span>Masukkan token dan tunggu notifikasi</span>
            </div>`;
        DOM.historyCount.textContent = '0';
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
    
    DOM.historyCount.textContent = state.history.length;
}

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
    const colors = {
        online: '#22b573',
        paused: '#f5a623',
        error: '#ef5a6b'
    };
    if (DOM.statusDot) {
        DOM.statusDot.style.background = colors[type] || '#888';
    }
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
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') toggleSound();
    if (e.key === 't' || e.key === 'T') toggleTts();
    if (e.key === 'Escape') closeQRISWidget();
    if (e.key === 'Enter' && document.activeElement === DOM.tokenInput) saveToken();
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