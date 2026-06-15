# AI MEMORY SYSTEM — Cara Kerja Memori Atlas

## Masalah yang Dipecahkan

LLM (Large Language Model) secara default adalah **stateless** — setiap panggilan API adalah percakapan baru tanpa ingatan. Ini berarti:

- AI tidak tahu dia baru saja memberi sinyal WAIT 3 menit lalu
- AI tidak tahu win rate-nya sendiri
- AI tidak bisa mendeteksi perubahan bias pasar secara bertahap
- AI tidak bisa belajar dari hasil WIN/LOSS sebelumnya

**Solusi**: Setiap siklus analisis, kita injek "paket memori" ke user message sebelum data pasar. Ditambah, AI punya **long-term memory** yang ia kelola sendiri untuk insight yang berlaku lintas sesi.

---

## Dua Lapisan Memori

### Short-Term Memory (Riwayat Siklus)
- Menyimpan **20 siklus analisis** terakhir
- Di-inject setiap siklus sebagai konteks
- Termasuk statistik agregat (win rate, confidence bands, bias H4 dominan, dll)
- **Persist ke disk** (`data/memory.json`) — tidak hilang saat restart

### Long-Term Memory (AI-Managed Notes)
- AI menulis sendiri catatan permanen yang berlaku beberapa hari ke depan
- Max **10 catatan** aktif
- AI bisa ADD / UPDATE / DELETE via field `long_term_memory_ops` dalam JSON output
- Di-inject ke prompt sebagai "Catatan Permanen Atlas"
- **Persist ke disk** (`data/long_term_notes.json`)

**File**: `artifacts/api-server/src/lib/ai-agent.ts`, `persistent-memory.ts`, `long-term-memory.ts`

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
  lesson?: string;           // insight AI dari kondisi saat itu
  invalidation?: string;     // kondisi yang membatalkan analisis
  what_would_change_my_mind?: string | string[];
  result?: "WIN" | "LOSS" | "ACTIVE" | "EXPIRED";
  exit_price?: number;
  exit_time?: string;
}

// Statistik agregat seluruh sesi (dengan metacognition)
interface SessionStats {
  wins: number;
  losses: number;
  totalSignals: number;       // BUY/SELL saja
  totalAnalyses: number;      // semua siklus
  waitCount: number;
  lastMarketPhases: string[]; // rolling 5 terakhir
  lastBiasH4: string[];       // rolling 5 terakhir
  // Metacognition: performa per band confidence
  confidenceBands: {
    high: { wins: number; losses: number };    // confidence >= 0.80
    medium: { wins: number; losses: number };  // 0.60 <= confidence < 0.80
  };
  // Metacognition: performa per fase pasar
  phasePerformance: Record<string, { wins: number; losses: number }>;
}

// Long-term memory entry (AI-managed)
interface LTMEntry {
  id: string;                 // UUID
  content: string;            // insight Atlas
  createdAt: string;          // ISO UTC
  updatedAt: string;          // ISO UTC
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
  → persist ke disk

Siklus 2:
  analyzeMarket() → AI memberi WAIT
  recordAnalysis() → memory[0] = siklus 2, memory[1] = siklus 1

Siklus 3:
  analyzeMarket() → AI memberi BUY (conf 0.65)
  recordAnalysis() → memory[0] = { decision: "BUY", result: "ACTIVE", ... }
  → kirim sinyal, masuk MONITORING mode

Saat TP hit:
  recordSignalResult("WIN", exitPrice)
  → memory[0].result = "WIN", .exit_price = exitPrice
  → stats.wins++
  → stats.confidenceBands.medium.wins++ (karena conf 0.65 termasuk medium)

Siklus 4 (kembali ANALYZING):
  buildMemoryContext() menghasilkan teks yang menceritakan:
  "Siklus lalu BUY, WIN dengan exit $3358, sebelumnya 2x WAIT"
  → AI tahu konteks ini sebelum analisis baru

AI dalam analisis baru bisa menulis long-term memory:
  "long_term_memory_ops": [{"op":"ADD","content":"Support kuat $3335 sudah diuji 3x minggu ini"}]
  → disimpan permanen, akan muncul di semua analisis berikutnya
```

---

## Format Konteks yang Diinjek ke AI

```
## 📌 CATATAN PERMANEN ATLAS

1. [abc123] Support kuat $3335 sudah diuji 3x minggu ini — 12 Jun 2026
2. [def456] FOMC meeting 18 Jun — ekspektasi hold, tapi perhatikan dot plot

---

## 🧠 MEMORI ATLAS — Konteks & Ingatan Siklus Sebelumnya

PENTING: Gunakan konteks di bawah ini untuk membuat analisis yang
KONSISTEN dan EVOLUSIONER, bukan analisis yang mulai dari nol.

### 📊 Statistik Sesi Ini:
- Total analisis: 12 | Sinyal BUY/SELL: 3 | WAIT: 9
- Hasil sinyal: 2 WIN / 1 LOSS → Win Rate: 67%
- Confidence bands: High (≥0.80): 1W/0L | Medium (0.60–0.79): 1W/1L
- Fase pasar 5 siklus terakhir: RANGING → RANGING → TRENDING_UP → TRENDING_UP → VOLATILE
- Bias H4 dominan: NEUTRAL → NEUTRAL → BULLISH → BULLISH → BEARISH

### 🕐 Riwayat 10 Analisis Terakhir:
1. [08:45 WIB] BUY | $3345.20 | conf:72% | TRENDING_UP | bias:H4:BULLISH H1:BULLISH M15:BULLISH
   Entry:$3343.00 TP:$3358.00 SL:$3336.00 → ✅ WIN (exit $3358.20)
   "Tren naik kuat, EMA-50/89 stack bullish, RSI-14 masih ruang naik"
2. [08:30 WIB] WAIT | $3341.80 | conf:44% | CONSOLIDATION
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
1. 📌 LONG-TERM MEMORY (catatan permanen AI, max 10)
          ↓
2. 🧠 SHORT-TERM MEMORY (10 siklus terakhir + stats + refleksi)
          ↓
3. ⚠️ KALENDER EKONOMI (event hari ini + alert level)
          ↓
4. 📡 DATA PASAR REAL-TIME (harga + 5 timeframe + SEMUA varian indikator + analysis_meta)
          ↓
5. Instruksi: "Berikan analisis dan keputusan trading Atlas sekarang"
```

---

## Long-Term Memory Operations

AI mengelola LTM sendiri via field `long_term_memory_ops` dalam output JSON:

```json
{
  "long_term_memory_ops": [
    { "op": "ADD", "content": "Support kuat $3300 sudah diuji 3x — demand zone kuat" },
    { "op": "UPDATE", "id": "abc123", "content": "Support $3300 sudah jebol — tidak valid lagi" },
    { "op": "DELETE", "id": "def456" }
  ]
}
```

Kapasitas maks 10 catatan. AI diharapkan DELETE catatan lama sebelum ADD yang baru jika sudah penuh.

---

## Limitasi & Catatan

### Persistent (Tidak Reset saat Restart)
Memory disimpan ke file JSON:
- `data/memory.json` — short-term memory (riwayat siklus + stats)
- `data/long_term_notes.json` — long-term memory (catatan permanen AI)

### Signal Store Tidak Persisted
`signal-store.ts` menyimpan sinyal **in-memory** saja (max 100). Riwayat sinyal **reset saat server restart**. Win rate dihitung ulang dari nol setiap restart.

### Token per Siklus
Setiap siklus analisis mengirim ~8.000–15.000 token ke LLM (memori + kalender + semua indikator multi-varian + 5 timeframe).
Jika model punya context window terbatas, pertimbangkan kurangi `MAX_MEMORY` dari 20 ke 5–10 di `ai-agent.ts`.

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
  lines.push("\n### ATR 5 siklus terakhir:");
  // ...
}
```
