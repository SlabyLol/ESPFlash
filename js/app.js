/**
 * ESPFlash – fully working browser ESP flasher
 * Uses esptool-js 0.7.1 (Uint8Array file data)
 */

import {
  ESPLoader,
  Transport,
} from "https://unpkg.com/esptool-js@0.7.1/lib/index.js?module";

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
  progressWrap: $("#progress-wrap"),
  progressFill: $("#progress-fill"),
  progressText: $("#progress-text"),
};

let device = null;
let transport = null;
let esploader = null;
let chip = null;
let fileRows = [];
let nextRowId = 1;
let isBusy = false;

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

function setProgress(pct) {
  const v = Math.max(0, Math.min(100, pct));
  els.progressFill.style.width = `${v}%`;
  els.progressText.textContent = `${v.toFixed(0)}%`;
}

function showProgress(show) {
  if (show) {
    els.progressWrap.classList.remove("hidden");
    setProgress(0);
  } else {
    els.progressWrap.classList.add("hidden");
  }
}

function setBusy(busy) {
  isBusy = busy;
  els.btnProgram.disabled = busy || !esploader || !fileRows.some((r) => r.data);
  els.btnErase.disabled = busy || !esploader;
  els.btnReset.disabled = busy || !esploader;
  els.btnConnect.disabled = busy;
  els.btnDisconnect.disabled = busy;
  els.btnAddFile.disabled = busy;
}

function checkSupport() {
  const supported = "serial" in navigator;
  if (!supported) {
    els.unsupported.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  return supported;
}

function parseAddress(str) {
  const s = (str || "0x0").trim().toLowerCase();
  if (s.startsWith("0x")) return parseInt(s, 16);
  return parseInt(s, 10) || 0;
}

function updateProgramButton() {
  if (isBusy) return;
  const hasFiles = fileRows.some((r) => r.data);
  els.btnProgram.disabled = !(esploader && hasFiles);
}

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
    <input type="file" accept=".bin,application/octet-stream" />
  `;

  const addrInput = row.querySelector(".addr");
  const nameEl = row.querySelector(".file-name");
  const chooseBtn = row.querySelector(".btn-choose");
  const removeBtn = row.querySelector(".btn-remove");
  const fileInput = row.querySelector('input[type="file"]');

  const entry = { id, address: defaultAddress, file: null, data: null };

  chooseBtn.addEventListener("click", () => {
    if (!isBusy) fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;

    try {
      const buf = await f.arrayBuffer();
      entry.data = new Uint8Array(buf);
      entry.file = f;
      nameEl.textContent = f.name;
      nameEl.classList.remove("empty");
      nameEl.title = `${f.name} (${(entry.data.length / 1024).toFixed(1)} KB)`;
      log(`Loaded ${f.name} (${entry.data.length} bytes)`, "ok");
      updateProgramButton();
    } catch (err) {
      log(`Failed to read file: ${err.message || err}`, "err");
    }
  });

  addrInput.addEventListener("change", () => {
    entry.address = addrInput.value.trim() || "0x0";
  });

  removeBtn.addEventListener("click", () => {
    if (isBusy) return;
    row.remove();
    fileRows = fileRows.filter((r) => r.id !== id);
    updateProgramButton();
  });

  fileRows.push(entry);
  els.fileList.appendChild(row);
  updateProgramButton();
}

async function connect() {
  if (isBusy) return;
  setBusy(true);
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

    log("Connecting and detecting chip…", "cmd");
    chip = await esploader.main();

    els.chipLabel.textContent = chip;
    els.chipLabel.classList.remove("hidden");
    els.btnConnect.classList.add("hidden");
    els.btnDisconnect.classList.remove("hidden");
    els.baudrate.disabled = true;

    log(`Connected to ${chip}`, "ok");
  } catch (err) {
    log(`Connect failed: ${err.message || err}`, "err");
    console.error(err);
    await safeDisconnect();
  } finally {
    setBusy(false);
    updateProgramButton();
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
  els.baudrate.disabled = false;
  showProgress(false);
}

async function disconnect() {
  if (isBusy) return;
  log("Disconnecting…", "cmd");
  await safeDisconnect();
  log("Disconnected", "info");
  updateProgramButton();
}

async function program() {
  if (!esploader || isBusy) return;

  const files = fileRows
    .filter((r) => r.data instanceof Uint8Array && r.data.length > 0)
    .map((r) => ({
      data: r.data,
      address: parseAddress(r.address),
    }));

  if (files.length === 0) {
    log("No firmware files selected", "warn");
    return;
  }

  files.sort((a, b) => a.address - b.address);

  const totalBytes = files.reduce((sum, f) => sum + f.data.length, 0);
  log(`Flashing ${files.length} file(s), ${totalBytes} bytes total…`, "cmd");
  files.forEach((f, i) => {
    log(`  [${i + 1}] 0x${f.address.toString(16)} – ${f.data.length} bytes`, "info");
  });

  const flashOptions = {
    fileArray: files,
    flashSize: els.flashSize.value,
    flashMode: els.flashMode.value,
    flashFreq: els.flashFreq.value,
    eraseAll: els.eraseAll.checked,
    compress: els.compress.checked,
    reportProgress: (fileIndex, written, total) => {
      const filePct = total ? written / total : 0;
      let done = 0;
      for (let i = 0; i < fileIndex; i++) done += files[i].data.length;
      done += filePct * files[fileIndex].data.length;
      const overall = totalBytes ? (done / totalBytes) * 100 : 0;
      setProgress(overall);
    },
  };

  setBusy(true);
  showProgress(true);

  try {
    await esploader.writeFlash(flashOptions);
    setProgress(100);
    log("Flash completed successfully!", "ok");

    try {
      await esploader.after("hard_reset");
      log("Device reset – firmware should be running", "ok");
    } catch (resetErr) {
      log(`Post-flash reset note: ${resetErr.message || resetErr}`, "warn");
    }
  } catch (err) {
    log(`Flash failed: ${err.message || err}`, "err");
    console.error(err);
  } finally {
    setBusy(false);
    showProgress(false);
    updateProgramButton();
  }
}

async function eraseFlash() {
  if (!esploader || isBusy) return;
  if (!confirm("Erase the entire flash? This cannot be undone.")) return;

  setBusy(true);
  showProgress(true);
  setProgress(10);

  try {
    log("Erasing flash…", "cmd");
    await esploader.eraseFlash();
    setProgress(100);
    log("Flash erased", "ok");
  } catch (err) {
    log(`Erase failed: ${err.message || err}`, "err");
    console.error(err);
  } finally {
    setBusy(false);
    showProgress(false);
    updateProgramButton();
  }
}

async function resetDevice() {
  if (!transport || isBusy) return;
  try {
    log("Sending reset pulse…", "cmd");
    await transport.setDTR(false);
    await new Promise((r) => setTimeout(r, 100));
    await transport.setDTR(true);
    log("Reset pulse sent", "ok");
  } catch (err) {
    log(`Reset failed: ${err.message || err}`, "err");
  }
}

function init() {
  if (!checkSupport()) return;

  addFileRow("0x1000");
  addFileRow("0x8000");
  addFileRow("0x10000");

  els.btnConnect.addEventListener("click", connect);
  els.btnDisconnect.addEventListener("click", disconnect);
  els.btnProgram.addEventListener("click", program);
  els.btnErase.addEventListener("click", eraseFlash);
  els.btnReset.addEventListener("click", resetDevice);
  els.btnAddFile.addEventListener("click", () => {
    if (!isBusy) addFileRow("0x0");
  });
  els.btnClearLog.addEventListener("click", clearLog);

  log("ESPFlash ready. Connect your device to begin.", "info");
  log(
    "Supported: ESP8266, ESP32, ESP32-S2/S3, ESP32-C2/C3/C5/C6, ESP32-H2, ESP32-P4",
    "info"
  );
}

init();
