/* ============================================================
   fretboard-view.js - Fretboard SVG, Circle of Fifths & Pitch Canvas
   ============================================================ */

import { NOTE, DEG, CIRCLE_MAJOR, CIRCLE_MINOR, pc, inScale } from "./music-theory.js";

export function drawFB(state, translateFn) {
  const fb = document.getElementById("fb");
  if (!fb) return;
  fb.innerHTML = "";

  const frets = 15;
  const numStrings = state.strings.length;
  const W = 840, H = 250, marginX = 40, marginY = 25;
  const usableW = W - marginX * 2, usableH = H - marginY * 2;

  // Fret positions
  const fretX = [marginX];
  for (let i = 1; i <= frets; i++) {
    fretX.push(marginX + (usableW * (i / frets)));
  }

  // Fretboard nut / frets
  for (let i = 0; i <= frets; i++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", fretX[i]);
    line.setAttribute("y1", marginY);
    line.setAttribute("x2", fretX[i]);
    line.setAttribute("y2", H - marginY);
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

  // Inlay markers
  const singleMarkers = [3, 5, 7, 9, 15];
  const doubleMarkers = [12];
  const stringY = (sIdx) => marginY + (sIdx * (usableH / (numStrings - 1)));

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

  // Strings
  for (let s = 0; s < numStrings; s++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = stringY(s);
    line.setAttribute("x1", marginX);
    line.setAttribute("y1", y);
    line.setAttribute("x2", fretX[frets]);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "#94a3b8");
    line.setAttribute("stroke-width", 1 + s * 0.5);
    fb.appendChild(line);
  }

  // Notes
  for (let s = 0; s < numStrings; s++) {
    const openMidi = state.strings[s];
    const y = stringY(s);

    for (let f = 0; f <= frets; f++) {
      const midi = openMidi + f;
      const notePc = pc(midi);
      const isRoot = (notePc === state.rootPc);
      const inCurrentScale = inScale(midi, state.rootPc, state.scaleId);

      const isLit = state.litPcs.includes(notePc);
      const isJamTarget = state.isJamPlaying && state.jamTargetChordPcs.includes(notePc);

      if (!inCurrentScale && !isLit && !state.voicingMode && !isJamTarget) continue;

      let isVoicingNote = false;
      if (state.voicingMode && state.currentVoicing) {
        const targetFret = state.currentVoicing.frets[s];
        if (targetFret !== null && targetFret === f) {
          isVoicingNote = true;
        }
      }

      if (state.voicingMode && !isVoicingNote && !isLit) continue;

      const cx = f === 0 ? marginX - 15 : (fretX[f - 1] + fretX[f]) / 2;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "note-dot");
      g.setAttribute("data-midi", midi);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", y);
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
      text.setAttribute("x", cx);
      text.setAttribute("y", y + 4);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", isLit ? "#0f172a" : "#ffffff");
      text.setAttribute("font-size", "11px");
      text.setAttribute("font-weight", "bold");

      const interval = pc(midi - state.rootPc);
      const label = state.labelMode === "deg" ? DEG[interval] : NOTE[notePc];
      text.textContent = label;
      g.appendChild(text);

      fb.appendChild(g);
    }
  }
}

export function updateTunerLabels(strings) {
  const tunerLayout = document.getElementById("tunerLayout");
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

export function updateTunerUI(detected, strings, centsOffFn) {
  const tunerLayout = document.getElementById("tunerLayout");
  if (!tunerLayout) return;
  const tunerStrings = tunerLayout.querySelectorAll(".tuner-string");
  tunerStrings.forEach(el => {
    el.className = "tuner-string";
  });

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
      const cents = centsOffFn(n.f, targetMidi);
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

export function renderCircleOfFifths(rootPc) {
  const svg = document.getElementById("circleSvg");
  if (!svg) return;
  svg.innerHTML = "";

  const cx = 150, cy = 150, rOuter = 135, rMid = 95, rInner = 55;
  const rootIndex = CIRCLE_MAJOR.findIndex(k => NOTE.indexOf(k.replace("b", "#")) === rootPc || NOTE.indexOf(k) === rootPc);
  const activeIdx = rootIndex !== -1 ? rootIndex : 0;
  const relIdx = (activeIdx + 3) % 12; // Relative minor

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

    // Outer Sector (Major)
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

    // Inner Sector (Minor)
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

export function drawPitchCanvas(pitchHistory) {
  const canvas = document.getElementById("pitchCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Guide lines: 0, +100c, +200c, -100c, -200c
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
  const timeWindow = 5000; // 5 seconds

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
