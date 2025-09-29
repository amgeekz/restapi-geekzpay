#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo "== Wallet Forwarder Auto-Installer =="

have_termux_api=1
have_termux_boot=0

# --- Cek Termux:API (biner CLI tersedia?) ---
if ! command -v termux-notification-list >/dev/null 2>&1; then
  have_termux_api=0
  echo "• WARNING: 'termux-notification-list' tidak ditemukan."
  echo "  -> Pasang app Termux:API (F-Droid) & paket termux-api:"
  echo "     - App: https://f-droid.org/en/packages/com.termux.api/"
  echo "     - CLI: pkg install termux-api"
fi

# --- Cek Termux:Boot (app terpasang?) ---
if command -v cmd >/dev/null 2>&1 && cmd package list packages 2>/dev/null | grep -q 'com.termux.boot'; then
  have_termux_boot=1
elif command -v pm >/dev/null 2>&1 && pm list packages 2>/dev/null | grep -q 'com.termux.boot'; then
  have_termux_boot=1
else
  have_termux_boot=0
fi

if [ "$have_termux_boot" -eq 0 ]; then
  echo "• WARNING: Termux:Boot tidak terdeteksi."
  echo "  -> Pasang dari F-Droid dan BUKA sekali agar skrip boot aktif:"
  echo "     https://f-droid.org/en/packages/com.termux.boot/"
fi

# --- Paket dasar (tetap dipasang walau warning di atas) ---
echo "• Memasang paket dasar..."
pkg update -y >/dev/null
pkg install -y curl jq coreutils grep awk sed vim openssl-tool termux-api >/dev/null || true

# --- Input konfigurasi ---
read -rp "API_BASE [default: https://restapi.amgeekz.my.id]: " API_BASE
API_BASE="${API_BASE:-https://restapi.amgeekz.my.id}"
read -rp "TOKEN (wajib): " TOKEN
if [ -z "${TOKEN:-}" ]; then
  echo "TOKEN wajib diisi."; exit 1
fi

# --- forwarder.sh (tanpa komentar) ---
cat > "$HOME/forwarder.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
API_BASE="__API_BASE__"
TOKEN="__TOKEN__"
WEBHOOK_URL="${API_BASE}/webhook/payment?token=${TOKEN}"
STATE_FILE="$HOME/.wallet_seen_keys.txt"
LOG_FILE="$HOME/wallet-forwarder.log"
INTERVAL_SEC=10
STATE_MAX_LINES=5000
MIN_AMOUNT=1000
MAX_AMOUNT=100000000
WALLET_PKG_REGEX='^(id\.dana|com\.shopeepay\.id|com\.shopee|com\.shopee\.id|com\.gojek\.app|ovo\.id|id\.ovo)$'
WALLET_KW_REGEX='(DANA|ShopeePay|Shopee|GoPay|Gojek|OVO)'
need() { command -v "$1" >/dev/null 2>&1 || { echo "Install $1 dulu: pkg install $1"; exit 1; }; }
need jq; need curl; need termux-notification-list; need termux-notification; need md5sum; need sed; need awk
mkdir -p "$(dirname "$STATE_FILE")"; touch "$STATE_FILE" "$LOG_FILE"
termux-notification --id walletfw --title "Wallet Forwarder" --content "Starting..." --ongoing --priority low --alert-once
echo "▶️ Start (interval ${INTERVAL_SEC}s) → $WEBHOOK_URL" | tee -a "$LOG_FILE"
trim_state(){ local lines; lines=$(wc -l < "$STATE_FILE"|tr -d ' '); if [ "$lines" -gt "$STATE_MAX_LINES" ]; then local keep=$(( STATE_MAX_LINES * 8 / 10 )); tail -n "$keep" "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"; fi; }
post_json(){ curl -sS --max-time 10 --connect-timeout 5 --retry 2 --retry-delay 1 -w " HTTP_CODE=%{http_code}" -H "Content-Type: application/json" -X POST "$WEBHOOK_URL" --data-binary @- 2>&1; }
extract_amount(){ local s="$1" a; a=$(printf '%s' "$s"|sed -nE 's/.*[Rr][Pp][[:space:]]*([0-9][0-9\.\,]{2,}).*/\1/p'|head -n1); a="${a//[^0-9]/}"; [ -n "$a" ] && echo "$a" || echo ""; }
guess_type(){ local s="$1"; shopt -s nocasematch; if [[ "$s" =~ (diterima|saldo[[:space:]]+masuk|received|Dana[[:space:]]masuk) ]]; then echo "incoming"; shopt -u nocasematch; return; fi; if [[ "$s" =~ (top[[:space:]]?up|isi[[:space:]]saldo|topup) ]]; then echo "topup"; shopt -u nocasematch; return; fi; if [[ "$s" =~ (promo|diskon|cashback|voucher|flash[[:space:]]sale|token[[:space:]]pln) ]]; then echo "promo"; shopt -u nocasematch; return; fi; shopt -u nocasematch; echo "unknown"; }
is_wallet_notif(){ local p="$1" t="$2" c="$3"; if [ "${#t}" -lt 3 ] && [ "${#c}" -lt 3 ]; then return 1; fi; local joined="$t $c" amt; amt="$(extract_amount "$joined")"; if [ -z "$amt" ]; then return 1; fi; if [ "$amt" -lt "$MIN_AMOUNT" ] || [ "$amt" -gt "$MAX_AMOUNT" ]; then return 1; fi; shopt -s nocasematch; if [[ "$p" =~ $WALLET_PKG_REGEX ]]; then shopt -u nocasematch; return 0; fi; if [[ "$joined" =~ $WALLET_KW_REGEX ]]; then shopt -u nocasematch; return 0; fi; shopt -u nocasematch; return 1; }
while :; do
  termux-notification --id walletfw --title "Wallet Forwarder" --content "Alive @ $(date '+%H:%M:%S')" --ongoing --priority low --alert-once
  json="$(termux-notification-list 2>/dev/null || echo "[]")"; if [ -z "$json" ] || [ "$json" = "null" ]; then sleep "$INTERVAL_SEC"; continue; fi
  count=$(echo "$json"|jq 'length' 2>/dev/null || echo "0"); [ "$count" -eq 0 ] && { sleep "$INTERVAL_SEC"; continue; }
  echo "$json" | jq -c '.[]' | while read -r row; do
    pkg=$(echo "$row"|jq -r '.packageName // ""'); title=$(echo "$row"|jq -r '.title // ""'); content=$(echo "$row"|jq -r '.content // ""'); when=$(echo "$row"|jq -r '.when // ""'); key=$(echo "$row"|jq -r '.key // (.id|tostring)')
    [ "$pkg" = "com.termux.api" ] && continue
    if ! is_wallet_notif "$pkg" "$title" "$content"; then continue; fi
    fingerprint="$(printf '%s' "$pkg|$title|$content|$when" | md5sum | awk '{print $1}')"
    if grep -qxF "$fingerprint" "$STATE_FILE"; then continue; fi
    type_hint="$(guess_type "$title $content")"
    payload=$(jq -n --arg pkg "$pkg" --arg title "$title" --arg content "$content" --arg when "$when" --arg key "$key" --arg fid "$fingerprint" --arg type "$type_hint" '{package:$pkg,title:$title,content:$content,when:$when,key:$key,fingerprint:$fid,type:$type}')
    ts="$(date '+%Y-%m-%d %H:%M:%S')"; resp=$(echo "$payload" | post_json || true)
    echo "$ts | sent fid=$fingerprint | $pkg | title=${title:0,60} | resp=$resp" | tee -a "$LOG_FILE"
    shortlog="[$(date '+%H:%M:%S')] ${title:0:60}"
    termux-notification --id walletfw --title "Wallet Forwarder" --content "$shortlog" --ongoing --priority low --alert-once
    echo "$fingerprint" >> "$STATE_FILE"; trim_state
  done
  sleep "$INTERVAL_SEC"
done
SH
sed -i "s|__API_BASE__|$API_BASE|g" "$HOME/forwarder.sh"
sed -i "s|__TOKEN__|$TOKEN|g" "$HOME/forwarder.sh"
chmod +x "$HOME/forwarder.sh"

# --- forwarderctl.sh ---
cat > "$HOME/forwarderctl.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
SCRIPT="$HOME/forwarder.sh"
PID_FILE="$HOME/.forwarder.pid"
LOG_FILE="$HOME/forwarder.log"
START_TIMEOUT=2
STOP_TIMEOUT=5
need(){ command -v "$1" >/dev/null 2>&1 || { echo "Install $1 dulu: pkg install $1"; exit 1; }; }
need nohup; need ps; need grep; need awk; need tail
is_running(){ local pid="$1"; [ -n "$pid" ] || return 1; kill -0 "$pid" 2>/dev/null || return 1; ps -p "$pid" -o args= 2>/dev/null | grep -Fq "$SCRIPT"; }
start(){ [ -f "$SCRIPT" ] || { echo "❌ Script tidak ditemukan: $SCRIPT"; exit 1; }; [ -x "$SCRIPT" ] || chmod +x "$SCRIPT" || true; if [ -f "$PID_FILE" ]; then local oldpid; oldpid="$(cat "$PID_FILE" 2>/dev/null || true)"; if is_running "$oldpid"; then echo "⚠️  Sudah jalan (PID $oldpid)."; exit 0; else rm -f "$PID_FILE"; fi; fi; touch "$LOG_FILE"; echo "▶️  Starting → $SCRIPT"; termux-wake-lock 2>/dev/null || true; nohup bash "$SCRIPT" >>"$LOG_FILE" 2>&1 & echo $! > "$PID_FILE"; sleep "$START_TIMEOUT"; local pid; pid="$(cat "$PID_FILE" 2>/dev/null || true)"; if is_running "$pid"; then echo "✅ Started (PID $pid). Log: $LOG_FILE"; else echo "❌ Gagal start. tail -n 100 $LOG_FILE"; rm -f "$PID_FILE"; exit 1; fi; }
stop(){ if [ ! -f "$PID_FILE" ]; then termux-wake-unlock 2>/dev/null || true; termux-notification-remove walletfw 2>/dev/null || true; echo "ℹ️  Tidak berjalan."; exit 0; fi; local pid; pid="$(cat "$PID_FILE" 2>/dev/null || true)"; if [ -z "${pid:-}" ]; then rm -f "$PID_FILE"; termux-wake-unlock 2>/dev/null || true; termux-notification-remove walletfw 2>/dev/null || true; echo "ℹ️  Bersih."; exit 0; fi; if ! is_running "$pid"; then rm -f "$PID_FILE"; termux-wake-unlock 2>/dev/null || true; termux-notification-remove walletfw 2>/dev/null || true; echo "ℹ️  Sudah mati."; exit 0; fi; echo "⏹  Stop (PID $pid) ..."; kill "$pid" 2>/dev/null || true; local waited=0; while is_running "$pid" && [ "$waited" -lt "$STOP_TIMEOUT" ]; do sleep 1; waited=$((waited+1)); done; if is_running "$pid"; then kill -9 "$pid" 2>/dev/null || true; fi; rm -f "$PID_FILE"; termux-wake-unlock 2>/dev/null || true; termux-notification-remove walletfw 2>/dev/null || true; echo "✅ Stopped."; }
restart(){ stop; sleep 1; start; }
status(){ if [ -f "$PID_FILE" ]; then local pid; pid="$(cat "$PID_FILE" 2>/dev/null || true)"; if is_running "$pid"; then local cmd; cmd="$(ps -p "$pid" -o args= 2>/dev/null | awk '{print substr($0,1,120)}')"; echo "✅ Running (PID $pid)"; echo "   CMD: $cmd"; echo "   LOG: $LOG_FILE"; exit 0; fi; fi; echo "❌ Not running."; [ -f "$PID_FILE" ] && echo "(stale PID file at $PID_FILE)"; exit 1; }
logs(){ [ -f "$LOG_FILE" ] && { echo "📜 Tailing log (Ctrl+C utk keluar)"; tail -f "$LOG_FILE"; } || { echo "❌ Log tidak ada: $LOG_FILE"; exit 1; }; }
case "${1:-}" in start) start ;; stop) stop ;; restart) restart ;; status) status ;; logs) logs ;; *) echo "Usage: $0 {start|stop|restart|status|logs}"; exit 1 ;; esac
SH
chmod +x "$HOME/forwarderctl.sh"

# --- start-forwarder.sh ---
cat > "$HOME/start-forwarder.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
sleep 3
termux-wake-lock
"$HOME/forwarderctl.sh" start
SH
chmod +x "$HOME/start-forwarder.sh"

# --- Setup boot (tetap dibuat walau app belum ada) ---
mkdir -p "$HOME/.termux/boot"
cp -f "$HOME/start-forwarder.sh" "$HOME/.termux/boot/start-forwarder.sh"
chmod +x "$HOME/.termux/boot/start-forwarder.sh"

# --- Start sekarang ---
"$HOME/forwarderctl.sh" restart || true

echo
echo "== SELESAI =="
echo "• Cek status :  $HOME/forwarderctl.sh status"
echo "• Lihat log  :  $HOME/forwarderctl.sh logs"
echo "• Start/Stop :  $HOME/forwarderctl.sh start|stop|restart"
echo "• Boot start :  ~/.termux/boot/start-forwarder.sh"
if [ "$have_termux_api" -eq 0 ]; then
  echo "• WARNING: Termux:API belum lengkap. Install app Termux:API dan paket 'termux-api'."
fi
if [ "$have_termux_boot" -eq 0 ]; then
  echo "• WARNING: Termux:Boot tidak terdeteksi. Install dari F-Droid dan BUKA app-nya sekali."
fi
echo "• Matikan Battery Optimization untuk Termux & Termux:API agar proses stabil."
