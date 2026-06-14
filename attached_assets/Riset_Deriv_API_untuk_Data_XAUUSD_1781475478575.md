# Riset Deriv API untuk Data XAUUSD

Berdasarkan dokumentasi resmi Deriv API, berikut adalah temuan kunci untuk mengimplementasikan pengambilan data XAUUSD:

## 1. Koneksi Dasar
*   **URL WebSocket**: `wss://ws.derivws.com/websockets/v3` (atau `wss://ws.binaryws.com/websockets/v3`)
*   **Library Python**: `websockets` dan `asyncio`.

## 2. Identifikasi Simbol (XAUUSD)
*   Simbol untuk Gold (XAUUSD) di Deriv biasanya adalah `frxXAUUSD` (Forex Gold/USD).
*   Untuk memastikan, kita perlu memanggil `active_symbols` dengan `product_type: 'basic'`.

## 3. Pengambilan Data Ticks (Real-time)
Untuk berlangganan aliran harga real-time:
```json
{
  "ticks": "frxXAUUSD",
  "subscribe": 1,
  "req_id": 2
}
```

## 4. Pengambilan Data Candles (Historis)
Untuk mengambil data candlestick (OHLCV) guna analisis teknikal:
```json
{
  "ticks_history": "frxXAUUSD",
  "adjust_start_time": 1,
  "count": 100,
  "end": "latest",
  "granularity": 3600,
  "style": "candles"
}
```
*   **Granularity**: 60 (1m), 300 (5m), 900 (15m), 3600 (1h), 14400 (4h), 86400 (1d).
*   **Style**: Harus disetel ke `"candles"` untuk mendapatkan format OHLC. Jika `"ticks"`, hanya akan mengembalikan daftar harga penutupan.

## 5. Struktur Respons Candles
Respons untuk gaya `"candles"` akan berisi array objek candle:
```json
{
  "candles": [
    {
      "close": "2325.50",
      "epoch": 1718352000,
      "high": "2326.00",
      "low": "2324.80",
      "open": "2325.10"
    },
    ...
  ],
  "msg_type": "candles"
}
```

## 6. Otentikasi (Opsional untuk Data Market)
Data market publik (ticks/candles) biasanya tidak memerlukan otentikasi. Namun, untuk fitur trading atau batas rate yang lebih tinggi, gunakan:
```json
{
  "authorize": "YOUR_API_TOKEN",
  "req_id": 1
}
```

## 7. Catatan Penting
*   Deriv API menggunakan WebSocket, sehingga bot harus mengelola koneksi yang persisten dan menangani *reconnection*.
*   Data yang diterima adalah dalam format JSON.
*   Penting untuk menangani `error` dalam setiap respons.

Temuan ini akan digunakan sebagai dasar untuk membangun modul akuisisi data di fase berikutnya.
