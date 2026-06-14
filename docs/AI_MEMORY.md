# AI MEMORY SYSTEM — Cara Kerja Memori Atlas

## Masalah yang Dipecahkan

LLM (Large Language Model) secara default adalah **stateless** — setiap panggilan API adalah percakapan baru tanpa ingatan. Ini berarti:

- AI tidak tahu dia baru saja memberi sinyal WAIT 3 menit lalu
- AI tidak tahu win rate-nya sendiri
- AI tidak bisa mendeteksi perubahan bias pasar secara bertahap
- AI tidak bisa belajar dari hasil WIN/LOSS sebelumnya

**Solusi**: Setiap siklus analisis, kita injek "paket memori" ke user message sebelum data pasar.

---

## Arsitektur Memori

```typescript
// Satu entri memori per siklus analisis
interface MemoryEntry {
  timestamp: string;         // ISO UTC
  timeWib: string;           // "15 Jun 2026, 08:45:22 WIB"
  decision: string;          // "BUY" | "SELL" | "WAIT"
  confidence: number;        // 0.0 – 1.0
  price: number;             // harga saat analisis
  market_phase: string;      // "TRENDING_UP", dll
  bias: {H4, H1, M15};       // bias per timeframe
  confluence_score: number;  // 0-10
  market_context: string;    // deskripsi singkat AI
  entry_price, take_profit, stop_loss: number | null;
  result?: "WIN" | "LOSS" | "ACTIVE" | "EXPIRED";
  exit_price?: number;
  exit_time?: string;
}

// Statistik agregat seluruh sesi
interface SessionStats {
  wins: number;
  losses: number;
  totalSignals: number;       // BUY/SELL saja
  totalAnalyses: number;      // semua siklus
  waitCount: number;
  lastMarketPhases: string[]; // rolling 5 terakhir
  lastBiasH4: string[];       // rolling 5 terakhir
}
```

---

## Alur Data Memori

```
Siklus 1:
  analyzeMarket() → AI memberi WAIT
  recordAnalysis(signal, price, timeWib)
  → memory[0] = { decision: "WAIT", confidence: 0.42, ... }
  → stats.totalAnalyses++, stats.waitCount++

Siklus 2:
  analyzeMarket() → AI memberi WAIT
  recordAnalysis() → memory[0] = siklus 2, memory[1] = siklus 1

Siklus 3:
  analyzeMarket() → AI memberi BUY (conf 0.75)
  recordAnalysis() → memory[0] = { decision: "BUY", result: "ACTIVE", ... }
  → kirim sinyal, masuk MONITORING mode

Saat TP hit:
  recordSignalResult("WIN", exitPrice)
  → memory[0].result = "WIN", .exit_price = exitPrice
  → stats.wins++

Siklus 4 (kembali ANALYZING):
  buildMemoryContext() menghasilkan teks yang menceritakan:
  "Siklus lalu BUY, WIN dengan exit $2358, sebelumnya 2x WAIT"
  → AI tahu konteks ini sebelum analisis baru
```

---

## Format Konteks yang Diinjek ke AI

```
## 🧠 MEMORI ATLAS — Konteks & Ingatan Siklus Sebelumnya

PENTING: Gunakan konteks di bawah ini untuk membuat analisis yang
KONSISTEN dan EVOLUSIONER, bukan analisis yang mulai dari nol.

### 📊 Statistik Sesi Ini:
- Total analisis: 12 | Sinyal BUY/SELL: 3 | WAIT: 9
- Hasil sinyal: 2 WIN / 1 LOSS → Win Rate: **67%**
- Fase pasar 5 siklus terakhir: RANGING → RANGING → TRENDING_UP → TRENDING_UP → VOLATILE
- Bias H4 dominan: NEUTRAL → NEUTRAL → BULLISH → BULLISH → BEARISH

### 🕐 Riwayat 10 Analisis Terakhir:
1. [08:45 WIB] **BUY** | $2345.20 | conf:72% | TRENDING_UP | bias:H4:BULLISH H1:BULLISH M15:BULLISH
   Entry:$2343.00 TP:$2358.00 SL:$2336.00 → ✅ WIN (exit $2358.20)
   "Tren naik kuat, confluence tinggi, EMA alignment bullish"
2. [08:30 WIB] **WAIT** | $2341.80 | conf:44% | CONSOLIDATION
   "Pasar konsolidasi, menunggu breakout dari range..."
...

### 🔎 Instruksi Refleksi Diri:
1. Apakah kondisi berubah signifikan dari siklus sebelumnya?
2. Jika ada sinyal AKTIF — harga sudah bergerak ke mana?
3. Jika sinyal terakhir LOSS — apa yang keliru?
4. Apakah bias H4 berubah arah konsisten (tanda tren nyata)?
5. Jika sudah ≥3 WAIT berturut-turut, apakah ada setup terlewat?
```

---

## Urutan Konteks dalam User Message

```
1. 🧠 MEMORI (10 siklus terakhir + stats + refleksi)
          ↓
2. ⚠️ KALENDER EKONOMI (event hari ini + alert level)
          ↓
3. 📡 DATA PASAR REAL-TIME (harga + 4 timeframe + semua indikator)
          ↓
4. Instruksi: "Berikan analisis dan keputusan trading Atlas sekarang"
```

---

## Limitasi & Catatan

### In-Memory (Reset saat restart)
Memori disimpan di array JavaScript dalam RAM. Saat server restart:
- Semua `MemoryEntry` hilang
- `SessionStats` reset ke nol
- AI mulai dari siklus pertama lagi

**Jika ingin persistent**: Implementasi simpan/load `memory[]` dan `sessionStats` dari file JSON di disk (misal `data/memory.json`). Pattern:
```typescript
// Saat startup: baca dari file
// Setelah setiap update: tulis ke file (debounced)
```

### Token Limit
Setiap siklus analisis mengirim ~8.000–15.000 token ke LLM (memori + kalender + data pasar).
Jika model punya context window terbatas, pertimbangkan kurangi `MAX_MEMORY` dari 20 ke 5–10.

### Thread Safety
Node.js single-threaded, tidak ada race condition. Semua update ke `memory[]` dan `sessionStats` sinkron.

---

## Cara Extend Memori

### Tambah field baru ke MemoryEntry
```typescript
// Di ai-agent.ts, interface MemoryEntry:
interface MemoryEntry {
  // ... existing fields
  atr_m15?: number;          // contoh: simpan ATR untuk evaluasi
  session?: string;          // sesi trading saat sinyal
}

// Di recordAnalysis(), tambah:
entry.atr_m15 = ...; // dari timeframes data
```

### Tambah info baru ke buildMemoryContext()
```typescript
function buildMemoryContext(): string {
  // ... existing code
  // Tambah section baru:
  lines.push("\n### Trend ATR 5 siklus:");
  // ...
}
```
