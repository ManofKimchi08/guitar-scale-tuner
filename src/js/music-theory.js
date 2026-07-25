/* ============================================================
   music-theory.js - Scales, Tunings, and Pitch Math Helpers
   ============================================================ */

export const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const DEG = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };

export const SCALES = {
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
export const SCALE_IDS = Object.keys(SCALES);

export const TUNINGS = {
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
export const TUNING_IDS = Object.keys(TUNINGS);

export const CIRCLE_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
export const CIRCLE_MINOR = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];

export const JAM_PROGRESSIONS = {
  pop: [0, 7, 9, 5],      // I - V - vi - IV
  jazz: [2, 7, 0, 9],     // ii - V - I - VI
  blues: [0, 5, 0, 7],    // I - IV - I - V
  sad: [0, 8, 3, 10]      // i - VI - III - VII
};

export function pc(m) {
  return ((m % 12) + 12) % 12;
}

export function freqToMidi(f, refPitch = 440) {
  return Math.round(69 + 12 * Math.log2(f / refPitch));
}

export function midiToFreq(m, refPitch = 440) {
  return refPitch * Math.pow(2, (m - 69) / 12);
}

export function centsOff(f, m, refPitch = 440) {
  const targetF = midiToFreq(m, refPitch);
  return Math.round(1200 * Math.log2(f / targetF));
}

export function inScale(m, rootPc, scaleId) {
  const set = SCALES[scaleId] || SCALES.major;
  return set.includes(pc(m - rootPc));
}

export function getChordVoicings(rootPc, chordTypeVal) {
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
