# Arsitektur Bot Telegram AI Agent Otonom XAUUSD dengan 'Kesadaran Pasar'

Dokumen ini merinci arsitektur yang diusulkan untuk bot Telegram AI agent otonom yang dirancang untuk menganalisis pasar XAUUSD dengan pendekatan "kesadaran pasar" (market consciousness), menggunakan Deriv API untuk data dan di-deploy di Replit. Tujuannya adalah untuk menghasilkan sinyal *entry* buy/sell yang cerdas, bukan sekadar berdasarkan aturan kaku.

## 1. Visi 'Kesadaran Pasar'

Konsep "kesadaran pasar" berarti bot tidak hanya memproses data secara mekanis, tetapi juga menginterpretasikan konteks pasar secara holistik, mirip dengan seorang *trader* manusia berpengalaman. Ini melibatkan:

*   **Pemahaman Multi-Dimensi**: Menggabungkan analisis teknikal, *price action*, sentimen, dan potensi dampak berita.
*   **Penalaran Kontekstual**: Mempertimbangkan kondisi pasar saat ini (tren, volatilitas, fase konsolidasi) saat mengevaluasi sinyal.
*   **Fleksibilitas Strategi**: Tidak terikat pada satu set aturan *hardcoded*, melainkan mampu menyesuaikan pendekatan berdasarkan kondisi pasar yang berkembang.
*   **Penjelasan Naratif**: Mampu menjelaskan *mengapa* sinyal diberikan, bukan hanya memberikan sinyal itu sendiri.

## 2. Komponen Arsitektur

### 2.1. Lingkungan Hosting: Replit

*   **Fungsi**: Menyediakan lingkungan pengembangan dan *runtime* untuk bot. Memanfaatkan fitur "Always On" (jika tersedia) atau *Uptime Robot* untuk menjaga bot tetap aktif.
*   **Fitur Kunci**: Replit Secrets (untuk API Keys), Replit Database (untuk persistensi data state).

### 2.2. Antarmuka Bot Telegram

*   **Fungsi**: Menangani semua interaksi dengan pengguna Telegram. Menerima perintah, mengirimkan sinyal, laporan, dan penjelasan.
*   **Teknologi**: `python-telegram-bot` library. Akan dikonfigurasi untuk menerima *webhook* dari Telegram.

### 2.3. Modul Akuisisi Data: Deriv API

*   **Fungsi**: Mengambil data harga XAUUSD secara *real-time* dan historis dari Deriv API. Ini akan menjadi "mata" bot ke pasar.
*   **Jenis Data**: 
    *   **Ticks**: Untuk analisis *price action* yang sangat detail dan *real-time*.
    *   **Candles (OHLCV)**: Untuk analisis pada berbagai *timeframe* (M1, M5, M15, H1, H4, D1).
*   **Teknologi**: Library `websocket` Python untuk koneksi *real-time* ke Deriv API, atau `requests` untuk data historis jika tersedia melalui REST.

### 2.4. Modul "Sensory Data" (Input untuk AI)

Ini adalah komponen krusial yang akan mengubah data mentah dari Deriv API menjadi "persepsi" yang dapat dipahami oleh AI. Modul ini akan menghasilkan berbagai indikator dan pola *price action* tanpa *hardcoding* strategi, melainkan sebagai *input* yang kaya konteks.

*   **Fungsi**: Menghitung berbagai indikator teknikal dan mengidentifikasi pola *price action* pada berbagai *timeframe*.
*   **Output**: Data terstruktur (JSON atau Pandas DataFrame) yang berisi:
    *   **Indikator Tren**: Moving Averages (SMA, EMA) pada periode berbeda, ADX, Ichimoku Cloud.
    *   **Indikator Momentum**: RSI, MACD, Stochastic Oscillator.
    *   **Indikator Volatilitas**: Bollinger Bands, ATR.
    *   **Pola Candlestick**: Identifikasi pola seperti Doji, Hammer, Engulfing, dll.
    *   **Struktur Pasar**: Identifikasi *swing high/low*, *support/resistance* kunci, tren naik/turun, konsolidasi.
    *   **Volume**: Jika tersedia dari Deriv API.
*   **Teknologi**: `pandas_ta` atau `TA-Lib` untuk perhitungan indikator. Logika Python kustom untuk identifikasi pola *price action* dan struktur pasar.

### 2.5. AI Agent (Large Language Model - LLM)

Ini adalah "otak" bot yang akan mencapai "kesadaran pasar". LLM akan menerima semua "sensory data" dan menggunakannya untuk penalaran dan pengambilan keputusan.

*   **Fungsi**: Menganalisis *output* dari Modul "Sensory Data", menginterpretasikan kondisi pasar secara naratif, mengidentifikasi peluang *entry* buy/sell, dan memberikan penjelasan logis.
*   **Prompting Strategi Otonom**: Ini adalah kunci. Prompt ke LLM akan dirancang untuk:
    *   **Memberikan Konteks Lengkap**: Menyertakan semua indikator, pola, dan struktur pasar dari berbagai *timeframe*.
    *   **Meminta Analisis Holistik**: Mendorong LLM untuk mempertimbangkan semua faktor, bukan hanya satu indikator.
    *   **Meminta Penalaran**: Meminta LLM untuk menjelaskan *mengapa* ia merekomendasikan buy/sell, apa risiko yang terlihat, dan kondisi apa yang bisa membatalkan sinyal.
    *   **Meminta Sinyal dengan Kondisi**: Sinyal tidak hanya "BUY", tetapi "BUY jika harga menembus level X dengan konfirmasi Y, target Z, stop loss W".
    *   **Meminta Penilaian Kepercayaan**: LLM dapat memberikan tingkat kepercayaan pada sinyalnya.
*   **Teknologi**: Integrasi dengan API LLM (misalnya, OpenAI GPT-4, Gemini API). Pemilihan model akan didasarkan pada kemampuan penalaran dan pemahaman konteks.

### 2.6. Modul Pengambilan Keputusan & Filter Sinyal

*   **Fungsi**: Menerima analisis dan sinyal dari LLM. Modul ini dapat bertindak sebagai filter terakhir atau menambahkan lapisan logika tambahan (misalnya, manajemen risiko dasar, memastikan sinyal tidak terlalu sering).
*   **Teknologi**: Logika Python. Mungkin juga melibatkan *fine-tuning* LLM atau *reinforcement learning* sederhana di masa depan untuk mengoptimalkan akurasi sinyal berdasarkan *feedback*.

### 2.7. Modul Notifikasi & Pelaporan

*   **Fungsi**: Mengirimkan sinyal *entry* buy/sell, penjelasan, dan laporan berkala kepada pengguna melalui Telegram.
*   **Format Pesan**: Sinyal akan mencakup: Pair (XAUUSD), Arah (Buy/Sell), Harga Entry, Target Profit, Stop Loss, dan **Penjelasan Naratif dari AI**.
*   **Teknologi**: `python-telegram-bot` untuk pengiriman pesan. `APScheduler` (atau mekanisme *cron-like* di Replit) untuk laporan berkala.

### 2.8. Database (Replit Database / SQLite)

*   **Fungsi**: Menyimpan *state* bot (misalnya, histori sinyal yang sudah dikirim, konfigurasi pengguna, log aktivitas, data historis yang di-cache untuk mengurangi panggilan API berulang ke Deriv).
*   **Teknologi**: Replit Database (jika cocok untuk kebutuhan) atau SQLite untuk persistensi data lokal di Replit.

## 3. Alur Kerja Otonom (The Agentic Loop)

1.  **Pemicu (Trigger)**:
    *   **Webhook Telegram**: Untuk perintah pengguna instan.
    *   **Scheduled Task (Replit Cron/Uptime Robot)**: Memicu siklus analisis pasar secara berkala (misalnya, setiap 5-15 menit).
2.  **Akuisisi Data**: Modul Akuisisi Data mengambil data XAUUSD terbaru (ticks dan candles) dari Deriv API.
3.  **Persepsi Pasar**: Modul "Sensory Data" memproses data mentah menjadi indikator teknikal, pola *price action*, dan struktur pasar pada berbagai *timeframe*.
4.  **Penalaran AI**: Semua "sensory data" dikirim ke AI Agent (LLM) melalui *prompt* yang dirancang khusus. LLM menganalisis, menalar, dan menghasilkan rekomendasi sinyal *entry* buy/sell beserta penjelasannya.
5.  **Validasi Sinyal**: Modul Pengambilan Keputusan & Filter Sinyal memvalidasi dan memfinalisasi sinyal dari LLM.
6.  **Tindakan**: Jika sinyal valid, Modul Notifikasi & Pelaporan mengirimkan sinyal lengkap (arah, harga, TP, SL, penjelasan AI) ke Telegram.
7.  **Persistensi**: Data sinyal, log, dan *state* relevan disimpan ke database.

## 4. Pertimbangan Penting

*   **Kualitas Prompt LLM**: Keberhasilan "kesadaran pasar" sangat bergantung pada kualitas *prompt* yang diberikan ke LLM. Ini akan menjadi area iterasi dan penyempurnaan yang intensif.
*   **Manajemen Risiko**: Meskipun AI memberikan sinyal, penting untuk mengintegrasikan manajemen risiko dasar (misalnya, ukuran posisi, rasio risiko-reward) ke dalam logika bot atau sebagai informasi tambahan untuk pengguna.
*   **Latensi Deriv API**: Memastikan pengambilan data cukup cepat untuk analisis *real-time*.
*   **Biaya LLM API**: Memantau penggunaan API LLM agar tetap dalam anggaran.

Dengan arsitektur ini, kita akan membangun bot yang tidak hanya memberikan sinyal, tetapi juga "berpikir" dan "menjelaskan" seperti seorang *trader* yang sadar akan kondisi pasar. Ini adalah fondasi yang kuat untuk fase pengembangan selanjutnya.
