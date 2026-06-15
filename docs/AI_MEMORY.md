# AI MEMORY SYSTEM — Cara Kerja Memori Atlas

## Masalah yang Dipecahkan

LLM secara default **stateless** — setiap panggilan adalah percakapan baru tanpa ingatan:
- AI tidak tahu dia baru saja memberi WAIT 3 menit lalu
- AI tidak tahu win rate-nya sendiri
- AI tidak bisa belajar dari hasil WIN/LOSS sebelumnya
- AI tidak bisa deteksi pola WAIT berlebihan (wait_streak)

**Solusi**: Setiap siklus, kita injek "paket memori + metacognition" sebelum data pasar. Ditambah, AI punya **long-term memory** yang ia kelola sendiri lintas sesi.

---

## Dua Lapisan Memori

### Short-Term Memory (Riwayat Siklus)
- Menyimpan **20 siklus analisis** terakhir
- Di-inject setiap siklus sebagai konteks
- Termasuk statistik agregat + metacognition (confidence bands, phase performance)
- **Persist ke disk** (`data/memory.json`)

### Long-Term Memory (AI-Managed Notes)
- AI menulis sendiri catatan permanen lintas sesi
- Max **10 catatan** aktif
- AI bisa ADD / UPDATE / DELETE via field `long_term_memory_ops`
- **Persist ke disk** (`data/long_term_notes.json`)

---

## Arsitektur Data Memori

```typescript
interface MemoryEntry {
  timestamp: string;
  timeWib: string;
  decision: "BUY" | "SELL" | "WAIT";
  confidence: number;
  price: number;
  market_phase: string;
  bias: { H4: string; H1: string; M15: string };
  confluence_score: number;
  market_context: string;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  lesson?: string;
  invalidation?: string;
  what_would_change_my_mind?: string | string[];
  result?: "WIN" | "LOSS" | "ACTIVE" | "EXPIRED";
  exit_price?: number;
  exit_time?: string;
}

interface SessionStats {
  wins: number;
  losses: number;
  totalSignals: number;      // BUY/SELL saja
  totalAnalyses: number;     // semua siklus
  waitCount: number;
  lastMarketPhases: string[];
  lastBiasH4: string[];
  // Metacognition
  confidenceBands: {
    high: { wins: number; losses: number };    // conf >= 0.80
    medium: { wins: number; losses: number };  // 0.60 <= conf < 0.80
  };
  phasePerformance: Record<string, { wins: number; losses: number }>;
}

interface LTMEntry {
  id: string;       // UUID
  content: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## analysis_meta — Data Tambahan untuk AI

Selain memori, AI juga menerima `analysis_meta`:

```json
{
  "analysis_meta": {
    "wait_streak_consecutive": 6,
    "h4_bias_persistence": "BEARISH bertahan 4 siklus berturut-turut"
  }
}
```

**`wait_streak_consecutive`** adalah kunci anti-WAIT-berlebihan:
- ≥ 3: AI wajib re-evaluasi apakah terlalu konservatif
- ≥ 6: AI hampir pasti harus BUY/SELL kecuali pasar tutup

---

## Format Konteks yang Diinjek ke AI

```
## 📌 CATATAN PERMANEN ATLAS
1. [abc123] Support kuat $4300 sudah diuji 3x — 12 Jun 2026
2. [def456] FOMC 18 Jun — ekspektasi hold, perhatikan dot plot

---

## 🧠 MEMORI ATLAS

### 📊 Statistik Sesi:
- Total analisis: 20 | Sinyal: 3 | WAIT: 17
- Hasil: 2 WIN / 1 LOSS → Win Rate: 67%
- Confidence bands: High (≥0.80): 1W/0L | Medium: 1W/1L
- Fase 5 siklus terakhir: RANGING → RANGING → TRENDING_DOWN → TRENDING_DOWN → TRENDING_DOWN
- Bias H4 dominan: BEARISH (4 siklus berturut-turut)

### 🕐 Riwayat 10 Analisis Terakhir:
1. [10:18 WIB] SELL | $4338.12 | conf:62% | TRENDING_DOWN | H4:BEARISH H1:BEARISH M15:NEUTRAL
   Entry:$4346.50 TP:$4321.36 SL:$4355.00 → ⏳ ACTIVE
   "EMA-50/89 bearish stack H4, RSI-14 turun dari 60 ke 45, harga rejection di resistance..."
2. [10:13 WIB] WAIT | $4340.20 | conf:42% | CONSOLIDATION
   "Belum ada konfirmasi entry yang jelas..."
...

### 🔎 Instruksi Refleksi Diri:
1. Apakah kondisi berubah dari siklus sebelumnya?
2. Jika ada sinyal AKTIF — harga sudah ke mana?
3. Jika baru LOSS — apa yang keliru?
4. Apakah bias H4 berubah konsisten (tanda tren nyata)?
5. Jika ≥3 WAIT berturut-turut — ada setup terlewat?
```

---

## Urutan Konteks dalam User Message

```
1. 📌 LONG-TERM MEMORY (catatan permanen AI, max 10)
          ↓
2. 🧠 SHORT-TERM MEMORY (20 siklus + stats + metacognition + refleksi)
          ↓
3. ⚠️ KALENDER EKONOMI (event hari ini + alert level)
          ↓
4. 📡 DATA PASAR REAL-TIME (harga + 5 TF + semua indikator + analysis_meta)
          ↓
5. Instruksi analisis
```

---

## Long-Term Memory Operations

```json
{
  "long_term_memory_ops": [
    { "op": "ADD", "content": "Support kuat $4300 sudah diuji 3x — demand zone kuat" },
    { "op": "UPDATE", "id": "abc123", "content": "Support $4300 jebol — tidak valid lagi" },
    { "op": "DELETE", "id": "def456" }
  ]
}
```

Max 10 catatan. AI diharapkan DELETE yang lama sebelum ADD jika sudah penuh.

---

## Limitasi

| Aspek | Detail |
|---|---|
| Short-term persist | `data/memory.json` — tidak reset saat restart |
| Long-term persist | `data/long_term_notes.json` — tidak reset saat restart |
| Signal store | **In-memory saja** — win rate reset saat restart |
| Token per siklus | ~8.000–15.000 token (5 TF × semua indikator + memori) |
| MAX_MEMORY | 20 siklus — ubah di `ai-agent.ts` jika perlu |

---

## Cara Extend Memori

```typescript
// Tambah field ke MemoryEntry di ai-agent.ts:
interface MemoryEntry {
  atr_m15?: number;    // contoh: simpan ATR untuk evaluasi SL
  session?: string;    // sesi trading saat sinyal
}

// Di recordAnalysis(), tambah:
entry.atr_m15 = timeframesData.find(t => t.timeframe === "M15")?.atr_14;

// Di buildMemoryContext(), tambah section:
lines.push("\n### ATR M15 trend:");
// ...
```
