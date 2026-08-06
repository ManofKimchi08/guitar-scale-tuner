/* ============================================================
   Scales, heard. — main application logic
   Pure vanilla JS, compatible with file:// and http(s)://
   ============================================================ */

// ---------- music data ----------
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DEG = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  major_pent: [0, 2, 4, 7, 9],
  minor_pent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10]
};
const SCALE_IDS = Object.keys(SCALES);

const TUNINGS = {
  standard: [64, 59, 55, 50, 45, 40],
  half_down: [63, 58, 54, 49, 44, 39],
  whole_down: [62, 57, 53, 48, 43, 38],
  drop_d: [64, 59, 55, 50, 45, 38],
  double_drop_d: [62, 59, 55, 50, 45, 38],
  drop_c: [62, 57, 53, 48, 43, 36],
  dadgad: [62, 57, 55, 50, 45, 38],
  open_g: [62, 59, 55, 50, 43, 38],
  open_d: [62, 57, 54, 50, 45, 38]
};
const TUNING_IDS = Object.keys(TUNINGS);

const CIRCLE_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const CIRCLE_MINOR = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];

const JAM_PROGRESSIONS = {
  pop: [0, 7, 9, 5],      // I - V - vi - IV
  jazz: [2, 7, 0, 9],     // ii - V - I - VI
  blues: [0, 5, 0, 7],    // I - IV - I - V
  sad: [0, 8, 3, 10]      // i - VI - III - VII
};

let currentTuningId = "standard";
let strings = [...TUNINGS[currentTuningId]];
let tuningMode = "preset"; // "preset" | "custom"
let guideMode = "scale"; // "scale" | "chord"
let chordTypeVal = "major"; // "major" | "minor" | "dom7" | "maj7" | "min7"
let isLeftHand = false;

// ---------- DOM & Math Helpers ----------
const $ = id => document.getElementById(id);
const pc = m => ((m % 12) + 12) % 12;
const freqToMidi = f => Math.round(69 + 12 * Math.log2(f / refPitch));
const midiToFreq = m => refPitch * Math.pow(2, (m - 69) / 12);
const centsOff = (f, m) => Math.round(1200 * Math.log2(f / midiToFreq(m)));
const inScale = m => SCALES[scaleId].includes(pc(m - rootPc));

// ---------- i18n ----------
let LANG = "en";
function t(key) {
  const dict = window.I18N || {};
  return (dict[LANG] && dict[LANG][key]) || (dict.en && dict.en[key]) || key;
}
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.documentElement.lang = LANG;
}
function initLang() {
  let saved = null;
  try { saved = localStorage.getItem("ehyo_lang"); } catch (e) { }
  LANG = saved || (navigator.language || "en").slice(0, 2);
  const dict = window.I18N || {};
  if (!dict[LANG]) LANG = "en";
  const sel = $("langSel");
  if (!sel) return;
  sel.innerHTML = "";
  const names = window.LANG_NAMES || {};
  Object.keys(dict).forEach(code => {
    const o = document.createElement("option");
    o.value = code; o.textContent = names[code] || code;
    sel.appendChild(o);
  });
  sel.value = LANG;
  sel.onchange = e => setLang(e.target.value);
}
function setLang(l) {
  LANG = l;
  try { localStorage.setItem("ehyo_lang", l); } catch (e) { }
  applyStaticI18n();
  rebuildScaleSel();
  rebuildTuningSel();
  refreshDynamic();
  drawFB();
}

// ---------- HMM 25-State Viterbi Chord Decoder ----------
const HMM_STATES = 25;
let hmmLogProbs = Array(HMM_STATES).fill(-Math.log(HMM_STATES));
let HMM_TEMPLATES = [];

function initHMMTemplates() {
  HMM_TEMPLATES = [];
  // 0..11 Major
  for (let r = 0; r < 12; r++) {
    const t = Array(12).fill(0.02);
    t[r] = 1.0; t[(r + 4) % 12] = 0.8; t[(r + 7) % 12] = 0.8;
    const sum = t.reduce((a, b) => a + b, 0);
    HMM_TEMPLATES.push(t.map(v => v / sum));
  }
  // 12..23 Minor
  for (let r = 0; r < 12; r++) {
    const t = Array(12).fill(0.02);
    t[r] = 1.0; t[(r + 3) % 12] = 0.8; t[(r + 7) % 12] = 0.8;
    const sum = t.reduce((a, b) => a + b, 0);
    HMM_TEMPLATES.push(t.map(v => v / sum));
  }
  // 24 No Chord
  HMM_TEMPLATES.push(Array(12).fill(1 / 12));
}
initHMMTemplates();

function runHMM(chroma, rms) {
  if (!chroma || chroma.length < 12) return 24;
  const P_SELF = 0.96;
  const P_OTHER = (1.0 - P_SELF) / (HMM_STATES - 1);
  const logP_SELF = Math.log(P_SELF);
  const logP_OTHER = Math.log(P_OTHER);

  const chromaSum = chroma.reduce((a, b) => a + b, 0);
  const normChroma = chromaSum > 0 ? chroma.map(v => v / chromaSum) : Array(12).fill(1 / 12);

  const logEmissions = Array(HMM_STATES);
  if (rms < 0.005) {
    for (let s = 0; s < 24; s++) logEmissions[s] = -10.0;
    logEmissions[24] = 0.0;
  } else {
    for (let s = 0; s < HMM_STATES; s++) {
      const tmpl = HMM_TEMPLATES[s];
      let dot = 0.0;
      for (let i = 0; i < 12; i++) dot += normChroma[i] * tmpl[i];
      logEmissions[s] = Math.log(Math.max(1e-6, dot));
    }
  }

  const newLogProbs = Array(HMM_STATES);
  for (let j = 0; j < HMM_STATES; j++) {
    let maxTrans = -Infinity;
    for (let i = 0; i < HMM_STATES; i++) {
      const trans = (i === j) ? logP_SELF : logP_OTHER;
      const score = hmmLogProbs[i] + trans;
      if (score > maxTrans) maxTrans = score;
    }
    newLogProbs[j] = maxTrans + logEmissions[j];
  }

  const normMax = Math.max(...newLogProbs);
  for (let s = 0; s < HMM_STATES; s++) hmmLogProbs[s] = newLogProbs[s] - normMax;

  let bestState = 24, bestScore = -Infinity;
  for (let s = 0; s < HMM_STATES; s++) {
    if (hmmLogProbs[s] > bestScore) {
      bestScore = hmmLogProbs[s];
      bestState = s;
    }
  }
  return bestState;
}

// ---------- Audio State & Engine ----------
let audioCtx = null, analyser = null, source = null, stream = null, raf = null, buf = null;
let running = false;
let rootPc = 9;                 // default A
let scaleId = "minor_pent";
let labelMode = "name";         // "name" | "deg"
let quizMode = false;
let targetInterval = 0;
let score = 0, streak = 0, lock = false;
let sensitivity = 0.015;
let stabNeeded = 4;
let history = [];
let litPcs = [];
let refPitch = 440;
let ws = null;

let monitorGainNode = null;
let isMonitoringEnabled = false;
let monitorVolume = 0.7;
let nextAsioPcmTime = 0;

// Scale Scanner State
let isScanning = false;
let scanInterval = null;
let scanDuration = 12000;
let scanTimeElapsed = 0;
let scanChromaHistory = Array(12).fill(0);

// Quiz & Arpeggio State
let targetChordName = "";
let targetChordPcs = [];
let detectedPcs = [];

// Voicing Guide State
let voicingMode = false;
let currentVoicingsList = [];
let currentVoicingIdx = 0;
let currentVoicing = null;

// Pitch Trajectory State
let pitchHistory = [];

// Jam Assistant State
let isJamPlaying = false;
let jamTimer = null;
let jamProgressionKey = "pop";
let jamBpm = 90;
let jamBarIndex = 0;
let jamTargetChordPcs = [];

// Metronome State
let isMetroPlaying = false;
let metroTimer = null;
let metroBpm = 100;
let metroBeatCount = 0;
let metroBarCount = 0;
let isAutoSpeedUp = true;

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function updateMonitoring() {
  if (monitorGainNode && audioCtx) {
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
  }
  sendMonitoringState();
}

function sendMonitoringState() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({
        type: "set_monitoring",
        enabled: isMonitoringEnabled,
        volume: monitorVolume
      }));
    } catch (e) { }
  }
}

function sendRefPitch() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_ref_pitch", value: refPitch }));
  }
}

function playAsioPcmChunk(pcmData, sampleRate = 44100) {
  if (!isMonitoringEnabled || !pcmData || pcmData.length === 0) return;
  ensureAudioCtx();

  if (!monitorGainNode && audioCtx) {
    monitorGainNode = audioCtx.createGain();
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
    monitorGainNode.connect(audioCtx.destination);
  }

  const buffer = audioCtx.createBuffer(1, pcmData.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < pcmData.length; i++) {
    channelData[i] = pcmData[i];
  }

  const sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = buffer;

  // Resource Cleanup on Completion
  sourceNode.onended = () => {
    try { sourceNode.disconnect(); } catch (e) { }
  };

  if (monitorGainNode) {
    sourceNode.connect(monitorGainNode);
  } else {
    sourceNode.connect(audioCtx.destination);
  }

  const now = audioCtx.currentTime;
  const MAX_PCM_LATENCY = 0.035; // Maximum 35ms allowed queue latency
  if (nextAsioPcmTime < now || (nextAsioPcmTime - now) > MAX_PCM_LATENCY) {
    nextAsioPcmTime = now + 0.005;
  }
  sourceNode.start(nextAsioPcmTime);
  nextAsioPcmTime += buffer.duration;
}

async function setAudioOutputDevice(deviceId) {
  ensureAudioCtx();
  if (typeof audioCtx.setSinkId === "function") {
    try {
      await audioCtx.setSinkId(deviceId);
      console.log("Audio output device set to:", deviceId);
    } catch (e) {
      console.warn("Failed to set audio output device:", e);
    }
  }
}

async function listOutputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(d => d.kind === "audiooutput");
    const sel = $("outputDeviceSel");
    if (!sel) return;
    const curVal = sel.value;
    sel.innerHTML = "";

    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = t("optDefaultOutput");
    sel.appendChild(defOpt);

    outputs.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || (`Output ${i + 1}`);
      sel.appendChild(opt);
    });

    if (curVal && Array.from(sel.options).some(o => o.value === curVal)) {
      sel.value = curVal;
    }
  } catch (e) {
    console.warn("Error listing output devices:", e);
  }
}

async function getStream(id) {
  const isSpecificId = id && id !== "mic_default" && id !== "asio_ws";
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      ...(isSpecificId ? { deviceId: { exact: id } } : {})
    }
  });
}

async function listDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const d = await navigator.mediaDevices.enumerateDevices();
  const ins = d.filter(x => x.kind === "audioinput"), sel = $("deviceSel");
  if (!sel) return;
  const curVal = sel.value;
  sel.innerHTML = "";

  const asioOpt = document.createElement("option");
  asioOpt.value = "asio_ws";
  asioOpt.textContent = `⚡ ${t("optAsioWebsocket")}`;
  sel.appendChild(asioOpt);

  ins.forEach((x, i) => {
    const o = document.createElement("option");
    o.value = x.deviceId;
    o.textContent = x.label || ("Input " + (i + 1));
    sel.appendChild(o);
  });

  if (curVal && Array.from(sel.options).some(o => o.value === curVal)) {
    sel.value = curVal;
  } else if (ins.length > 0) {
    sel.value = ins[0].deviceId;
  } else {
    sel.value = "asio_ws";
  }
  sel.disabled = false;
}

function connectAsioWs() {
  ensureAudioCtx();
  if (!monitorGainNode && audioCtx) {
    monitorGainNode = audioCtx.createGain();
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
    monitorGainNode.connect(audioCtx.destination);
  }
  return new Promise((resolve, reject) => {
    if (ws) {
      try { ws.close(); } catch (e) { }
    }
    $("verdict").textContent = t("verdictAsioConnecting");
    $("verdict").className = "verdict idle";

    ws = new WebSocket("ws://127.0.0.1:8765");
    let resolved = false;

    ws.onopen = () => {
      resolved = true;
      $("verdict").textContent = t("verdictAsioConnected");
      $("verdict").className = "verdict ok";
      $("err").textContent = "";
      sendRefPitch();
      sendMonitoringState();
      resolve();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.pcm) {
          playAsioPcmChunk(data.pcm);
        }
        updatePoly(data);
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onerror = (error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(t("verdictAsioError")));
      } else {
        $("err").textContent = t("verdictAsioError");
        $("verdict").textContent = t("verdictIdle");
        $("verdict").className = "verdict idle";
      }
    };
  });
}

function autoCorrelate(inputBuf, sr) {
  const SIZE = inputBuf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += inputBuf[i] * inputBuf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < sensitivity) return { f: -1, rms };

  let r1 = 0, r2 = SIZE - 1, th = 0.2;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(inputBuf[i]) < th) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(inputBuf[SIZE - i]) < th) { r2 = SIZE - i; break; } }
  const b = inputBuf.slice(r1, r2), N = b.length, c = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N - i; j++) s += b[j] * b[j + i]; c[i] = s; }

  let d = 0; while (d + 1 < N && c[d] > c[d + 1]) d++;
  let mv = -1, mp = -1;
  for (let i = d; i < N; i++) { if (c[i] > mv) { mv = c[i]; mp = i; } }
  let T = mp; if (T <= 0) return { f: -1, rms };
  const x1 = c[T - 1] || 0, x2 = c[T], x3 = c[T + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
  if (a) T = T - bb / (2 * a);
  const f = sr / T;
  if (f < 70 || f > 1400) return { f: -1, rms };
  return { f, rms };
}

// ---------- Pitch Tracker & Canvas ----------
function updatePitchTracker(cents) {
  const now = Date.now();
  pitchHistory.push({ time: now, cents: cents });
  pitchHistory = pitchHistory.filter(item => now - item.time <= 5000);

  drawPitchCanvas();

  if (pitchHistory.length > 10) {
    const centsArr = pitchHistory.map(x => x.cents);
    const mean = centsArr.reduce((a, b) => a + b, 0) / centsArr.length;
    const variance = centsArr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / centsArr.length;
    const stdDev = Math.sqrt(variance);

    const stabPct = Math.max(0, Math.min(100, Math.round(100 - stdDev * 3)));
    const stabEl = $("pitchStabilityVal");
    if (stabEl) {
      stabEl.textContent = stabPct + "%";
      if (stabPct > 80) stabEl.style.color = "var(--ok)";
      else if (stabPct > 50) stabEl.style.color = "#f59e0b";
      else stabEl.style.color = "var(--no)";
    }
  }
}

function drawPitchCanvas() {
  const canvas = $("pitchCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const centsToY = (c) => H / 2 - (c / 250) * (H / 2);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  [0, 100, 200, -100, -200].forEach(cVal => {
    const y = centsToY(cVal);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();

    ctx.fillStyle = cVal === 0 ? "#38bdf8" : (cVal > 0 ? "#f59e0b" : "#94a3b8");
    ctx.font = "10px sans-serif";
    ctx.fillText((cVal > 0 ? "+" + cVal : cVal) + "c", 6, y - 3);
  });

  ctx.setLineDash([]);
  if (pitchHistory.length < 2) return;

  const now = Date.now();
  const timeWindow = 5000;

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#38bdf8";

  for (let i = 0; i < pitchHistory.length; i++) {
    const item = pitchHistory[i];
    const age = now - item.time;
    const x = W - (age / timeWindow) * W;
    const y = centsToY(item.cents);

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ---------- Fretboard Drawing ----------
function drawFB() {
  const fb = $("fb"); if (!fb) return;
  fb.innerHTML = "";

  const frets = 15;
  const numStrings = strings.length;
  const W = 840, H = 250, marginX = 40, marginY = 25;
  const usableW = W - marginX * 2, usableH = H - marginY * 2;

  const fretX = [];
  if (isLeftHand) {
    for (let i = 0; i <= frets; i++) {
      fretX.push(W - marginX - (usableW * (i / frets)));
    }
  } else {
    for (let i = 0; i <= frets; i++) {
      fretX.push(marginX + (usableW * (i / frets)));
    }
  }

  for (let i = 0; i <= frets; i++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", fretX[i]); line.setAttribute("y1", marginY);
    line.setAttribute("x2", fretX[i]); line.setAttribute("y2", H - marginY);
    line.setAttribute("stroke", i === 0 ? "#cbd5e1" : "#475569");
    line.setAttribute("stroke-width", i === 0 ? "5" : "2");
    fb.appendChild(line);

    if (i > 0) {
      const num = document.createElementNS("http://www.w3.org/2000/svg", "text");
      num.setAttribute("x", (fretX[i - 1] + fretX[i]) / 2);
      num.setAttribute("y", H - 6);
      num.setAttribute("class", "fret-num");
      num.setAttribute("data-fret", i);
      num.textContent = i;
      fb.appendChild(num);
    }
  }

  const singleMarkers = [3, 5, 7, 9, 15];
  const doubleMarkers = [12];

  singleMarkers.forEach(f => {
    if (f <= frets) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", (fretX[f - 1] + fretX[f]) / 2);
      circle.setAttribute("cy", H / 2);
      circle.setAttribute("r", "5");
      circle.setAttribute("fill", "#334155");
      fb.appendChild(circle);
    }
  });

  doubleMarkers.forEach(f => {
    if (f <= frets) {
      const cx = (fretX[f - 1] + fretX[f]) / 2;
      const c1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c1.setAttribute("cx", cx); c1.setAttribute("cy", marginY + usableH * 0.25);
      c1.setAttribute("r", "5"); c1.setAttribute("fill", "#334155");
      fb.appendChild(c1);

      const c2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c2.setAttribute("cx", cx); c2.setAttribute("cy", marginY + usableH * 0.75);
      c2.setAttribute("r", "5"); c2.setAttribute("fill", "#334155");
      fb.appendChild(c2);
    }
  });

  const stringY = (sIdx) => marginY + (sIdx * (usableH / (numStrings - 1)));

  for (let s = 0; s < numStrings; s++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = stringY(s);
    line.setAttribute("x1", marginX); line.setAttribute("y1", y);
    line.setAttribute("x2", W - marginX); line.setAttribute("y2", y);
    line.setAttribute("stroke", "#94a3b8");
    line.setAttribute("stroke-width", 1 + s * 0.5);
    fb.appendChild(line);
  }

  const isChordMode = (guideMode === "chord");
  const currentChordPcs = isChordMode ? getChordPcs(rootPc, chordTypeVal) : [];

  for (let s = 0; s < numStrings; s++) {
    const openMidi = strings[s];
    const y = stringY(s);

    for (let f = 0; f <= frets; f++) {
      const midi = openMidi + f;
      const notePc = pc(midi);
      const isRoot = (notePc === rootPc);
      const inCurrentScale = inScale(midi);
      const inCurrentChord = isChordMode && currentChordPcs.includes(notePc);

      const isLit = litPcs.includes(notePc);
      const isJamTarget = isJamPlaying && jamTargetChordPcs.includes(notePc);

      const isVisibleTone = isChordMode ? inCurrentChord : inCurrentScale;

      if (!isVisibleTone && !isLit && !voicingMode && !isJamTarget) continue;

      let isVoicingNote = false;
      if (voicingMode && currentVoicing) {
        const targetFret = currentVoicing.frets[s];
        if (targetFret !== null && targetFret === f) {
          isVoicingNote = true;
        }
      }

      if (voicingMode && !isVoicingNote && !isLit) continue;

      const cx = f === 0 ? (isLeftHand ? W - marginX + 15 : marginX - 15) : (fretX[f - 1] + fretX[f]) / 2;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "note-dot");
      g.setAttribute("data-midi", midi);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx); circle.setAttribute("cy", y);
      circle.setAttribute("r", isLit ? "14" : (isJamTarget ? "13" : "11"));

      let fill = "var(--tone)";
      if (isLit) fill = "var(--hit)";
      else if (isJamTarget) fill = "#ffaa00";
      else if (isRoot) fill = "var(--root)";

      circle.setAttribute("fill", fill);
      if (isJamTarget && !isLit) {
        circle.setAttribute("stroke", "#ffffff");
        circle.setAttribute("stroke-width", "2");
      }
      g.appendChild(circle);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", cx); text.setAttribute("y", y + 4);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", isLit ? "#0f172a" : "#ffffff");
      text.setAttribute("font-size", "11px");
      text.setAttribute("font-weight", "bold");

      const interval = pc(midi - rootPc);
      const label = labelMode === "deg" ? DEG[interval] : NOTE[notePc];
      text.textContent = label;
      g.appendChild(text);

      fb.appendChild(g);
    }
  }
}

function updateTunerLabels() {
  const tunerLayout = $("tunerLayout");
  if (!tunerLayout) return;
  const tunerStrings = tunerLayout.querySelectorAll(".tuner-string");
  tunerStrings.forEach(el => {
    const idx = parseInt(el.getAttribute("data-string-idx"), 10);
    const midi = strings[idx];
    if (isNaN(midi)) return;
    const stringNum = idx + 1;
    const label = stringNum + NOTE[pc(midi)];
    const labelEl = el.querySelector(".string-label");
    if (labelEl) labelEl.textContent = label;
  });
}

function updateTunerUI(detected) {
  const tunerLayout = $("tunerLayout");
  if (!tunerLayout) return;
  const tunerStrings = tunerLayout.querySelectorAll(".tuner-string");
  tunerStrings.forEach(el => { el.className = "tuner-string"; });

  if (!detected || detected.length === 0) return;

  detected.forEach(n => {
    let minDiff = Infinity;
    let closestIdx = -1;
    for (let i = 0; i < 6; i++) {
      const diff = Math.abs(n.midi - strings[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    if (closestIdx !== -1 && minDiff <= 1.5) {
      const targetMidi = strings[closestIdx];
      const cents = centsOff(n.f, targetMidi);
      const el = tunerLayout.querySelector(`.tuner-string[data-string-idx="${closestIdx}"]`);
      if (el) {
        el.classList.add("active");
        if (Math.abs(cents) < 10) {
          el.classList.add("in-tune");
        } else if (cents < 0) {
          el.classList.add("flat");
        } else {
          el.classList.add("sharp");
        }
      }
    }
  });
}

function renderCircleOfFifths() {
  const svg = $("circleSvg"); if (!svg) return;
  svg.innerHTML = "";

  const cx = 150, cy = 150, rOuter = 135, rMid = 95, rInner = 55;
  const rootIndex = CIRCLE_MAJOR.findIndex(k => NOTE.indexOf(k.replace("b", "#")) === rootPc || NOTE.indexOf(k) === rootPc);
  const activeIdx = rootIndex !== -1 ? rootIndex : 0;

  for (let i = 0; i < 12; i++) {
    const startAngle = (i * 30 - 105) * (Math.PI / 180);
    const endAngle = ((i + 1) * 30 - 105) * (Math.PI / 180);
    const midAngle = (startAngle + endAngle) / 2;

    let classOuter = "circle-sector";
    let classInner = "circle-sector";

    if (i === activeIdx) {
      classOuter += " active-root";
      classInner += " relative-key";
    } else if (i === (activeIdx + 11) % 12 || i === (activeIdx + 1) % 12) {
      classOuter += " related-key";
    }

    const notePcVal = NOTE.indexOf(CIRCLE_MAJOR[i].replace("b", "#")) !== -1 ?
      NOTE.indexOf(CIRCLE_MAJOR[i].replace("b", "#")) : NOTE.indexOf(CIRCLE_MAJOR[i]);

    const x1 = cx + rOuter * Math.cos(startAngle), y1 = cy + rOuter * Math.sin(startAngle);
    const x2 = cx + rOuter * Math.cos(endAngle), y2 = cy + rOuter * Math.sin(endAngle);
    const x3 = cx + rMid * Math.cos(endAngle), y3 = cy + rMid * Math.sin(endAngle);
    const x4 = cx + rMid * Math.cos(startAngle), y4 = cy + rMid * Math.sin(startAngle);

    const pathOuter = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathOuter.setAttribute("d", `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rMid} ${rMid} 0 0 0 ${x4} ${y4} Z`);
    pathOuter.setAttribute("class", classOuter);
    pathOuter.setAttribute("data-pc", notePcVal);
    svg.appendChild(pathOuter);

    const txOuter = cx + ((rOuter + rMid) / 2) * Math.cos(midAngle);
    const tyOuter = cy + ((rOuter + rMid) / 2) * Math.sin(midAngle);

    const txtOuter = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txtOuter.setAttribute("x", txOuter); txtOuter.setAttribute("y", tyOuter + 4);
    txtOuter.setAttribute("class", "circle-text");
    txtOuter.textContent = CIRCLE_MAJOR[i];
    svg.appendChild(txtOuter);

    const mx1 = cx + rMid * Math.cos(startAngle), my1 = cy + rMid * Math.sin(startAngle);
    const mx2 = cx + rMid * Math.cos(endAngle), my2 = cy + rMid * Math.sin(endAngle);
    const mx3 = cx + rInner * Math.cos(endAngle), my3 = cy + rInner * Math.sin(endAngle);
    const mx4 = cx + rInner * Math.cos(startAngle), my4 = cy + rInner * Math.sin(startAngle);

    const pathInner = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathInner.setAttribute("d", `M ${mx1} ${my1} A ${rMid} ${rMid} 0 0 1 ${mx2} ${my2} L ${mx3} ${my3} A ${rInner} ${rInner} 0 0 0 ${mx4} ${my4} Z`);
    pathInner.setAttribute("class", classInner);
    pathInner.setAttribute("data-pc", notePcVal);
    svg.appendChild(pathInner);

    const txInner = cx + ((rMid + rInner) / 2) * Math.cos(midAngle);
    const tyInner = cy + ((rMid + rInner) / 2) * Math.sin(midAngle);

    const txtInner = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txtInner.setAttribute("x", txInner); txtInner.setAttribute("y", tyInner + 3);
    txtInner.setAttribute("class", "circle-text minor");
    txtInner.textContent = CIRCLE_MINOR[i];
    svg.appendChild(txtInner);
  }
}

// ---------- Update Poly & Single Note Handlers ----------
function updatePoly(data) {
  const v = $("verdict");
  const activeNotes = data.notes || [];
  const chroma = data.chroma || [];
  const rms = data.rms || 0;

  if (activeNotes.length > 0) {
    litPcs = activeNotes.map(n => pc(n.midi));
  } else {
    litPcs = [];
  }

  drawFB();
  updateTunerUI(activeNotes);

  if (activeNotes.length === 0) {
    $("bigNote").textContent = "––";
    v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
    v.className = "verdict idle";
    return;
  }

  const firstMidi = activeNotes[0].midi;
  const cents = centsOff(activeNotes[0].f, firstMidi);
  updatePitchTracker(cents);

  if (quizMode) {
    const p = pc(firstMidi);
    if (guideMode === "chord") {
      const hmmState = runHMM(chroma, rms);
      if (hmmState < 24) {
        const rootIndex = hmmState % 12;
        const isCorrectChord = (rootIndex === pc(rootPc + targetInterval));
        if (isCorrectChord) {
          detectedPcs = [...targetChordPcs];
          updateChordQuizPrompt();
          quizSolved();
        }
      }
    } else {
      $("bigNote").textContent = labelMode === "deg" ? DEG[targetInterval] : NOTE[pc(rootPc + targetInterval)];
      const hit = (pc(firstMidi - rootPc) === targetInterval);
      if (!lock && hit && Math.abs(cents) < 40) {
        history.push(p); if (history.length > stabNeeded) history.shift();
        if (history.length >= stabNeeded && history.every(x => x === p)) quizSolved();
      } else if (!hit) {
        history = [];
      }
    }
  } else {
    const allInScale = activeNotes.every(n => inScale(n.midi));
    const degrees = activeNotes.map(n => DEG[pc(n.midi - rootPc)]).filter(x => x).join(" · ");
    if (allInScale) {
      $("degTxt").textContent = t("degPrefix") + degrees;
      v.textContent = (guideMode === "chord") ? t("verdictInChord") : t("verdictInScale");
      v.className = "verdict ok";
    } else {
      $("degTxt").textContent = degrees ? (t("degPrefix") + degrees) : "";
      v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
    }
  }
}

function update(res) {
  const v = $("verdict");
  if (res.f < 0) {
    $("bigNote").textContent = "––";
    v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
    v.className = "verdict idle";
    litPcs = [];
    drawFB();
    updateTunerUI([]);
    return;
  }

  const m = freqToMidi(res.f);
  const p = pc(m);
  const cents = centsOff(res.f, m);

  updatePitchTracker(cents);
  litPcs = [p];
  drawFB();
  updateTunerUI([{ f: res.f, midi: m }]);

  if (quizMode) {
    if (guideMode === "chord") {
      const hit = targetChordPcs.includes(p);
      if (!lock && hit && Math.abs(cents) < 40) {
        history.push(p); if (history.length > stabNeeded) history.shift();
        if (history.length >= stabNeeded && history.every(x => x === p)) {
          if (!detectedPcs.includes(p)) {
            detectedPcs.push(p);
            updateChordQuizPrompt();
          }
          if (detectedPcs.length === targetChordPcs.length) quizSolved();
        }
      } else if (!hit) { history = []; }
    } else {
      $("bigNote").textContent = labelMode === "deg" ? DEG[targetInterval] : NOTE[pc(rootPc + targetInterval)];
      const hit = (pc(m - rootPc) === targetInterval);
      if (!lock && hit && Math.abs(cents) < 40) {
        history.push(p); if (history.length > stabNeeded) history.shift();
        if (history.length >= stabNeeded && history.every(x => x === p)) quizSolved();
      } else if (!hit) { history = []; }
    }
  } else {
    $("bigNote").textContent = NOTE[p];
    const interval = pc(m - rootPc);
    if (inScale(m)) {
      $("degTxt").textContent = t("degPrefix") + DEG[interval];
      v.textContent = (guideMode === "chord") ? t("verdictInChord") : t("verdictInScale"); v.className = "verdict ok";
    } else {
      $("degTxt").textContent = "";
      v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale"); v.className = "verdict no";
    }
  }
}

function loop() {
  if (!running) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    raf = requestAnimationFrame(loop);
    return;
  }
  analyser.getFloatTimeDomainData(buf);
  update(autoCorrelate(buf, audioCtx.sampleRate));
  raf = requestAnimationFrame(loop);
}

// ---------- Audio Lifecycle ----------
async function connect(id) {
  ensureAudioCtx();
  if (!monitorGainNode && audioCtx) {
    monitorGainNode = audioCtx.createGain();
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
    monitorGainNode.connect(audioCtx.destination);
  }

  if (ws) {
    try { ws.close(); } catch (e) { }
    ws = null;
  }
  if (id === "asio_ws") {
    if (source) { source.disconnect(); source = null; }
    if (stream) { stream.getTracks().forEach(tk => tk.stop()); stream = null; }
    await connectAsioWs();
    return;
  }
  if (source) source.disconnect();
  if (stream) stream.getTracks().forEach(tk => tk.stop());
  stream = await getStream(id);
  source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048;
  buf = new Float32Array(analyser.fftSize);
  source.connect(analyser);

  source.connect(monitorGainNode);
}

async function start() {
  $("err").textContent = "";
  try {
    const devId = $("deviceSel").value;
    await connect(devId);
    if (devId !== "asio_ws") {
      await listDevices();
    }
    running = true;
    $("led").classList.add("on"); $("powerTxt").textContent = t("powerOn");
    $("startBtn").textContent = t("btnStop");
    if (quizMode) {
      newQuiz();
    } else {
      $("prompt").textContent = (guideMode === "chord") ? t("promptChordHover") : t("promptPlay");
    }
    loop();
  } catch (e) {
    $("err").textContent = e.message;
    stop();
  }
}

function stop() {
  running = false; if (raf) cancelAnimationFrame(raf);
  if (stream) stream.getTracks().forEach(tk => tk.stop());
  if (ws) {
    try { ws.close(); } catch (e) { }
    ws = null;
  }
  $("led").classList.remove("on"); $("powerTxt").textContent = t("powerOff");
  $("startBtn").textContent = t("btnStart");
  $("bigNote").textContent = "––"; litPcs = []; drawFB();
  updateTunerUI([]);
  refreshDynamic();
}

function refreshDynamic() {
  if ($("powerTxt")) $("powerTxt").textContent = running ? t("powerOn") : t("powerOff");
  if ($("startBtn")) $("startBtn").textContent = running ? t("btnStop") : t("btnStart");
  if ($("modeSub")) $("modeSub").textContent = quizMode ? t("subQuiz") : t("subPractice");
}

// ---------- Practice Tools & Quiz ----------
function newQuiz() {
  lock = false; history = []; detectedPcs = [];
  const set = SCALES[scaleId];
  targetInterval = set[Math.floor(Math.random() * set.length)];

  if (guideMode === "chord") {
    const chordTypes = ["major", "minor", "dom7", "maj7", "min7"];
    const selectedType = chordTypes[Math.floor(Math.random() * chordTypes.length)];
    const targetRootPc = pc(rootPc + targetInterval);
    const rootName = NOTE[targetRootPc];
    const typeLabel = t("chord_" + selectedType);

    targetChordName = `${rootName} ${typeLabel}`;
    const chordIntervalsMap = {
      major: [0, 4, 7], minor: [0, 3, 7], dom7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10]
    };
    targetChordPcs = (chordIntervalsMap[selectedType] || [0, 4, 7]).map(i => pc(targetRootPc + i));
    updateChordQuizPrompt();
  } else {
    const targetNoteName = labelMode === "deg" ? DEG[targetInterval] : NOTE[pc(rootPc + targetInterval)];
    $("prompt").textContent = t("promptTarget") + " " + targetNoteName;
  }
  $("verdict").textContent = t("verdictWait"); $("verdict").className = "verdict wait";
}

function updateChordQuizPrompt() {
  const missingPcs = targetChordPcs.filter(p => !detectedPcs.includes(p));
  const missingNames = missingPcs.map(p => NOTE[p]).join(", ");
  if (missingPcs.length === 0) {
    $("prompt").textContent = `🎉 ${targetChordName} ${t("promptChordComplete")}`;
  } else {
    $("prompt").textContent = `${t("promptPlayChord")}: ${targetChordName} (${t("promptMissing")}: ${missingNames})`;
  }
}

function quizSolved() {
  lock = true; score++; streak++;
  $("scoreEl").textContent = score; $("streakEl").textContent = streak;
  $("verdict").textContent = t("verdictOk"); $("verdict").className = "verdict ok";
  setTimeout(() => { if (running && quizMode) newQuiz(); }, 900);
}

function playMidiNote(midi) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const freq = midiToFreq(midi);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 1.2);

  osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) { } };
}

function playJamSynthChord(rootPcVal, isMinor, durationSec = 2.0) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const thirdInterval = isMinor ? 3 : 4;
  const chordNotes = [rootPcVal + 48, rootPcVal + thirdInterval + 48, rootPcVal + 7 + 48];

  chordNotes.forEach((midi, idx) => {
    const freq = midiToFreq(midi);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    const startTime = audioCtx.currentTime + (idx * 0.03);
    const stopTime = startTime + durationSec;

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(stopTime);

    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) { } };
  });
}

function playMetronomeClick(isDownbeat) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  const freq = isDownbeat ? 1200 : 800;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.05);

  osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) { } };
}

function startScan() {
  if (isScanning) return;
  isScanning = true;
  scanTimeElapsed = 0;
  scanChromaHistory = Array(12).fill(0);

  $("btnScanStart").style.display = "none";
  $("btnScanStop").style.display = "inline-block";
  $("scanProgress").style.display = "block";
  $("scanBar").style.width = "0%";
  $("scanResults").innerHTML = `<div style="text-align:center; padding:12px; color:var(--sub);">${t("scanListening")}</div>`;

  scanInterval = setInterval(() => {
    scanTimeElapsed += 200;
    const pct = Math.min(100, (scanTimeElapsed / scanDuration) * 100);
    $("scanBar").style.width = pct + "%";

    if (scanTimeElapsed >= scanDuration) {
      finishScan();
    }
  }, 200);
}

function stopScan() {
  if (!isScanning) return;
  isScanning = false;
  if (scanInterval) clearInterval(scanInterval);
  scanInterval = null;
  $("btnScanStart").style.display = "inline-block";
  $("btnScanStop").style.display = "none";
  $("scanProgress").style.display = "none";
}

function finishScan() {
  stopScan();
  const sumHist = scanChromaHistory.reduce((a, b) => a + b, 0);
  if (sumHist === 0) {
    $("scanResults").innerHTML = `<div style="text-align:center; padding:12px; color:var(--sub);">${t("scanNoNotes")}</div>`;
    return;
  }

  const normHist = scanChromaHistory.map(v => v / sumHist);
  const candidates = [];

  SCALE_IDS.forEach(sId => {
    const scaleTmpl = SCALES[sId];
    for (let r = 0; r < 12; r++) {
      const vec = Array(12).fill(0);
      scaleTmpl.forEach(interval => { vec[(r + interval) % 12] = 1.0; });

      let dot = 0, normVec = 0, normHistSq = 0;
      for (let i = 0; i < 12; i++) {
        dot += normHist[i] * vec[i];
        normVec += vec[i] * vec[i];
        normHistSq += normHist[i] * normHist[i];
      }

      const sim = (normVec > 0 && normHistSq > 0) ? (dot / (Math.sqrt(normVec) * Math.sqrt(normHistSq))) : 0;
      candidates.push({ rootPc: r, scaleId: sId, score: sim });
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const topResults = candidates.slice(0, 5);

  let html = `<div style="margin-bottom:8px; font-weight:bold; font-size:12px; color:var(--tone);">${t("scanTopMatches")}:</div>`;
  topResults.forEach((res, idx) => {
    const rootName = NOTE[res.rootPc];
    const scaleName = t("scale_" + res.scaleId);
    const scorePct = Math.round(res.score * 100);
    html += `
      <div class="scan-result-item" data-root="${res.rootPc}" data-scale="${res.scaleId}" style="display:flex; justify-space-between; align-items:center; padding:8px 12px; margin-bottom:6px; background:var(--bg); border:1px solid #334155; border-radius:6px; cursor:pointer;">
        <div><span style="font-weight:bold; font-size:13px; color:#ffffff;">${idx + 1}. ${rootName} ${scaleName}</span></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; color:var(--ok); font-weight:bold;">${scorePct}%</span>
          <span style="font-size:11px; padding:2px 6px; background:var(--tone); color:#0f172a; border-radius:4px; font-weight:bold;">${t("scanApply")}</span>
        </div>
      </div>
    `;
  });

  $("scanResults").innerHTML = html;

  document.querySelectorAll(".scan-result-item").forEach(el => {
    el.onclick = () => {
      const r = parseInt(el.getAttribute("data-root"), 10);
      const s = el.getAttribute("data-scale");
      rootPc = r; scaleId = s;
      $("keySel").value = r; $("scaleSel").value = s;
      drawFB();
      if (quizMode) newQuiz();
    };
  });
}

function startJamTrack() {
  if (isJamPlaying) return;
  isJamPlaying = true;
  jamBarIndex = 0;
  $("btnJam").textContent = t("btnJamStop");
  $("btnJam").className = "btn danger";
  stepJamTrack();
}

function stopJamTrack() {
  isJamPlaying = false;
  if (jamTimer) clearTimeout(jamTimer);
  jamTimer = null;
  jamTargetChordPcs = [];
  $("btnJam").textContent = t("btnJamPlay");
  $("btnJam").className = "btn primary";
  $("jamCurrentChord").textContent = "––";
  drawFB();
}

function stepJamTrack() {
  if (!isJamPlaying) return;

  const prog = JAM_PROGRESSIONS[jamProgressionKey] || JAM_PROGRESSIONS.pop;
  const degreeOffset = prog[jamBarIndex % prog.length];

  const currentChordRootPc = pc(rootPc + degreeOffset);
  const isMinorChord = (jamProgressionKey === "sad") ? (jamBarIndex % 2 === 0) : (degreeOffset === 9 || degreeOffset === 2);
  const thirdInterval = isMinorChord ? 3 : 4;
  jamTargetChordPcs = [currentChordRootPc, pc(currentChordRootPc + thirdInterval), pc(currentChordRootPc + 7)];

  const chordName = `${NOTE[currentChordRootPc]} ${isMinorChord ? "m" : "Maj"}`;
  $("jamCurrentChord").textContent = chordName;

  const barDurationSec = (60 / jamBpm) * 4;
  playJamSynthChord(currentChordRootPc, isMinorChord, barDurationSec);
  drawFB();

  jamBarIndex++;
  jamTimer = setTimeout(stepJamTrack, barDurationSec * 1000);
}

function startMetronome() {
  if (isMetroPlaying) return;
  isMetroPlaying = true;
  metroBeatCount = 0;
  metroBarCount = 0;
  $("btnMetro").textContent = t("btnMetroStop");
  $("btnMetro").className = "btn danger";
  stepMetronome();
}

function stopMetronome() {
  isMetroPlaying = false;
  if (metroTimer) clearTimeout(metroTimer);
  metroTimer = null;
  $("btnMetro").textContent = t("btnMetroStart");
  $("btnMetro").className = "btn primary";
  document.querySelectorAll(".metro-dot").forEach(d => d.className = "metro-dot");
}

function stepMetronome() {
  if (!isMetroPlaying) return;

  const currentBeatInBar = metroBeatCount % 4;
  const isDownbeat = (currentBeatInBar === 0);

  playMetronomeClick(isDownbeat);

  const dots = document.querySelectorAll(".metro-dot");
  dots.forEach((d, idx) => {
    if (idx === currentBeatInBar) {
      d.className = isDownbeat ? "metro-dot active downbeat" : "metro-dot active";
    } else {
      d.className = "metro-dot";
    }
  });

  metroBeatCount++;
  if (currentBeatInBar === 3) {
    metroBarCount++;
    if (isAutoSpeedUp && metroBarCount % 4 === 0) {
      metroBpm = Math.min(240, metroBpm + 5);
      $("metroBpm").value = metroBpm;
      $("metroBpmVal").textContent = metroBpm;
    }
  }

  const intervalMs = (60 / metroBpm) * 1000;
  metroTimer = setTimeout(stepMetronome, intervalMs);
}

function rebuildScaleSel() {
  const sel = $("scaleSel"); if (!sel) return;
  sel.innerHTML = "";
  SCALE_IDS.forEach(id => {
    const o = document.createElement("option");
    o.value = id; o.textContent = t("scale_" + id);
    sel.appendChild(o);
  });
  sel.value = scaleId;
}

function rebuildTuningSel() {
  const sel = $("tuningSel"); if (!sel) return;
  sel.innerHTML = "";
  TUNING_IDS.forEach(id => {
    const o = document.createElement("option");
    o.value = id; o.textContent = t("tuning_" + id);
    sel.appendChild(o);
  });
  sel.value = currentTuningId;
}

function buildKeySel() {
  const sel = $("keySel"); if (!sel) return;
  sel.innerHTML = "";
  NOTE.forEach((n, i) => {
    const o = document.createElement("option");
    o.value = i; o.textContent = n;
    sel.appendChild(o);
  });
  sel.value = rootPc;
}

function updateToggleVisuals(toggleEl, isRightActive, leftLabelId, rightLabelId) {
  if (!toggleEl) return;
  toggleEl.classList.toggle("active-right", isRightActive);
  const leftL = $(leftLabelId);
  const rightL = $(rightLabelId);
  if (leftL) leftL.classList.toggle("active", !isRightActive);
  if (rightL) rightL.classList.toggle("active", isRightActive);
}

function initSlideToggles() {
  const modeT = $("modeToggle");
  if (modeT) {
    updateToggleVisuals(modeT, quizMode, "togglePractice", "toggleQuiz");
    modeT.onclick = () => {
      quizMode = !quizMode;
      updateToggleVisuals(modeT, quizMode, "togglePractice", "toggleQuiz");
      refreshDynamic();
      if (!running) return;
      if (quizMode) newQuiz();
      else if ($("prompt")) $("prompt").textContent = (guideMode === "chord") ? t("promptChordHover") : t("promptPlay");
    };
  }

  const guideT = $("guideToggle");
  if (guideT) {
    updateToggleVisuals(guideT, guideMode === "chord", "toggleScale", "toggleChord");
    guideT.onclick = () => {
      guideMode = (guideMode === "scale") ? "chord" : "scale";
      updateToggleVisuals(guideT, guideMode === "chord", "toggleScale", "toggleChord");

      const scaleField = $("scaleField");
      if (scaleField) scaleField.style.display = (guideMode === "chord") ? "none" : "block";
      const chordTypeField = $("chordTypeField");
      if (chordTypeField) chordTypeField.style.display = (guideMode === "chord") ? "block" : "none";
      const voicingField = $("voicingField");
      if (voicingField) voicingField.style.display = (guideMode === "chord") ? "block" : "none";

      refreshDynamic();
      rebuildVoicingSel();
      drawFB();
      if (running && quizMode) newQuiz();
    };
  }

  const labelT = $("labelToggle");
  if (labelT) {
    updateToggleVisuals(labelT, labelMode === "deg", "toggleName", "toggleDeg");
    labelT.onclick = () => {
      labelMode = (labelMode === "name") ? "deg" : "name";
      updateToggleVisuals(labelT, labelMode === "deg", "toggleName", "toggleDeg");
      drawFB();
    };
  }

  const handT = $("handToggle");
  if (handT) {
    updateToggleVisuals(handT, isLeftHand, "toggleLeft", "toggleRight");
    handT.onclick = () => {
      isLeftHand = !isLeftHand;
      updateToggleVisuals(handT, isLeftHand, "toggleLeft", "toggleRight");
      drawFB();
    };
  }
}

function getChordPcs(rootPc, chordTypeVal) {
  const chordIntervalsMap = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dom7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10]
  };
  const intervals = chordIntervalsMap[chordTypeVal] || chordIntervalsMap.major;
  return intervals.map(i => pc(rootPc + i));
}

function getChordVoicings(rootPc, chordTypeVal) {
  const c = rootPc;
  const voicingsMap = {
    major: [
      { name: "CAGED - E Shape", frets: [0, 0, 1, 2, 2, 0].map(x => x + c) },
      { name: "CAGED - A Shape", frets: [0, 2, 2, 2, 0, null].map(x => x !== null ? x + c : null) },
      { name: "CAGED - C Shape", frets: [0, 1, 0, 2, 3, null].map(x => x !== null ? x + c : null) },
      { name: "CAGED - D Shape", frets: [2, 3, 2, 0, null, null].map(x => x !== null ? x + c : null) }
    ],
    minor: [
      { name: "E Minor Shape", frets: [0, 0, 0, 2, 2, 0].map(x => x + c) },
      { name: "A Minor Shape", frets: [0, 1, 2, 2, 0, null].map(x => x !== null ? x + c : null) },
      { name: "D Minor Shape", frets: [1, 3, 2, 0, null, null].map(x => x !== null ? x + c : null) }
    ],
    dom7: [
      { name: "E7 Shape", frets: [0, 0, 1, 0, 2, 0].map(x => x + c) },
      { name: "A7 Shape", frets: [0, 2, 0, 2, 0, null].map(x => x !== null ? x + c : null) }
    ],
    maj7: [
      { name: "EMaj7 Shape", frets: [0, 0, 1, 1, 2, 0].map(x => x + c) },
      { name: "AMaj7 Shape", frets: [0, 2, 1, 2, 0, null].map(x => x !== null ? x + c : null) }
    ],
    min7: [
      { name: "Em7 Shape", frets: [0, 0, 0, 0, 2, 0].map(x => x + c) },
      { name: "Am7 Shape", frets: [0, 1, 0, 2, 0, null].map(x => x !== null ? x + c : null) }
    ]
  };

  const list = voicingsMap[chordTypeVal] || voicingsMap.major;
  return list.map(v => {
    let minF = Infinity;
    v.frets.forEach(f => {
      if (f !== null && f < minF) minF = f;
    });
    let shift = 0;
    if (minF < 0) shift = Math.ceil(-minF / 12) * 12;
    else if (minF > 12) shift = -Math.floor(minF / 12) * 12;

    const shiftedFrets = v.frets.map(f => {
      if (f === null) return null;
      let finalF = (f + shift) % 12;
      if (finalF < 0) finalF += 12;
      return finalF;
    });
    return { name: v.name, frets: shiftedFrets };
  });
}

function rebuildVoicingSel() {
  const sel = $("voicingSel");
  if (!sel) return;
  sel.innerHTML = "";

  currentVoicingsList = getChordVoicings(rootPc, chordTypeVal);

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = `⭐ ${t("optAllChordTones")}`;
  sel.appendChild(allOpt);

  currentVoicingsList.forEach((v, idx) => {
    const o = document.createElement("option");
    o.value = idx;
    o.textContent = v.name;
    sel.appendChild(o);
  });

  if (voicingMode && currentVoicingIdx < currentVoicingsList.length) {
    sel.value = currentVoicingIdx;
  } else {
    sel.value = "all";
    voicingMode = false;
    currentVoicing = null;
  }
}

function updateVoicingGuide() {
  currentVoicingsList = getChordVoicings(rootPc, chordTypeVal);
  if (currentVoicingsList.length === 0) return;
  if (currentVoicingIdx >= currentVoicingsList.length) currentVoicingIdx = 0;
  currentVoicing = currentVoicingsList[currentVoicingIdx];

  const rootName = NOTE[rootPc];
  const chordName = `${rootName} ${t("chord_" + chordTypeVal)}`;

  const titleEl = $("voicingTitle");
  const countEl = $("voicingCount");
  if (titleEl) titleEl.textContent = `${chordName} - ${currentVoicing.name}`;
  if (countEl) countEl.textContent = `(${currentVoicingIdx + 1} / ${currentVoicingsList.length})`;

  drawFB();
}

function bindEvents() {
  if ($("startBtn")) $("startBtn").onclick = () => running ? stop() : start();
  if ($("keySel")) {
    $("keySel").onchange = e => {
      rootPc = parseInt(e.target.value, 10);
      rebuildVoicingSel();
      drawFB();
      renderCircleOfFifths();
      if (voicingMode) updateVoicingGuide();
      if (quizMode) newQuiz();
    };
  }
  if ($("scaleSel")) {
    $("scaleSel").onchange = e => {
      scaleId = e.target.value;
      drawFB();
      if (quizMode) newQuiz();
    };
  }
  if ($("tuningSel")) {
    $("tuningSel").onchange = e => {
      currentTuningId = e.target.value;
      if (TUNINGS[currentTuningId]) {
        strings = [...TUNINGS[currentTuningId]];
        for (let s = 0; s < 6; s++) {
          if ($("strSel_" + s)) $("strSel_" + s).value = strings[s];
        }
        updateTunerLabels();
        drawFB();
      }
    };
  }

  if ($("tuningModeSel")) {
    $("tuningModeSel").onchange = e => {
      tuningMode = e.target.value;
      if ($("tuningPresetField")) $("tuningPresetField").style.display = (tuningMode === "preset") ? "block" : "none";
      if ($("tuningCustomField")) $("tuningCustomField").style.display = (tuningMode === "custom") ? "block" : "none";
      if (tuningMode === "preset") {
        if (TUNINGS[currentTuningId]) strings = [...TUNINGS[currentTuningId]];
      } else {
        for (let s = 0; s < 6; s++) {
          if ($("strSel_" + s)) strings[s] = parseInt($("strSel_" + s).value, 10);
        }
      }
      updateTunerLabels();
      drawFB();
    };
  }

  if ($("voicingSel")) {
    $("voicingSel").onchange = e => {
      const val = e.target.value;
      if (val === "all") {
        voicingMode = false;
        currentVoicing = null;
      } else {
        currentVoicingIdx = parseInt(val, 10);
        if (currentVoicingsList[currentVoicingIdx]) {
          currentVoicing = currentVoicingsList[currentVoicingIdx];
          voicingMode = true;
        }
      }
      drawFB();
    };
  }

  if ($("sens")) $("sens").oninput = e => sensitivity = parseFloat(e.target.value);
  if ($("stab")) {
    $("stab").oninput = e => {
      stabNeeded = parseInt(e.target.value, 10);
      if ($("stabVal")) $("stabVal").textContent = stabNeeded;
    };
  }
  if ($("refPitch")) {
    $("refPitch").oninput = e => {
      refPitch = parseInt(e.target.value, 10);
      if ($("refPitchVal")) $("refPitchVal").textContent = refPitch;
      sendRefPitch();
    };
  }
  if ($("chordTypeSel")) {
    $("chordTypeSel").onchange = e => {
      chordTypeVal = e.target.value;
      rebuildVoicingSel();
      if (voicingMode) updateVoicingGuide();
      drawFB();
      if (quizMode) newQuiz();
    };
  }

  if ($("btnScanStart")) $("btnScanStart").onclick = startScan;
  if ($("btnScanStop")) $("btnScanStop").onclick = stopScan;

  if ($("btnCircleOfFifths")) {
    $("btnCircleOfFifths").onclick = () => {
      renderCircleOfFifths();
      if ($("circleModal")) $("circleModal").style.display = "flex";
    };
  }
  if ($("btnCloseCircle")) {
    $("btnCloseCircle").onclick = () => {
      if ($("circleModal")) $("circleModal").style.display = "none";
    };
  }
  if ($("circleSvg")) {
    $("circleSvg").onclick = e => {
      const sector = e.target.closest(".circle-sector");
      if (sector) {
        const pcVal = parseInt(sector.getAttribute("data-pc"), 10);
        if (!isNaN(pcVal)) {
          rootPc = pcVal;
          if ($("keySel")) $("keySel").value = pcVal;
          drawFB();
          renderCircleOfFifths();
          if (voicingMode) updateVoicingGuide();
          if (quizMode) newQuiz();
        }
      }
    };
  }

  if ($("btnJam")) $("btnJam").onclick = () => isJamPlaying ? stopJamTrack() : startJamTrack();
  if ($("jamProgSel")) {
    $("jamProgSel").onchange = e => {
      jamProgressionKey = e.target.value;
      if (isJamPlaying) { stopJamTrack(); startJamTrack(); }
    };
  }
  if ($("jamBpm")) {
    $("jamBpm").oninput = e => {
      jamBpm = parseInt(e.target.value, 10);
      if ($("jamBpmVal")) $("jamBpmVal").textContent = jamBpm;
    };
  }

  if ($("btnMetro")) $("btnMetro").onclick = () => isMetroPlaying ? stopMetronome() : startMetronome();
  if ($("metroBpm")) {
    $("metroBpm").oninput = e => {
      metroBpm = parseInt(e.target.value, 10);
      if ($("metroBpmVal")) $("metroBpmVal").textContent = metroBpm;
    };
  }

  if ($("monitorToggle")) {
    $("monitorToggle").onchange = e => {
      isMonitoringEnabled = e.target.checked;
      updateMonitoring();
    };
  }
  if ($("monitorVol")) {
    $("monitorVol").oninput = e => {
      monitorVolume = parseFloat(e.target.value);
      if ($("monitorVolVal")) {
        $("monitorVolVal").textContent = Math.round(monitorVolume * 100) + "%";
      }
      updateMonitoring();
    };
  }

  if ($("outputDeviceSel")) {
    $("outputDeviceSel").onchange = e => {
      setAudioOutputDevice(e.target.value);
    };
  }

  if ($("fb")) {
    $("fb").onclick = e => {
      const dot = e.target.closest(".note-dot");
      if (dot) {
        const midi = parseInt(dot.getAttribute("data-midi"), 10);
        playMidiNote(midi);
      }
    };
  }
}

function initCustomTuningSel() {
  for (let s = 0; s < 6; s++) {
    const sel = $("strSel_" + s);
    if (!sel) continue;
    sel.innerHTML = "";
    for (let m = 36; m <= 71; m++) {
      const o = document.createElement("option");
      o.value = m;
      const octave = Math.floor(m / 12) - 1;
      o.textContent = `${NOTE[pc(m)]}${octave}`;
      sel.appendChild(o);
    }
    sel.value = strings[s];
    sel.onchange = () => {
      strings[s] = parseInt(sel.value, 10);
      updateTunerLabels();
      drawFB();
    };
  }
}

function initDeviceSel() {
  const sel = $("deviceSel");
  if (!sel) return;
  sel.innerHTML = "";

  const asioOpt = document.createElement("option");
  asioOpt.value = "asio_ws";
  asioOpt.textContent = `⚡ ${t("optAsioWebsocket")}`;
  sel.appendChild(asioOpt);

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "mic_default";
  defaultOpt.setAttribute("data-i18n", "optSelectAfter");
  defaultOpt.textContent = t("optSelectAfter");
  sel.appendChild(defaultOpt);

  sel.value = "asio_ws";
  sel.disabled = false;
}

// ---------- Init ----------
initLang();
applyStaticI18n();
buildKeySel();
rebuildScaleSel();
rebuildTuningSel();
initCustomTuningSel();
rebuildVoicingSel();
initSlideToggles();
bindEvents();
initDeviceSel();
listOutputDevices();
updateTunerLabels();
drawFB();
