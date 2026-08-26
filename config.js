// Isi dengan URL /exec deployment Apps Script tunggal untuk BM42.
// Backend v11 menangani scanner dan penilaian.
// Contoh:
// const BM42_API_URL = "https://script.google.com/macros/s/DEPLOYMENT_ID/exec";
const BM42_API_URL = "PASTE_NEW_APPS_SCRIPT_EXEC_URL_HERE";
const BM42_DEFAULT_EVALUATOR_ID = "SC-01";
const BM42_STATE_POLL_MS = 30000;
const BM42_SCAN_COOLDOWN_MS = 2500;
