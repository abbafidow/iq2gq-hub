const API_URL = "https://script.google.com/macros/s/AKfycbxkk34u9pyYb6KIKZ6J08owwLmqiT_WXBfHkXtDhdsW4PDlZZ3wn9yWmmJafudaYCEG/exec";

const statusEl = document.getElementById("status");
const rowCountEl = document.getElementById("rowCount");
const headerCountEl = document.getElementById("headerCount");
const tableHead = document.querySelector("#previewTable thead");
const tableBody = document.querySelector("#previewTable tbody");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadData() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);

    const headers = Array.isArray(payload.headers) ? payload.headers : [];
    const rows = Array.isArray(payload.data) ? payload.data : [];

    statusEl.textContent = "Connected to Google Sheets";
    statusEl.className = "status ok";
    rowCountEl.textContent = Number(payload.count || rows.length).toLocaleString();
    headerCountEl.textContent = headers.length.toLocaleString();

    const previewHeaders = headers.slice(0, 10);
    tableHead.innerHTML = `<tr>${previewHeaders.map(h => `<th>${esc(h)}</th>`).join("")}</tr>`;
    tableBody.innerHTML = rows.slice(0, 10).map(row => {
      return `<tr>${previewHeaders.map(h => `<td>${esc(row[h])}</td>`).join("")}</tr>`;
    }).join("");
  } catch (err) {
    statusEl.textContent = `Connection failed: ${err.message}`;
    statusEl.className = "status bad";
    console.error(err);
  }
}

loadData();
