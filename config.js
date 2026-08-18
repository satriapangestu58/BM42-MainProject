// URL deployment Apps Script yang sudah terbukti bekerja.
const BM42_API_URL = "https://script.google.com/macros/s/AKfycbwE7iZEI8zOcM1p6Ny1H30gvYzjxNO_e1edo4ZtgJnwMFEJGkbx7uLiMUXnInSGOOUM/exec";

// Nilai awal penilai. Dapat diganti dari antarmuka tanpa mengubah kode.
const BM42_DEFAULT_EVALUATOR_ID = "SC-01";

// Jeda polling status backend.
const BM42_STATE_POLL_MS = 8000;

// Jeda scanner agar QR yang sama tidak langsung dikirim berulang.
const BM42_SCAN_COOLDOWN_MS = 2500;
