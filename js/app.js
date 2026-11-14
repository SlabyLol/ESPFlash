/**
 * ESPFlash – Browser-based ESP flasher
 * Powered by esptool-js (Espressif)
 */

import {
  ESPLoader,
  Transport,
} from "https://unpkg.com/esptool-js@0.7.1/lib/index.js?module";

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

const els = {
  unsupported: $("#unsupported"),
  btnConnect: $("#btn-connect"),
  btnDisconnect: $("#btn-disconnect"),
  btnProgram: $("#btn-program"),
  btnErase: $("#btn-erase"),
  btnReset: $("#btn-reset"),
  btnAddFile: $("#btn-add-file"),
  btnClearLog: $("#btn-clear-log"),
  chipLabel: $("#chip-label"),
  fileList: $("#file-list"),
  console: $("#console"),
  baudrate: $("#baudrate"),
  flashMode: $("#flash-mode"),
  flashFreq: $("#flash-freq"),
  flashSize: $("#flash-size"),
  eraseAll: $("#erase-all"),
  compress: $("#compress"),
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let device = null;
let transport = null;
let esploader = null;
let chip = null;
let fileRows = []; // { id, address, file, data (Uint8Array) }
let nextRowId = 1;

// ---------------------------------------------------------------------------
// Terminal adapter for esptool-js
// ---------------------------------------------------------------------------
const terminal = {
  clean() {},
  writeLine(data) {
    log(String(data), "info");
  },
  write(data) {
    const span = document.createElement("span");
    span.className = "log-info";
    span.textContent = String(data);
    els.console.appendChild(span);
    els.console.scrollTop = els.console.scrollHeight;
  },
};

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(msg, type = "info") {
  const line = document.createElement("div");
  line.className = `log-${type}`;
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  line.textContent = `[${time}] ${msg}`;
  els.console.appendChild(line);
  els.console.scrollTop = els.console.scrollHeight;
}

function clearLog() {
  els.console.innerHTML = "";
}

// ---------------------------------------------------------------------------
// Browser support check
// ---------------------------------------------------------------------------
function checkSupport() {
  const supported = "serial" in navigator;
  if (!supported) {
    els.unsupported.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  return supported;
}

// ---------------------------------------------------------------------------
// File rows
// ---------------------------------------------------------------------------
function addFileRow(defaultAddress = "0x10000") {
  const id = nextRowId++;
  const row = document.createElement("div");
  row.className = "file-row";
  row.dataset.id = id;

  row.innerHTML = `
    <input type="text" class="addr" value="${defaultAddress}" spellcheck="false" title="Flash address (hex)" />
    <div class="file-name empty">No file selected</div>
    <div style="display:flex;gap:0.35rem;align-items:center">
      <button type="button" class="btn btn-secondary btn-sm btn-choose">Choose</button>
      <button type="button" class="btn-remove" title="Remove">×</button>
    </div>
    <input type="file" accept=".bin,.hex,application/octet-stream" />
  `;

  const addrInput = row.querySelector(".addr");
  const nameEl = row.querySelector(".file-name");
  const chooseBtn = row.querySelector(".btn-choose");
  const removeBtn = row.querySelector(".btn-remove");
  const fileInput = row.querySelector('input[type="file"]');

  const entry = { id, address: defaultAddress, file: null, data: null };

  chooseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    if (!f) return;
    entry.file = f;
    nameEl.textContent = f.name;
    nameEl.classList.remove("empty");
    nameEl.title = `${f.name} (${(f.size / 1024).toFixed(1)} KB)`;

    const buf = await f.arrayBuffer();
    entry.data = new Uint8Array(buf);
    log(`Loaded ${f.name} (${entry.data.length} bytes)`, "ok");
    updateProgramButton();
  });

  addrInput.addEventListener("change", () => {
    entry.address = addrInput.value.trim() || "0x0";
  });

  removeBtn.addEventListener("click", () => {
    row.remove();
    fileRows = fileRows.filter((r) => r.id !== id);
    updateProgramButton();
  });

  fileRows.push(entry);
  els.fileList.appendChild(row);
  updateProgramButton();
}

function updateProgramButton() {
  const hasFiles = fileRows.some((r) => r.data);
  const connected = !!esploader;
  els.btnProgram.disabled = !(connected && hasFiles);
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
async function connect() {
  try {
    log("Requesting serial port…", "cmd");
    device = await navigator.serial.requestPort({});
    transport = new Transport(device, true);

    const baud = parseInt(els.baudrate.value, 10);
    esploader = new ESPLoader({
      transport,
      baudrate: baud,
      terminal,
      debugLogging: false,
    });

    chip = await esploader.main();

    els.chipLabel.textContent = chip;
    els.chipLabel.classList.remove("hidden");
    els.btnConnect.classList.add("hidden");
    els.btnDisconnect.classList.remove("hidden");
    els.btnErase.disabled = false;
    els.btnReset.disabled = false;
    els.baudrate.disabled = true;

    log(`Connected to ${chip}`, "ok");
    updateProgramButton();
  } catch (err) {
    log(`Connect failed: ${err.message || err}`, "err");
    console.error(err);
    await safeDisconnect();
  }
}

async function safeDisconnect() {
  try {
    if (transport) {
      await transport.disconnect();
    }
  } catch (_) {}
  device = null;
  transport = null;
  esploader = null;
  chip = null;

  els.chipLabel.classList.add("hidden");
  els.btnConnect.classList.remove("hidden");
  els.btnDisconnect.classList.add("hidden");
  els.btnErase.disabled = true;
  els.btnReset.disabled = true;
  els.btnProgram.disabled = true;
  els.baudrate.disabled = false;
}

async function disconnect() {
  log("Disconnecting…", "cmd");
  await safeDisconnect();
  log("Disconnected", "info");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseAddress(str) {
  const s = (str || "0x0").trim().toLowerCase();
  if (s.startsWith("0x")) return parseInt(s, 16);
  return parseInt(s, 10) || 0;
}

/**
 * Convert Uint8Array → binary string required by older/newer esptool-js writeFlash
 */
function toBinaryString(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Program / Erase / Reset
// ---------------------------------------------------------------------------
async function program() {
  if (!esploader) return;

  const files = fileRows
    .filter((r) => r.data)
    .map((r) => ({
      data: toBinaryString(r.data),
      address: parseAddress(r.address),
    }));

  if (files.length === 0) {
    log("No firmware files selected", "warn");
    return;
  }

  files.sort((a, b) => a.address - b.address);

  const flashOptions = {
    fileArray: files,
    flashSize: els.flashSize.value,
    flashMode: els.flashMode.value,
    flashFreq: els.flashFreq.value,
    eraseAll: els.eraseAll.checked,
    compress: els.compress.checked,
    reportProgress: (fileIndex, written, total) => {
      const pct = total ? ((written / total) * 100).toFixed(1) : "0";
      const last = els.console.lastElementChild;
      if (last && last.dataset.progress === "1") {
        last.textContent = `[${new Date().toLocaleTimeString("en-GB", { hour12: false })}] Writing file ${fileIndex + 1}: ${pct}% (${written}/${total})`;
      } else {
        const line = document.createElement("div");
        line.className = "log-cmd";
        line.dataset.progress = "1";
        line.textContent = `Writing file ${fileIndex + 1}: ${pct}%`;
        els.console.appendChild(line);
      }
      els.console.scrollTop = els.console.scrollHeight;
    },
  };

  els.btnProgram.disabled = true;
  els.btnErase.disabled = true;
  els.btnReset.disabled = true;

  try {
    log("Starting flash…", "cmd");
    await esploader.writeFlash(flashOptions);
    log("Flash completed successfully!", "ok");
  } catch (err) {
    log(`Flash failed: ${err.message || err}`, "err");
    console.error(err);
  } finally {
    els.btnProgram.disabled = false;
    els.btnErase.disabled = false;
    els.btnReset.disabled = false;
    updateProgramButton();
  }
}

async function eraseFlash() {
  if (!esploader) return;
  if (!confirm("Erase the entire flash? This cannot be undone.")) return;

  els.btnErase.disabled = true;
  els.btnProgram.disabled = true;
  try {
    log("Erasing flash…", "cmd");
    await esploader.eraseFlash();
    log("Flash erased", "ok");
  } catch (err) {
    log(`Erase failed: ${err.message || err}`, "err");
  } finally {
    els.btnErase.disabled = false;
    updateProgramButton();
  }
}

async function resetDevice() {
  if (!transport) return;
  try {
    log("Resetting device…", "cmd");
    await transport.setDTR(false);
    await new Promise((r) => setTimeout(r, 100));
    await transport.setDTR(true);
    log("Reset pulse sent", "ok");
  } catch (err) {
    log(`Reset failed: ${err.message || err}`, "err");
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
  if (!checkSupport()) return;

  // Pre-fill typical ESP32 layout (user can change / remove)
  addFileRow("0x1000");  // bootloader
  addFileRow("0x8000");  // partition table
  addFileRow("0x10000"); // application

  els.btnConnect.addEventListener("click", connect);
  els.btnDisconnect.addEventListener("click", disconnect);
  els.btnProgram.addEventListener("click", program);
  els.btnErase.addEventListener("click", eraseFlash);
  els.btnReset.addEventListener("click", resetDevice);
  els.btnAddFile.addEventListener("click", () => addFileRow("0x0"));
  els.btnClearLog.addEventListener("click", clearLog);

  log("ESPFlash ready. Connect your device to begin.", "info");
  log("Supported chips: ESP8266, ESP32, ESP32-S2/S3, ESP32-C2/C3/C5/C6, ESP32-H2, ESP32-P4", "info");
}

init();
