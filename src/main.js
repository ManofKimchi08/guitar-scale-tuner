/* ============================================================
   main.js - Guitar Scale Tuner ES Module Entrypoint
   ============================================================ */

import {
  NOTE, DEG, SCALES, SCALE_IDS, TUNINGS, TUNING_IDS,
  CIRCLE_MAJOR, CIRCLE_MINOR, JAM_PROGRESSIONS,
  pc, freqToMidi, midiToFreq, centsOff, inScale, getChordVoicings
} from "./js/music-theory.js";

import { runHMM, resetHMM } from "./js/hmm-decoder.js";

import {
  audioCtx, stream, source, analyser, buf, ws,
  isMonitoringEnabled, monitorVolume, setMonitoringState, updateMonitoring,
  ensureAudioCtx, getStream, listDevices, listOutputDevices, setAudioOutputDevice,
  playAsioPcmChunk, connectAsioWs, sendRefPitch, setupWebAudioConnection,
  cleanupAudioConnections, playMidiNote, playJamSynthChord, playMetronomeClick
} from "./js/audio-engine.js";

import {
  drawFB, updateTunerLabels, updateTunerUI, renderCircleOfFifths, drawPitchCanvas
} from "./js/fretboard-view.js";

// ---------- DOM Helper ----------
const $ = id => document.getElementById(id);

// ---------- App State ----------
let currentTuningId = "standard";
let strings = [...TUNINGS[currentTuningId]];
let tuningMode = "preset"; // "preset" | "custom"
let guideMode = "scale";  // "scale" | "chord"
let chordTypeVal = "major"; // "major" | "minor" | "dom7" | "maj7" | "min7"
let isStrumming = false;
let lastStrummedString = -1;

let running = false;
let raf = null;
let rootPc = 9;         // default A
let scaleId = "minor_pent";
let labelMode = "name"; // "name" | "deg"
let quizMode = false;
let targetInterval = 0; // for single-note quiz
let score = 0, streak = 0, lock = false;
let sensitivity = 0.015;
let stabNeeded = 4;
let history = [];
let litPcs = [];        // currently lit pitch classes
let refPitch = 440;
let pcScores = Array(12).fill(0);

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
let pitchHistory = []; // { time, cents }

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

// ---------- i18n ----------
let LANG = "en";
function t(key) {
  return (window.I18N && window.I18N[LANG] && window.I18N[LANG][key]) ||
    (window.I18N && window.I18N.en && window.I18N.en[key]) || key;
}

function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.documentElement.lang = LANG;
}

function initLang() {
  let saved = null;
  try { saved = localStorage.getItem("ehyo_lang"); } catch (e) { }
  LANG = saved || (navigator.language || "en").slice(0, 2);
  if (!window.I18N || !window.I18N[LANG]) LANG = "en";
  const sel = $("langSel");
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(window.I18N || {}).forEach(code => {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = (window.LANG_NAMES && window.LANG_NAMES[code]) || code;
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
  renderFB();
}

// ---------- Render Helper ----------
function renderFB() {
  drawFB({
    strings,
    rootPc,
    scaleId,
    litPcs,
    labelMode,
    isJamPlaying,
    jamTargetChordPcs,
    voicingMode,
    currentVoicing
  }, t);
}

// ---------- Autocorrelation ----------
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

// ---------- Scale Scanner ----------
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
      scaleTmpl.forEach(interval => {
        vec[(r + interval) % 12] = 1.0;
      });

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
      <div class="scan-result-item" data-root="${res.rootPc}" data-scale="${res.scaleId}" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; margin-bottom:6px; background:var(--bg); border:1px solid #334155; border-radius:6px; cursor:pointer;">
        <div>
          <span style="font-weight:bold; font-size:13px; color:#ffffff;">${idx + 1}. ${rootName} ${scaleName}</span>
        </div>
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
      rootPc = r;
      scaleId = s;
      $("keySel").value = r;
      $("scaleSel").value = s;
      renderFB();
      if (quizMode) newQuiz();
    };
  });
}

// ---------- Pitch Trajectory Tracker ----------
function updatePitchTracker(cents) {
  const now = Date.now();
  pitchHistory.push({ time: now, cents: cents });
  pitchHistory = pitchHistory.filter(item => now - item.time <= 5000);

  drawPitchCanvas(pitchHistory);

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

// ---------- Jam Assistant ----------
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
  renderFB();
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
  playJamSynthChord(currentChordRootPc, isMinorChord, barDurationSec, refPitch);
  renderFB();

  jamBarIndex++;
  jamTimer = setTimeout(stepJamTrack, barDurationSec * 1000);
}

// ---------- Metronome ----------
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

// ---------- Polyphonic & Single Pitch Update ----------
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

  renderFB();

  updateTunerUI(activeNotes, strings, centsOff);

  if (activeNotes.length === 0) {
    $("bigNote").textContent = "––";
    v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
    v.className = "verdict idle";
    return;
  }

  const firstMidi = activeNotes[0].midi;
  const firstNote = NOTE[pc(firstMidi)];
  const cents = centsOff(activeNotes[0].f, firstMidi);

  updatePitchTracker(cents);

  if (quizMode) {
    const p = pc(firstMidi);
    if (guideMode === "chord") {
      const hmmState = runHMM(chroma, rms);
      if (hmmState < 24) {
        const rootIndex = hmmState % 12;
        const rootName = NOTE[rootIndex];
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
    const allInScale = activeNotes.every(n => inScale(n.midi, rootPc, scaleId));
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
    renderFB();
    updateTunerUI([], strings, centsOff);
    return;
  }

  const m = freqToMidi(res.f);
  const p = pc(m);
  const cents = centsOff(res.f, m);

  updatePitchTracker(cents);

  litPcs = [p];
  renderFB();

  updateTunerUI([{ f: res.f, midi: m }], strings, centsOff);

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
          if (detectedPcs.length === targetChordPcs.length) {
            quizSolved();
          }
        }
      } else if (!hit) {
        history = [];
      }
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
    if (inScale(m, rootPc, scaleId)) {
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
  cleanupAudioConnections();

  if (id === "asio_ws") {
    await connectAsioWs(updatePoly, t, refPitch);
    return;
  }

  const streamObj = await getStream(id);
  setupWebAudioConnection(streamObj);
}

async function start() {
  $("err").textContent = "";
  try {
    const devId = $("deviceSel").value;
    await connect(devId);
    if (devId !== "asio_ws") {
      await listDevices($("deviceSel"), t);
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
  running = false;
  if (raf) cancelAnimationFrame(raf);
  cleanupAudioConnections();

  $("led").classList.remove("on"); $("powerTxt").textContent = t("powerOff");
  $("startBtn").textContent = t("btnStart");
  $("bigNote").textContent = "––"; litPcs = []; renderFB();
  updateTunerUI([], strings, centsOff);
  refreshDynamic();
}

function refreshDynamic() {
  $("powerTxt").textContent = running ? t("powerOn") : t("powerOff");
  $("startBtn").textContent = running ? t("btnStop");
  $("modeSub").textContent = quizMode ? t("subQuiz") : t("subPractice");
}

// ---------- Quiz & Voicings Helpers ----------
function newQuiz() {
  lock = false; history = []; detectedPcs = [];
  const set = SCALES[scaleId] || SCALES.major;
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
  lock = true;
  score++; streak++;
  $("scoreEl").textContent = score; $("streakEl").textContent = streak;
  $("verdict").textContent = t("verdictOk"); $("verdict").className = "verdict ok";
  setTimeout(() => { if (running && quizMode) newQuiz(); }, 900);
}

function updateVoicingGuide() {
  if (!voicingMode) return;
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

  renderFB();
}

// ---------- Controls & Event Bindings ----------
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

function initSlideToggles() {
  const modeT = $("modeToggle");
  if (modeT) {
    modeT.onclick = () => {
      quizMode = !quizMode;
      modeT.classList.toggle("active", quizMode);
      refreshDynamic();
      if (!running) return;
      if (quizMode) newQuiz();
      else $("prompt").textContent = (guideMode === "chord") ? t("promptChordHover") : t("promptPlay");
    };
  }

  const guideT = $("guideToggle");
  if (guideT) {
    guideT.onclick = () => {
      guideMode = (guideMode === "scale") ? "chord" : "scale";
      guideT.classList.toggle("active", guideMode === "chord");
      $("lblGuideMode").textContent = (guideMode === "chord") ? t("lblModeChord") : t("lblModeScale");

      const chordControlPanel = $("chordControlPanel");
      if (chordControlPanel) chordControlPanel.style.display = (guideMode === "chord") ? "flex" : "none";

      const voicingCard = $("voicingCard");
      if (voicingCard) voicingCard.style.display = (guideMode === "chord" && voicingMode) ? "block" : "none";

      refreshDynamic();
      renderFB();
      if (running && quizMode) newQuiz();
    };
  }

  const labelT = $("labelToggle");
  if (labelT) {
    labelT.onclick = () => {
      labelMode = (labelMode === "name") ? "deg" : "name";
      labelT.classList.toggle("active", labelMode === "deg");
      renderFB();
    };
  }

  const voicingT = $("voicingToggle");
  if (voicingT) {
    voicingT.onclick = () => {
      voicingMode = !voicingMode;
      voicingT.classList.toggle("active", voicingMode);

      const voicingCard = $("voicingCard");
      if (voicingCard) voicingCard.style.display = (guideMode === "chord" && voicingMode) ? "block" : "none";

      if (voicingMode) updateVoicingGuide();
      else { currentVoicing = null; renderFB(); }
    };
  }
}

function bindEvents() {
  $("startBtn").onclick = () => running ? stop() : start();
  $("keySel").onchange = e => {
    rootPc = parseInt(e.target.value, 10);
    renderFB();
    renderCircleOfFifths(rootPc);
    if (voicingMode) updateVoicingGuide();
    if (quizMode) newQuiz();
  };
  $("scaleSel").onchange = e => {
    scaleId = e.target.value;
    renderFB();
    if (quizMode) newQuiz();
  };
  $("sens").oninput = e => sensitivity = parseFloat(e.target.value);
  $("stab").oninput = e => {
    stabNeeded = parseInt(e.target.value, 10);
    $("stabVal").textContent = stabNeeded;
  };
  $("refPitch").oninput = e => {
    refPitch = parseInt(e.target.value, 10);
    $("refPitchVal").textContent = refPitch;
    sendRefPitch(refPitch);
  };
  $("chordTypeSel").onchange = e => {
    chordTypeVal = e.target.value;
    if (voicingMode) updateVoicingGuide();
  };

  if ($("btnScanStart")) $("btnScanStart").onclick = startScan;
  if ($("btnScanStop")) $("btnScanStop").onclick = stopScan;

  if ($("btnCircleOfFifths")) {
    $("btnCircleOfFifths").onclick = () => {
      renderCircleOfFifths(rootPc);
      $("circleModal").style.display = "flex";
    };
  }
  if ($("btnCloseCircle")) {
    $("btnCloseCircle").onclick = () => {
      $("circleModal").style.display = "none";
    };
  }
  if ($("circleSvg")) {
    $("circleSvg").onclick = e => {
      const sector = e.target.closest(".circle-sector");
      if (sector) {
        const pcVal = parseInt(sector.getAttribute("data-pc"), 10);
        if (!isNaN(pcVal)) {
          rootPc = pcVal;
          $("keySel").value = pcVal;
          renderFB();
          renderCircleOfFifths(rootPc);
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
      $("jamBpmVal").textContent = jamBpm;
    };
  }

  if ($("btnMetro")) $("btnMetro").onclick = () => isMetroPlaying ? stopMetronome() : startMetronome();
  if ($("metroBpm")) {
    $("metroBpm").oninput = e => {
      metroBpm = parseInt(e.target.value, 10);
      $("metroBpmVal").textContent = metroBpm;
    };
  }

  if ($("monitorToggle")) {
    $("monitorToggle").onchange = e => {
      setMonitoringState(e.target.checked, monitorVolume);
    };
  }
  if ($("monitorVol")) {
    $("monitorVol").oninput = e => {
      const vol = parseFloat(e.target.value);
      if ($("monitorVolVal")) {
        $("monitorVolVal").textContent = Math.round(vol * 100) + "%";
      }
      setMonitoringState(isMonitoringEnabled, vol);
    };
  }

  if ($("outputDeviceSel")) {
    $("outputDeviceSel").onchange = e => {
      setAudioOutputDevice(e.target.value);
    };
  }

  $("fb").onclick = e => {
    const dot = e.target.closest(".note-dot");
    if (dot) {
      const midi = parseInt(dot.getAttribute("data-midi"), 10);
      playMidiNote(midi, refPitch);
    }
  };
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

// ---------- App Initialization ----------
initLang();
applyStaticI18n();
buildKeySel();
rebuildScaleSel();
rebuildTuningSel();
initSlideToggles();
bindEvents();
initDeviceSel();
listOutputDevices($("outputDeviceSel"), t);
updateTunerLabels(strings);
renderFB();
