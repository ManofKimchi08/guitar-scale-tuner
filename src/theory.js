/* ============================================================
   Scales, heard. — Dynamic Music Theory Coach Engine
   Pure vanilla JS, zero innerHTML (strict CSP safe)
   ============================================================ */
(function (global) {
  "use strict";

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const DEGREE_LABELS = {
    0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
    6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
  };

  const mod12 = n => ((n % 12) + 12) % 12;
  const noteName = p => NOTE_NAMES[mod12(p)];

  function fmtTpl(tpl, rootPc) {
    if (!tpl) return "";
    return tpl.replace(/\{n(\d+)\}/g, (_, offset) => noteName(rootPc + parseInt(offset, 10)));
  }

  function stepString(semis) {
    const steps = [];
    for (let i = 0; i < semis.length; i++) {
      const cur = semis[i];
      const nxt = i + 1 < semis.length ? semis[i + 1] : 12;
      steps.push("+" + (nxt - cur));
    }
    return steps.join(" · ");
  }

  const INTERVAL_NAMES = {
    ko: {
      0: "근음(루트)", 1: "단2도", 2: "장2도", 3: "단3도", 4: "장3도", 5: "완전4도",
      6: "증4도/감5도", 7: "완전5도", 8: "단6도", 9: "장6도", 10: "단7도", 11: "장7도"
    },
    en: {
      0: "Root", 1: "Minor 2nd", 2: "Major 2nd", 3: "Minor 3rd", 4: "Major 3rd", 5: "Perfect 4th",
      6: "Tritone", 7: "Perfect 5th", 8: "Minor 6th", 9: "Major 6th", 10: "Minor 7th", 11: "Major 7th"
    },
    ja: {
      0: "ルート(根音)", 1: "短2度", 2: "長2度", 3: "短3度", 4: "長3度", 5: "完全4度",
      6: "トライトーン", 7: "完全5度", 8: "短6度", 9: "長6度", 10: "短7度", 11: "長7度"
    }
  };

  const UI_STRINGS = {
    ko: {
      badgeLive: "🎓 LIVE 이론 코치",
      quizHidden: "퀴즈 모드 진행 중 — 정답 스포일러 방지를 위해 이론 힌트를 숨겼습니다.",
      btnCalloutOn: "💬 말풍선 ON",
      btnCalloutOff: "💬 말풍선 OFF",
      btnDeepOpen: "📖 이론 자세히 보기 ▴",
      btnDeepClosed: "📖 이론 자세히 보기 ▾",
      cardFormulaTitle: "📐 공식 & 12음 건반",
      cardNoteTitlePrefix: "🎯 지금 음",
      cardChordsTitle: "🎼 어울리는 코드 & 연주 팁",
      lblStability: "화성 안정도",
      lblHigh: "안정",
      lblMid: "캐릭터",
      lblTension: "긴장/해결",
      lblNext: "추천 해결:",
      lblBackingKey: "실전 코드",
      lblProgression: "대표 진행",
      lblSoloScales: "솔로 추천",
      lblFingerShort: "지",
      openStrShort: "개방현",
      roleRoot: "루트 · 중심음",
      roleFifth: "코드톤 · 파워 5도",
      roleColor: "코드톤 · 캐릭터 음",
      roleGuide7: "가이드 톤 (7음)",
      roleModal: "모드 핵심 특징음",
      roleBlue: "블루 노트 (긴장/초킹)",
      roleTension: "경과음 · 연결 텐션",
      roleOutside: "스케일 밖 (크로매틱)",
      descRoot: "모든 멜로디의 기준점이자 최종 착지점입니다. 프레이즈의 시작이나 마무리를 {n0}(1)으로 끝내면 완전히 안정된 해결감을 줍니다.",
      descFifth: "루트 다음으로 가장 안정적인 울림({n7})입니다. 백킹 코드 위에서 힘 있고 깔끔하게 뻗는 해결음이나 더블스톱의 축으로 적합합니다.",
      descThirdMinor: "곡의 마이너 감성을 결정하는 핵심 단3도({n3})입니다. {n0}m7의 3음이라 강박 착지가 가능하며 1/4음 초킹 시 블루스 느낌이 살아납니다.",
      descThirdMajor: "밝고 선명한 메이저 감성을 결정하는 장3도({n4})입니다. 코드의 성격을 가장 뚜렷하게 드러내는 핵심 멜로디 타겟입니다.",
      descSeventhDom: "도미넌트·마이너 사운드에 그루브와 블루지함을 더하는 단7도({n10})입니다. 장7도보다 부드럽고 루트({n0})로 올라가기 좋은 발판입니다.",
      descSeventhMaj: "세련되고 몽환적인 재즈·시티팝 색채를 만드는 장7도({n11})입니다. 반음 위 루트({n0})로 자연스럽게 이끌어 주는 리딩 톤 역할도 합니다.",
      descBlue: "반음 간격의 날카로운 긴장감({n6})을 주는 블루 노트입니다. 오래 머물기보다 5도({n7})나 4도({n5})로 빠르게 스쳐 지나가며 꺾어 치세요.",
      descDorian6: "일반 내추럴 마이너와 달리 반음 높은 장6도({n9})가 도리안 특유의 세련되고 펑키한 밝기를 만들어 줍니다.",
      descPhrygian2: "루트 바로 반음 위 단2도({n1})는 프리지안 특유의 강렬한 스패니시·플라멩코·메탈 텐션을 즉시 만들어 냅니다.",
      descLydian4: "완전4도보다 반음 높은 증4도(#4·{n6})가 리디안 특유의 신비롭고 공중에 뜬 영화음악 같은 색채를 만듭니다.",
      descHarmonic7: "단음계에 장7도({n11})를 올려 극적이고 이국적인 클래식/네오클래시컬 긴장감을 부여한 음입니다.",
      descInScale: "스케일 구성을 부드럽게 잇는 연결음({deg}·{note})입니다. 약박에서 거쳐 가거나 3도·5도 코드톤으로 해결할 때 특히 자연스럽습니다.",
      descChordTone: "현재 선택된 {chordName} 코드의 핵심 구성음({deg}·{note})입니다. 반주 위로 묵직하게 뻗거나 아르페지오의 중심으로 삼기 좋습니다.",
      descOutside: "현재 스케일/코드 구성 밖의 음입니다. 크로매틱 패싱 톤처럼 짧게 스쳐 인접한 {near} 음으로 해결하면 재지한 뉘앙스가 됩니다.",
      resolveCenter: "안정 착지",
      resolveFifth: "5도 해결",
      resolveThird: "3도 해결",
      resolveNearest: "스케일 복귀"
    },
    en: {
      badgeLive: "🎓 LIVE Theory Coach",
      quizHidden: "Quiz active — theory hints are hidden to avoid spoiling the answer.",
      btnCalloutOn: "💬 Callout ON",
      btnCalloutOff: "💬 Callout OFF",
      btnDeepOpen: "📖 Deep Theory ▴",
      btnDeepClosed: "📖 Deep Theory ▾",
      cardFormulaTitle: "📐 Formula & 12-Tone Keys",
      cardNoteTitlePrefix: "🎯 Active Note",
      cardChordsTitle: "🎼 Backing Chords & Phrasing",
      lblStability: "Harmonic Stability",
      lblHigh: "Stable",
      lblMid: "Color",
      lblTension: "Tension",
      lblNext: "Next:",
      lblBackingKey: "Chords",
      lblProgression: "Progression",
      lblSoloScales: "Solo Scales",
      lblFingerShort: "F",
      openStrShort: "Open",
      roleRoot: "Root · Home Base",
      roleFifth: "Chord Tone · Power 5th",
      roleColor: "Chord Tone · Color",
      roleGuide7: "Guide Tone (7th)",
      roleModal: "Signature Modal Tone",
      roleBlue: "Blue Note (Bend/Pass)",
      roleTension: "Passing · Tension",
      roleOutside: "Outside (Chromatic)",
      descRoot: "Tonic anchor and strongest resolution target ({n0}). Starting or ending a phrase here sounds grounded and complete.",
      descFifth: "Second most consonant interval ({n7}) above the root. Cuts cleanly over chords and anchors double-stops or power licks.",
      descThirdMinor: "Defines minor color ({n3}). Matches the 3rd of {n0}m7 for strong downbeat landings or a subtle 1/4-step blues bend.",
      descThirdMajor: "Defines bright major character ({n4}). A prime melodic target that makes chord changes unmistakable.",
      descSeventhDom: "Adds soulful groove and blues edge ({n10}). Sets up smooth motion back up to the root ({n0}).",
      descSeventhMaj: "Creates lush jazz/pop color ({n11}) and pulls upward by a half-step toward the tonic ({n0}).",
      descBlue: "Signature chromatic blue note ({n6}). Use as a quick passing tension or bend sliding smoothly into {n7} or {n5}.",
      descDorian6: "Natural 6th ({n9}) separates Dorian from natural minor, creating a soulful funk/fusion lift.",
      descPhrygian2: "Half-step b2 ({n1}) above the root delivers instant Spanish, flamenco, or dark metal tension.",
      descLydian4: "Raised #4 ({n6}) removes the avoid note and creates a bright, cinematic, floating Lydian mood.",
      descHarmonic7: "Raised leading tone ({n11}) inside a minor frame drives dramatic neoclassical pull to {n0}.",
      descInScale: "Connecting scale tone ({deg} · {note}) ideal on weak beats or resolving smoothly into nearby 3rd or 5th chord tones.",
      descChordTone: "Core chord tone ({deg} · {note}) inside {chordName}. Strong landing target for arpeggios and rhythmic accents.",
      descOutside: "Chromatic tone outside the active scale/chord. Pass quickly into nearby {near} for an intentional jazz/fusion touch.",
      resolveCenter: "Resolve Root",
      resolveFifth: "5th Anchor",
      resolveThird: "3rd Color",
      resolveNearest: "In-Scale Step"
    },
    ja: {
      badgeLive: "🎓 LIVE 理論コーチ",
      quizHidden: "クイズ進行中 — 解答保護のため理論ヒントを非表示にしています。",
      btnCalloutOn: "💬 吹き出し ON",
      btnCalloutOff: "💬 吹き出し OFF",
      btnDeepOpen: "📖 理論を詳しく見る ▴",
      btnDeepClosed: "📖 理論を詳しく見る ▾",
      cardFormulaTitle: "📐 公式 & 12音ミニ鍵盤",
      cardNoteTitlePrefix: "🎯 現在の音",
      cardChordsTitle: "🎼 合うコード & 実践ヒント",
      lblStability: "和声の安定度",
      lblHigh: "安定",
      lblMid: "カラー",
      lblTension: "緊張/解決",
      lblNext: "推奨解決:",
      lblBackingKey: "対応コード",
      lblProgression: "定番進行",
      lblSoloScales: "推奨スケール",
      lblFingerShort: "指",
      openStrShort: "開放弦",
      roleRoot: "ルート・中心音",
      roleFifth: "コードトーン・完全5度",
      roleColor: "コードトーン・特性音",
      roleGuide7: "ガイドトーン (7度)",
      roleModal: "モード特性音",
      roleBlue: "ブルーノート (経過/チョーキング)",
      roleTension: "経過音・テンション",
      roleOutside: "スケール外 (クロマチック)",
      descRoot: "すべてのフレーズの基準となる着地点({n0})です。フレーズの終わりをこの音で締めると強い安定感が出ます。",
      descFifth: "ルートに次いで安定した響き({n7})です。伴奏の上で力強く伸び、ダブルストップの軸にも最適です。",
      descThirdMinor: "マイナーの哀愁を決める重要な短3度({n3})です。{n0}m7の第3音にあたり、クォーターチョーキングも効果的です。",
      descThirdMajor: "明るくクリアなメジャー感を決定づける長3度({n4})です。コードチェンジを明確に表現できます。",
      descSeventhDom: "グルーヴとブルージーな深みを生む短7度({n10})です。ルート({n0})へ戻る橋渡しとして活躍します。",
      descSeventhMaj: "洗練された浮遊感を生む長7度({n11})です。半音上のルート({n0})へ滑らかに導く導音として機能します。",
      descBlue: "鋭いブルージーな緊張感({n6})を与える音です。長く伸ばすより、{n7}や{n5}へ素早く抜ける経過音として使います。",
      descDorian6: "ナチュラルマイナーより半音高い長6度({n9})が、ドリアン特有の洗練されたファンキーさを生み出します。",
      descPhrygian2: "ルート直上の短2度({n1})が、スパニッシュ・フラメンコ・メタル風の強烈な緊張感を瞬時に作ります。",
      descLydian4: "半音高い増4度(#4・{n6})により、シネマティックで浮遊感のあるリディアン独特の響きが得られます。",
      descHarmonic7: "短音階に長7度({n11})を取り入れ、ドラマチックでクラシック的な解決感を生む導音です。",
      descInScale: "コードトーン同士を滑らかに繋ぐ経過音({deg}・{note})です。弱拍で通過して3度や5度へ着地させると自然です。",
      descChordTone: "{chordName} の中核コードトーン({deg}・{note})です。アルペジオや伸ばす音のターゲットに最適です。",
      descOutside: "現在のスケール・コード外の音です。半音経過音として隣接する {near} へ素早く解決するとジャズ的な響きになります。",
      resolveCenter: "ルート解決",
      resolveFifth: "5度着地",
      resolveThird: "3度表現",
      resolveNearest: "スケールへ戻す"
    }
  };

  const SCALE_META = {
    major: {
      semis: [0, 2, 4, 5, 7, 9, 11],
      characterSemis: [4, 11],
      relOffset: 9, relSuffix: "m", relType: { ko: "나란한 단조", en: "Rel. Minor", ja: "平行短調" },
      chordsSpec: [[0, "maj7"], [2, "m7"], [4, "m7"], [5, "maj7"], [7, "7"], [9, "m7"]],
      progSpec: [[0, ""], [7, ""], [9, "m"], [5, ""]],
      summary: {
        ko: "가장 기본이 되는 밝은 7음계(Ionian)입니다. 4도({n5})와 7도({n11}) 반음 해결감이 조성을 뚜렷하게 잡아줍니다.",
        en: "Bright foundational 7-note Ionian scale driven by half-step pulls at {n5}→{n4} and {n11}→{n0}.",
        ja: "基本となる明るい7音スケール（イオニアン）です。半音解決が調性を明確にします。"
      },
      expansion: {
        ko: "펜타토닉({n0}·{n2}·{n4}·{n7}·{n9})만 추리면 어떤 코드에서도 부딪힘 없이 연주할 수 있습니다.",
        en: "Keep {n0}-{n2}-{n4}-{n7}-{n9} for foolproof Major Pentatonic phrasing; save {n5} as a passing tone over {n0} chords.",
        ja: "{n0}・{n2}・{n4}・{n7}・{n9} に絞るとメジャーペンタトニックとして安定して弾けます。"
      },
      tip: {
        ko: "🎸 팁: {n0} 메이저 코드 위에서는 4도({n5})를 오래 끌기보다 장3도({n4})·장7도({n11})로 스치듯 해결하세요.",
        en: "🎸 Tip: On a {n0} chord, pass quickly through 4th ({n5}) into crisp 3rd ({n4}) or 7th ({n11}).",
        ja: "🎸 ヒント: {n0}コード上では4度({n5})を長く伸ばさず、3度({n4})や7度({n11})へ着地させましょう。"
      }
    },
    natural_minor: {
      semis: [0, 2, 3, 5, 7, 8, 10],
      characterSemis: [3, 8, 10],
      relOffset: 3, relSuffix: " Major", relType: { ko: "나란한 조", en: "Rel. Major", ja: "平行長調" },
      chordsSpec: [[0, "m7"], [3, "maj7"], [5, "m7"], [7, "m7"], [8, "maj7"], [10, "7"]],
      progSpec: [[0, "m"], [8, ""], [10, ""], [0, "m"]],
      summary: {
        ko: "서정적이고 어두운 Aeolian 단음계입니다. 단3도({n3})와 단6도({n8})·단7도({n10})가 전형적인 마이너 정서를 만듭니다.",
        en: "Expressive Aeolian minor scale where b3 ({n3}), b6 ({n8}), and b7 ({n10}) create classic minor depth.",
        ja: "叙情的で哀愁のあるエオリアン短音階。b3({n3})・b6({n8})・b7({n10})が特徴です。"
      },
      expansion: {
        ko: "b6({n8})가 {n7}을 향해 강하게 내려가므로 5도({n7})로 해결하면 극적인 라인이 나옵니다.",
        en: "Pair {n8} (b6) resolving downward to {n7} (5) with core {n0} Minor Pentatonic shapes.",
        ja: "b6({n8})から5度({n7})への下行解決をペンタトニックに混ぜると表情が豊かになります。"
      },
      tip: {
        ko: "🎸 팁: {n8}→{n7} 반음 하행 라인을 넣고 싶다면 단6도({n8})에서 5도({n7})로 슬라이드해 보세요.",
        en: "🎸 Tip: Slide down the emotional half-step b6 ({n8}) → 5 ({n7}) over {n0}m and {n8} chords.",
        ja: "🎸 ヒント: b6({n8})→5({n7}) の半音ダウンをスライドで繋ぐと哀愁あるフレーズになります。"
      }
    },
    harmonic_minor: {
      semis: [0, 2, 3, 5, 7, 8, 11],
      characterSemis: [8, 11],
      relOffset: 0, relSuffix: "m (Harmonic)", relType: { ko: "하모닉 구조", en: "Minor + ♮7", ja: "和声的短音階" },
      chordsSpec: [[0, "m"], [5, "m7"], [7, "7"], [8, "maj7"]],
      progSpec: [[0, "m"], [5, "m"], [7, "7"], [0, "m"]],
      summary: {
        ko: "내추럴 마이너의 7음을 반음 올린({n11}) 스케일입니다. {n8}→{n11} 증2도 간격이 네오클래시컬·라틴 색채를 만듭니다.",
        en: "Raises the 7th to {n11}, creating an exotic augmented-2nd leap ({n8}↔{n11}) and strong V7→i pull.",
        ja: "7度を半音上げた({n11})スケール。{n8}↔{n11} の増2度がドラマチックな響きを作ります。"
      },
      expansion: {
        ko: "도미넌트 코드({n7}7)가 나올 때 내추럴 마이너 대신 {n11}(장7도)을 넣으면 코드와 100% 맞물립니다.",
        en: "Switch here specifically when the backing hits the V7 chord ({n7}7), targeting {n11} (the 3rd of {n7}7).",
        ja: "V7コード({n7}7)の瞬間に使うと、長3度にあたる{n11}が完璧に調和します。"
      },
      tip: {
        ko: "🎸 팁: {n7}7 코드에서 7도({n11})→루트({n0}) 반음 상행 해결이나 이코노미 피킹 아르페지오를 연습하세요.",
        en: "🎸 Tip: Highlight the exotic {n8} → {n11} → {n0} turn over {n7}7 → {n0}m cadences.",
        ja: "🎸 ヒント: {n7}7上で {n8} → {n11} → {n0} の動きを強調すると劇的な効果が出ます。"
      }
    },
    melodic_minor: {
      semis: [0, 2, 3, 5, 7, 9, 11],
      characterSemis: [3, 9, 11],
      relOffset: 0, relSuffix: "m (Maj7)", relType: { ko: "재즈 마이너", en: "Jazz Minor", ja: "旋律的短音階" },
      chordsSpec: [[0, "m(maj7)"], [5, "7"], [7, "7"], [2, "m7"]],
      progSpec: [[0, "m(maj7)"], [5, "7"], [0, "m"]],
      summary: {
        ko: "메이저 스케일에서 3음만 단3도({n3})로 내린 현대 재즈·퓨전의 핵심 스케일입니다.",
        en: "Major scale with only a lowered b3 ({n3}); cornerstone of modern jazz and fusion harmony.",
        ja: "メジャースケールの3度だけを短3度({n3})にした、モダンジャズ＆フュージョンの要です。"
      },
      expansion: {
        ko: "{n3}(b3)과 {n11}(7)이 공존해 미스터리한 m(maj7) 사운드를 냅니다. 6도({n9})로 부드럽게 이어줍니다.",
        en: "Combines minor b3 ({n3}) with bright ♮6 ({n9}) and leading ♮7 ({n11}), eliminating harmonic gaps.",
        ja: "b3({n3})の陰りと ♮6({n9})・♮7({n11})の洗練さが同居する都会的なサウンドです。"
      },
      tip: {
        ko: "🎸 팁: 1·b3·5·7({n0}·{n3}·{n7}·{n11}) 아르페지오를 연결해 세련된 퓨전 톤을 만들어 보세요.",
        en: "🎸 Tip: Outline {n0}-{n3}-{n7}-{n11} (mMaj7 arpeggio) for an instant modern fusion color.",
        ja: "🎸 ヒント: {n0}-{n3}-{n7}-{n11} のm(maj7)アルペジオを軸に組み立てるのがおすすめです。"
      }
    },
    major_pent: {
      semis: [0, 2, 4, 7, 9],
      characterSemis: [4, 9],
      relOffset: 9, relSuffix: "m", relType: { ko: "나란한 단조", en: "Rel. Minor", ja: "平行短調" },
      chordsSpec: [[0, ""], [0, "maj7"], [5, ""], [7, ""], [9, "m7"]],
      progSpec: [[0, ""], [7, ""], [9, "m"], [5, ""]],
      summary: {
        ko: "4도·7도를 생략해 맑고 컨트리·팝·발라드에 최적인 밝은 5음계입니다. 나란한 {n9} 마이너 펜타토닉과 지판 모양이 같습니다.",
        en: "Bright 5-note scale omitting half-step tensions; shares identical shapes with {n9} Minor Pentatonic.",
        ja: "半音ぶつかりを省いた明るく爽やかな5音階。{n9}マイナーペンタと同一ポジションで弾けます。"
      },
      expansion: {
        ko: "메이저 펜타토닉의 핵심 구분음은 장3도({n4})와 장6도({n9})입니다. 착지할 땐 {n0}·{n4}에 세우세요.",
        en: "Same notes as {n9}m Pentatonic, but center phrasing on {n0} (1) and {n4} (3) instead of {n9}.",
        ja: "{n9}マイナーペンタと同じ指板配置ですが、{n0}(1)と{n4}(3)を着地点にするとメジャーに聴こえます。"
      },
      tip: {
        ko: "🎸 팁: 단3도({n3})에서 장3도({n4})로 빠르게 해머링하거나 더블스톱 벤딩을 주면 컨트리·소울 릭이 됩니다.",
        en: "🎸 Tip: Hammer-on from {n3} (b3) into {n4} (3) or bend {n2}→{n4} for sweet country/soul bends.",
        ja: "🎸 ヒント: {n3}→{n4} のハンマリングや {n2}→{n4} のチョーキングでソウル/ポップスらしい表現になります。"
      }
    },
    minor_pent: {
      semis: [0, 3, 5, 7, 10],
      characterSemis: [3, 10],
      extraBlueSemi: 6,
      relOffset: 3, relSuffix: " Major", relType: { ko: "나란한 조", en: "Rel. Major", ja: "平行長調" },
      chordsSpec: [[0, "m7"], [5, "m7"], [7, "m7"], [3, ""], [10, ""]],
      progSpec: [[0, "m"], [8, ""], [3, ""], [10, ""]],
      summary: {
        ko: "마이너 스케일에서 2도({n2})·단6도({n8}) 반음 불협화음을 덜어내 어떤 록·블루스 반주에도 자연스럽게 녹아드는 5음계입니다.",
        en: "Removes semitone tensions ({n2}, {n8}) from natural minor, locking effortlessly into rock, pop, and blues.",
        ja: "短音階から半音のぶつかり({n2}・{n8})を除き、どんなバッキングにも自然に馴染む定番の5音階です。"
      },
      expansion: {
        ko: "+b5({n6})을 추가하면 {n0} 블루스 스케일, +{n2}(2)·{n8}(b6)을 채우면 내추럴 마이너로 확장됩니다.",
        en: "Add b5 ({n6}) for {n0} Blues, or restore 2 ({n2}) & b6 ({n8}) for full Natural Minor.",
        ja: "+b5({n6}) でブルーススケール、+2({n2})・b6({n8}) でナチュラルマイナーに発展します。"
      },
      tip: {
        ko: "🎸 팁: Box 1에서 b3({n3})를 1/4음 살짝 당긴 뒤 1({n0})·5({n7})로 내려오면 깔끔한 록·블루스 릭이 완성됩니다.",
        en: "🎸 Tip: Give b3 ({n3}) a slight quarter-tone curl before resolving firmly to {n0} (1) or {n7} (5).",
        ja: "🎸 ヒント: b3({n3})をわずかにクォーターチョーキングしてから {n0}(1) や {n7}(5) へ着地させましょう。"
      }
    },
    blues: {
      semis: [0, 3, 5, 6, 7, 10],
      characterSemis: [3, 6],
      relOffset: 3, relSuffix: " Major", relType: { ko: "나란한 조", en: "Rel. Major", ja: "平行長調" },
      chordsSpec: [[0, "7"], [5, "7"], [7, "7"], [0, "m7"]],
      progSpec: [[0, "7"], [5, "7"], [0, "7"], [7, "7"]],
      summary: {
        ko: "마이너 펜타토닉에 b5({n6}·블루 노트)를 더해 짙은 스윙감과 애절한 텐션을 만드는 6음 스케일입니다.",
        en: "Minor Pentatonic plus the chromatic b5 blue note ({n6}), delivering signature blues tension and grit.",
        ja: "マイナーペンタにブルーノート b5({n6}) を加えた、粘り強い表現力の6音スケールです。"
      },
      expansion: {
        ko: "{n5}(4) — {n6}(b5) — {n7}(5) 반음 3연결 라인이 블루스 기타 특유의 미끄러지는 느낌을 줍니다.",
        en: "Chromatic run {n5}(4) – {n6}(b5) – {n7}(5) creates classic sliding blues expression.",
        ja: "{n5}(4)–{n6}(b5)–{n7}(5) の半音連結ラインがブルース特有のうねりを生みます。"
      },
      tip: {
        ko: "🎸 팁: 블루 노트 {n6}(b5)는 길게 끌기보다 4({n5})→b5({n6})→5({n7}) 패싱이나 슬라이드용으로 활용하세요.",
        en: "🎸 Tip: Pass quickly through {n6} (b5) between {n5} and {n7} rather than resting on it.",
        ja: "🎸 ヒント: ブルーノート {n6}(b5) は伸ばし続けず、{n5} と {n7} を繋ぐ経過音・スライドに使います。"
      }
    },
    dorian: {
      semis: [0, 2, 3, 5, 7, 9, 10],
      characterSemis: [3, 9],
      relOffset: 10, relSuffix: " Major", relType: { ko: "모체 메이저 키", en: "Parent Key", ja: "親スケール" },
      chordsSpec: [[0, "m7"], [5, "7"], [2, "m7"], [3, "maj7"]],
      progSpec: [[0, "m7"], [5, "7"], [0, "m7"]],
      summary: {
        ko: "마이너 기반이지만 ♮6도({n9})가 들어가 펑크·산타나 록·재즈에서 사랑받는 세련된 모드입니다.",
        en: "Soulful minor mode brightened by its natural 6th ({n9}) — essential for funk, fusion, and Santana-style jams.",
        ja: "マイナー骨格に長6度({n9})を含む、ファンク・フュージョン・ロック定番の洗練されたモードです。"
      },
      expansion: {
        ko: "{n0} 마이너 펜타토닉 위에 핵심 특징음 ♮6({n9})와 2({n2})만 얹으면 바로 도리안 사운드가 됩니다.",
        en: "Simply add ♮6 ({n9}) and 2 ({n2}) to your {n0} Minor Pentatonic boxes to sound distinctly Dorian.",
        ja: "{n0}マイナーペンタに特性音 ♮6({n9}) と 2({n2}) を足すだけで即ドリアンサウンドになります。"
      },
      tip: {
        ko: "🎸 팁: 반주에 {n0}m7 → {n5}7(IV7) 코드가 나오면 ♮6도({n9})를 의도적으로 강조해 보세요.",
        en: "🎸 Tip: Target the signature ♮6 ({n9}) against {n0}m7 → {n5}7 vamps to highlight the Dorian lift.",
        ja: "🎸 ヒント: {n0}m7 → {n5}7 の進行で特性音の ♮6({n9}) を強調するとドリアンらしさが際立ちます。"
      }
    },
    phrygian: {
      semis: [0, 1, 3, 5, 7, 8, 10],
      characterSemis: [1, 8],
      relOffset: 8, relSuffix: " Major", relType: { ko: "모체 메이저 키", en: "Parent Key", ja: "親スケール" },
      chordsSpec: [[0, "m"], [1, "maj7"], [10, "m"], [8, ""]],
      progSpec: [[0, "m"], [1, ""], [0, "m"]],
      summary: {
        ko: "루트 바로 반음 위 b2({n1})가 스패니시·플라멩코·다크 메탈의 긴박한 분위기를 즉시 자아냅니다.",
        en: "Dark, exotic mode defined by the ominous half-step b2 ({n1}) directly above root {n0}.",
        ja: "ルート直上の b2({n1}) がスパニッシュ・フラメンコ・メタルの鋭い緊張感を生むモードです。"
      },
      expansion: {
        ko: "b2({n1}) → 1({n0}) 반음 하행 리프가 프리지안 사운드를 가장 직관적으로 각인시킵니다.",
        en: "Emphasize {n1} (b2) pulling down into {n0} (1) against an open {n0} pedal drone.",
        ja: "開放弦ペダルに乗せて {n1}(b2) → {n0}(1) の半音解決を繰り返すのが王道です。"
      },
      tip: {
        ko: "🎸 팁: {n0} 오픈현/페달음 사이로 b2({n1})와 b3({n3})를 번갈아 치면 강렬한 메탈·스패니시 리프가 됩니다.",
        en: "🎸 Tip: Pedal on root {n0} while weaving {n1} (b2) and {n3} (b3) for instant Spanish or metal riffs.",
        ja: "🎸 ヒント: ルート{n0}を刻みながら b2({n1}) と b3({n3}) を絡めると強烈なリフになります。"
      }
    },
    lydian: {
      semis: [0, 2, 4, 6, 7, 9, 11],
      characterSemis: [6, 11],
      relOffset: 7, relSuffix: " Major", relType: { ko: "모체 메이저 키", en: "Parent Key", ja: "親スケール" },
      chordsSpec: [[0, "maj7"], [2, ""], [11, "m"], [9, "m7"]],
      progSpec: [[0, "maj7"], [2, ""], [0, "maj7"]],
      summary: {
        ko: "메이저 4도를 반음 올린 #4({n6})가 특징인 몽환적이고 영화음악·스티브 바이 스타일의 모드입니다.",
        en: "Dreamy, luminous major mode featuring the raised #4 ({n6}) — beloved in film scores and Vai-style solos.",
        ja: "4度を半音上げた #4({n6}) が特徴の、映画音楽やフュージョンで愛される浮遊感あるモードです。"
      },
      expansion: {
        ko: "메이저의 4도 피해야 할 음(Avoid Note)을 #4({n6})로 바꿔 어떤 멜로디도 공중에 뜬 듯 맑게 울립니다.",
        en: "Replaces the Major scale's avoid note with #4 ({n6}), giving major chords a shimmering #11 shimmer.",
        ja: "メジャースケールのアボイドノートが #4({n6}) になり、maj7(#11) の澄んだ響きが得られます。"
      },
      tip: {
        ko: "🎸 팁: {n0}maj7 반주 위에서 {n6}(#4)를 길게 끌거나 5도({n7})로 반음 슬라이드해 보세요.",
        en: "🎸 Tip: Sustain #4 ({n6}) or slide {n6} ↔ {n7} gently over a static {n0}maj7 pad.",
        ja: "🎸 ヒント: {n0}maj7上で #4({n6}) を伸ばしたり {n7}(5) へ半音スライドさせると幻想的に響きます。"
      }
    },
    mixolydian: {
      semis: [0, 2, 4, 5, 7, 9, 10],
      characterSemis: [4, 10],
      relOffset: 5, relSuffix: " Major", relType: { ko: "모체 메이저 키", en: "Parent Key", ja: "親スケール" },
      chordsSpec: [[0, "7"], [10, ""], [5, ""], [7, "m7"]],
      progSpec: [[0, "7"], [10, ""], [5, ""], [0, "7"]],
      summary: {
        ko: "메이저 스케일에 b7({n10})이 결합되어 펑키·블루지한 도미넌트 록 사운드를 내는 모드입니다.",
        en: "Combines a bright major 3rd ({n4}) with a bluesy b7 ({n10}); essential for classic rock, funk, and dominant vamps.",
        ja: "長3度({n4})の明るさと短7度({n10})のブルージーさが同居する、ロック＆ファンクの定番モードです。"
      },
      expansion: {
        ko: "장3도({n4})와 단7도({n10})의 트라이톤 쌍이 {n0}7(도미넌트 세븐스) 코드의 뼈대를 이룹니다.",
        en: "Targets the {n4}(3)–{n10}(b7) tritone core directly matching a {n0}7 dominant chord.",
        ja: "{n4}(3) と {n10}(b7) が {n0}7 コードの要であるガイドトーンになります。"
      },
      tip: {
        ko: "🎸 팁: {n0}7 리프에서 단3도({n3})에서 장3도({n4})로 해머링한 뒤 b7({n10})으로 마무리해 보세요.",
        en: "🎸 Tip: Hammer {n3}(b3)→{n4}(3) and drop into {n10}(b7) for classic funk-rock groove.",
        ja: "🎸 ヒント: {n3}→{n4} へハンマリングし、{n10}(b7) で締めるとファンキーなロックリックになります。"
      }
    }
  };

  const CHORD_META = {
    major: {
      semis: [0, 4, 7],
      labelSuffix: "",
      characterSemis: [4],
      soloScales: {
        ko: ["{n0} 메이저 펜타토닉", "{n0} 아이오니안", "{n0} 리디안"],
        en: ["{n0} Major Pentatonic", "{n0} Major (Ionian)", "{n0} Lydian"],
        ja: ["{n0} メジャーペンタトニック", "{n0} メジャー", "{n0} リディアン"]
      },
      chordsSpec: [[0, ""], [5, ""], [7, ""], [9, "m"]],
      progSpec: [[0, ""], [7, ""], [9, "m"], [5, ""]],
      summary: {
        ko: "근음(1·{n0}), 장3도(3·{n4}), 완전5도(5·{n7}) 3음으로 구성된 가장 밝고 안정된 기본 3화음입니다.",
        en: "Foundational bright major triad built from Root ({n0}), Major 3rd ({n4}), and Perfect 5th ({n7}).",
        ja: "ルート({n0})・長3度({n4})・完全5度({n7})から成る明るく安定した基本の3和音です。"
      },
      expansion: {
        ko: "장3도({n4})가 코드의 밝은 색깔을 정하며, 멜로디로 {n0}·{n4}·{n7} 코드톤을 짚으면 탄탄합니다.",
        en: "Major 3rd ({n4}) defines the cheerful character; target {n0}, {n4}, or {n7} for airtight melodies.",
        ja: "長3度({n4})が明るさの決め手。ソロでも {n0}・{n4}・{n7} を狙うと安定します。"
      },
      tip: {
        ko: "🎸 팁: 보이싱의 3음({n4})이 깨끗이 울리는지 확인하고, 전주/솔로엔 {n0} 메이저 펜타토닉을 써보세요.",
        en: "🎸 Tip: Keep the Major 3rd ({n4}) ringing clearly and pair with {n0} Major Pentatonic over this chord.",
        ja: "🎸 ヒント: 3度({n4})が濁らず鳴っているか確認し、ソロには{n0}メジャーペンタを合わせましょう。"
      }
    },
    minor: {
      semis: [0, 3, 7],
      labelSuffix: "m",
      characterSemis: [3],
      soloScales: {
        ko: ["{n0} 마이너 펜타토닉", "{n0} 내추럴 마이너", "{n0} 도리안"],
        en: ["{n0} Minor Pentatonic", "{n0} Natural Minor", "{n0} Dorian"],
        ja: ["{n0} マイナーペンタトニック", "{n0} ナチュラルマイナー", "{n0} ドリアン"]
      },
      chordsSpec: [[0, "m"], [5, "m"], [7, "m"], [3, ""]],
      progSpec: [[0, "m"], [8, ""], [3, ""], [10, ""]],
      summary: {
        ko: "근음(1·{n0}), 단3도(b3·{n3}), 완전5도(5·{n7})로 이루어진 서정적이고 차분한 마이너 3화음입니다.",
        en: "Melancholic minor triad combining Root ({n0}), Minor 3rd ({n3}), and Perfect 5th ({n7}).",
        ja: "ルート({n0})・短3度({n3})・完全5度({n7})で構成される叙情的なマイナー3和音です。"
      },
      expansion: {
        ko: "장3도보다 반음 낮은 b3({n3})가 애절한 분위기를 만들며, 나란한 조는 {n3} Major입니다.",
        en: "b3 ({n3}) creates the minor mood and doubles as the tonic of its Relative Major ({n3} Major).",
        ja: "b3({n3}) が哀愁を生み、平行長調は {n3} メジャーになります。"
      },
      tip: {
        ko: "🎸 팁: 아르페지오에서 b3({n3}) 음을 살짝 비브라토하면 감정 전달력이 배가됩니다.",
        en: "🎸 Tip: Lean slightly into b3 ({n3}) when arpeggiating, or solo freely with {n0} Minor Pentatonic.",
        ja: "🎸 ヒント: アルペジオで b3({n3}) に軽くビブラートをかけると表情が豊かになります。"
      }
    },
    dom7: {
      semis: [0, 4, 7, 10],
      labelSuffix: "7",
      characterSemis: [4, 10],
      soloScales: {
        ko: ["{n0} 믹솔리디안", "{n0} 블루스", "{n0} 마이너 펜타토닉"],
        en: ["{n0} Mixolydian", "{n0} Blues", "{n0} Minor Pentatonic"],
        ja: ["{n0} ミクソリディアン", "{n0} ブルース", "{n0} マイナーペンタ"]
      },
      chordsSpec: [[0, "7"], [5, "7"], [7, "7"], [0, ""]],
      progSpec: [[0, "7"], [5, "7"], [0, "7"], [7, "7"]],
      summary: {
        ko: "장3도({n4})와 단7도({n10})의 트라이톤(감5도) 긴장이 다음 코드로 밀어주는 블루스·펑크 핵심 7화음입니다.",
        en: "Built on 1-3-5-b7 ({n0}-{n4}-{n7}-{n10}). The {n4}↔{n10} tritone drives forward blues and funk tension.",
        ja: "長3度({n4})と短7度({n10})のトライトーンが推進力を生む、ブルース・ファンク必須の7thコードです。"
      },
      expansion: {
        ko: "3음({n4})과 b7음({n10}) 두 음(가이드 톤)만 잡아도 도미넌트 사운드가 완벽히 살아납니다.",
        en: "Even just hitting the 3rd ({n4}) and b7 ({n10}) guide tones outlines the full dominant harmony.",
        ja: "3度({n4})と b7({n10}) の2音（ガイドトーン）だけでもセブンスの響きが成立します。"
      },
      tip: {
        ko: "🎸 팁: 솔로에서는 {n0} 믹솔리디안이나 {n0} 블루스 스케일로 b3({n3})→3({n4}) 뉘앙스를 섞어 보세요.",
        en: "🎸 Tip: Mix {n0} Blues and {n0} Mixolydian, bending {n3}(b3) just up into {n4}(3).",
        ja: "🎸 ヒント: {n0}ブルースやミクソリディアンで b3({n3})→3({n4}) のニュアンスを混ぜましょう。"
      }
    },
    maj7: {
      semis: [0, 4, 7, 11],
      labelSuffix: "maj7",
      characterSemis: [4, 11],
      soloScales: {
        ko: ["{n0} 아이오니안 (메이저)", "{n0} 리디안", "{n0} 메이저 펜타토닉"],
        en: ["{n0} Major (Ionian)", "{n0} Lydian", "{n0} Major Pentatonic"],
        ja: ["{n0} メジャー (アイオニアン)", "{n0} リディアン", "{n0} メジャーペンタ"]
      },
      chordsSpec: [[0, "maj7"], [2, "m7"], [7, "7"], [9, "m7"]],
      progSpec: [[2, "m7"], [7, "7"], [0, "maj7"]],
      summary: {
        ko: "1-3-5-7({n0}·{n4}·{n7}·{n11})로 이루어진 맑고 로맨틱한 재즈·발라드·시티팝 대표 코드입니다.",
        en: "Lush 1-3-5-7 voicing ({n0}-{n4}-{n7}-{n11}) prized in jazz, neo-soul, ballads, and city pop.",
        ja: "1-3-5-7({n0}・{n4}・{n7}・{n11})から成る透明感あるジャズ・バラード・シティポップ定番コードです。"
      },
      expansion: {
        ko: "장7도({n11})와 루트({n0})의 반음 어우러짐이 포근하고 세련된 여운을 만듭니다.",
        en: "The gentle major-7th color tone ({n11}) softens the bright triad into an open, dreamy sound.",
        ja: "長7度({n11})の柔らかい響きがトライアドに洗練された余韻を加えます。"
      },
      tip: {
        ko: "🎸 팁: 멜로디 끝음으로 루트 대신 장7도({n11})나 3음({n4})에 멈추면 훨씬 세련되게 들립니다.",
        en: "🎸 Tip: Try resting phrases on the 7th ({n11}) or 3rd ({n4}) instead of the root for a jazzier feel.",
        ja: "🎸 ヒント: フレーズの着地点をルートではなく長7度({n11})や3度({n4})にすると都会的に響きます。"
      }
    },
    min7: {
      semis: [0, 3, 7, 10],
      labelSuffix: "m7",
      characterSemis: [3, 10],
      soloScales: {
        ko: ["{n0} 도리안", "{n0} 마이너 펜타토닉", "{n0} 내추럴 마이너"],
        en: ["{n0} Dorian", "{n0} Minor Pentatonic", "{n0} Natural Minor"],
        ja: ["{n0} ドリアン", "{n0} マイナーペンタトニック", "{n0} ナチュラルマイナー"]
      },
      chordsSpec: [[0, "m7"], [5, "7"], [5, "m7"], [7, "m7"]],
      progSpec: [[0, "m7"], [5, "7"], [10, "maj7"]],
      summary: {
        ko: "마이너 3화음에 부드러운 b7({n10})을 더해 네오소울·R&B·재즈 ii-V-I에서 빠지지 않는 코드입니다.",
        en: "Smooth minor 7th chord (1-b3-5-b7: {n0}-{n3}-{n7}-{n10}), central to R&B, neo-soul, and jazz ii–V–I.",
        ja: "マイナーに柔らかな短7度({n10})を加えた、R&B・ネオソウル・ジャズ ii–V–I 必須コードです。"
      },
      expansion: {
        ko: "b3({n3})와 b7({n10})이 감각적인 분위기를 만들며, 12키 {n0} 도리안/마이너 펜타토닉과 찰떡입니다.",
        en: "b3 ({n3}) + b7 ({n10}) create warm minor richness that pairs naturally with {n0} Dorian or Minor Pentatonic.",
        ja: "b3({n3}) と b7({n10}) の組み合わせは {n0} ドリアンやマイナーペンタと相性抜群です。"
      },
      tip: {
        ko: "🎸 팁: 코드 톤 {n3}(b3)와 {n10}(b7)을 왼손 해머링으로 꾸며 주면 세련된 리듬 기타가 됩니다.",
        en: "🎸 Tip: Hammer-on onto b3 ({n3}) or b7 ({n10}) inside the chord grip for classic R&B embellishments.",
        ja: "🎸 ヒント: コードを押さえながら b3({n3}) や b7({n10}) へハンマリングするとR&B風になります。"
      }
    }
  };

  function getScaleTheory(rootPc, scaleId, lang) {
    const L = UI_STRINGS[lang] ? lang : "en";
    const meta = SCALE_META[scaleId] || SCALE_META.minor_pent;
    const scaleNotes = meta.semis.map(semi => ({
      semi,
      pc: mod12(rootPc + semi),
      name: noteName(rootPc + semi),
      deg: DEGREE_LABELS[semi] || String(semi)
    }));

    const relRoot = mod12(rootPc + meta.relOffset);
    const relName = noteName(relRoot) + meta.relSuffix;
    const backingChords = meta.chordsSpec.map(([off, suf]) => noteName(rootPc + off) + suf);
    const progression = meta.progSpec.map(([off, suf]) => noteName(rootPc + off) + suf).join(" – ");

    return {
      mode: "scale",
      rootPc,
      scaleId,
      semis: meta.semis,
      extraBlueSemi: meta.extraBlueSemi !== undefined ? meta.extraBlueSemi : null,
      characterSemis: meta.characterSemis || [],
      notes: scaleNotes,
      formulaStr: scaleNotes.map(n => n.deg).join("-"),
      stepStr: stepString(meta.semis),
      relativeBadge: `${meta.relType[L]}: ${relName}`,
      backingChords,
      progression,
      summary: fmtTpl(meta.summary[L], rootPc),
      expansion: fmtTpl(meta.expansion[L], rootPc),
      tip: fmtTpl(meta.tip[L], rootPc),
      soloScales: []
    };
  }

  function getChordTheory(rootPc, chordTypeVal, voicing, lang) {
    const L = UI_STRINGS[lang] ? lang : "en";
    const meta = CHORD_META[chordTypeVal] || CHORD_META.major;
    const chordNotes = meta.semis.map(semi => ({
      semi,
      pc: mod12(rootPc + semi),
      name: noteName(rootPc + semi),
      deg: DEGREE_LABELS[semi] || String(semi)
    }));

    const chordName = `${noteName(rootPc)}${meta.labelSuffix}`;
    const backingChords = meta.chordsSpec.map(([off, suf]) => noteName(rootPc + off) + suf);
    const progression = meta.progSpec.map(([off, suf]) => noteName(rootPc + off) + suf).join(" – ");
    const soloScales = meta.soloScales[L].map(s => fmtTpl(s, rootPc));

    let tipTxt = fmtTpl(meta.tip[L], rootPc);
    if (voicing && voicing.name) {
      const vLabel = L === "ko"
        ? ` [${voicing.name} 보이싱 폼]`
        : (L === "ja" ? ` [${voicing.name} フォーム]` : ` [${voicing.name}]`);
      tipTxt += vLabel;
    }

    return {
      mode: "chord",
      rootPc,
      chordTypeVal,
      chordName,
      semis: meta.semis,
      extraBlueSemi: null,
      characterSemis: meta.characterSemis || [],
      notes: chordNotes,
      formulaStr: chordNotes.map(n => n.deg).join("-"),
      stepStr: chordNotes.map(n => n.name).join(" · "),
      relativeBadge: `${UI_STRINGS[L].lblSoloScales}: ${soloScales[0]}`,
      backingChords,
      progression,
      soloScales,
      summary: fmtTpl(meta.summary[L], rootPc),
      expansion: fmtTpl(meta.expansion[L], rootPc),
      tip: tipTxt
    };
  }

  function analyzeNoteInContext(opts) {
    const lang = UI_STRINGS[opts.lang] ? opts.lang : "en";
    const ui = UI_STRINGS[lang];
    const theory = opts.theory;
    const rootPc = opts.rootPc;
    const notePc = mod12(opts.notePc);
    const semi = mod12(notePc - rootPc);
    const deg = DEGREE_LABELS[semi] || String(semi);
    const noteStr = noteName(notePc);
    const octave = (typeof opts.midi === "number" && Number.isFinite(opts.midi))
      ? (Math.floor(opts.midi / 12) - 1)
      : "";
    const displayNote = octave !== "" ? `${noteStr}${octave}` : noteStr;
    const intervalTitle = (INTERVAL_NAMES[lang] && INTERVAL_NAMES[lang][semi]) || deg;
    const inContext = theory.semis.includes(semi);

    let role = ui.roleTension;
    let stabilityPct = 55;
    let descKey = "descInScale";

    if (semi === 0) {
      role = ui.roleRoot;
      stabilityPct = 98;
      descKey = "descRoot";
    } else if (semi === 7 && inContext) {
      role = ui.roleFifth;
      stabilityPct = 90;
      descKey = "descFifth";
    } else if (!inContext) {
      role = ui.roleOutside;
      stabilityPct = 22;
      descKey = "descOutside";
    } else if (theory.mode === "chord") {
      role = (semi === 10 || semi === 11) ? ui.roleGuide7 : ui.roleColor;
      stabilityPct = (semi === 3 || semi === 4) ? 86 : 78;
      descKey = "descChordTone";
    } else if (semi === 6 && opts.scaleId === "blues") {
      role = ui.roleBlue;
      stabilityPct = 38;
      descKey = "descBlue";
    } else if (semi === 9 && opts.scaleId === "dorian") {
      role = ui.roleModal;
      stabilityPct = 72;
      descKey = "descDorian6";
    } else if (semi === 1 && opts.scaleId === "phrygian") {
      role = ui.roleModal;
      stabilityPct = 44;
      descKey = "descPhrygian2";
    } else if (semi === 6 && opts.scaleId === "lydian") {
      role = ui.roleModal;
      stabilityPct = 70;
      descKey = "descLydian4";
    } else if (semi === 11 && opts.scaleId === "harmonic_minor") {
      role = ui.roleModal;
      stabilityPct = 48;
      descKey = "descHarmonic7";
    } else if (semi === 3) {
      role = ui.roleColor;
      stabilityPct = 80;
      descKey = "descThirdMinor";
    } else if (semi === 4) {
      role = ui.roleColor;
      stabilityPct = 84;
      descKey = "descThirdMajor";
    } else if (semi === 10) {
      role = ui.roleGuide7;
      stabilityPct = 74;
      descKey = "descSeventhDom";
    } else if (semi === 11) {
      role = ui.roleGuide7;
      stabilityPct = 68;
      descKey = "descSeventhMaj";
    } else {
      role = ui.roleTension;
      stabilityPct = 58;
      descKey = "descInScale";
    }

    // Find nearest scale/chord note for outside tone resolution suggestion
    let nearestSemi = 0;
    let bestDist = 99;
    theory.semis.forEach(sVal => {
      const d = Math.min(Math.abs(sVal - semi), 12 - Math.abs(sVal - semi));
      if (d > 0 && d < bestDist) {
        bestDist = d;
        nearestSemi = sVal;
      }
    });
    const nearestLabel = `${noteName(rootPc + nearestSemi)}(${DEGREE_LABELS[nearestSemi]})`;

    let explanation = fmtTpl(ui[descKey] || ui.descInScale, rootPc)
      .replace(/\{deg\}/g, deg)
      .replace(/\{note\}/g, noteStr)
      .replace(/\{near\}/g, nearestLabel)
      .replace(/\{chordName\}/g, theory.chordName || (noteName(rootPc) + " Chord"));

    // Build recommended next target notes (always distinct from current semi)
    const nextMoves = [];
    if (semi !== 0) {
      nextMoves.push({ pc: rootPc, deg: "1", note: noteName(rootPc), label: `→ ${noteName(rootPc)}(1) ${ui.resolveCenter}`, cls: "root" });
    }
    if (semi !== 7 && theory.semis.includes(7)) {
      const p5 = mod12(rootPc + 7);
      nextMoves.push({ pc: p5, deg: "5", note: noteName(p5), label: `→ ${noteName(p5)}(5) ${ui.resolveFifth}`, cls: "tone" });
    }
    const thirdSemi = theory.semis.includes(3) ? 3 : (theory.semis.includes(4) ? 4 : null);
    if (thirdSemi !== null && semi !== thirdSemi && nextMoves.length < 2) {
      const p3 = mod12(rootPc + thirdSemi);
      nextMoves.push({ pc: p3, deg: DEGREE_LABELS[thirdSemi], note: noteName(p3), label: `→ ${noteName(p3)}(${DEGREE_LABELS[thirdSemi]}) ${ui.resolveThird}`, cls: "tone" });
    }
    if (!inContext) {
      const pNear = mod12(rootPc + nearestSemi);
      nextMoves.unshift({ pc: pNear, deg: DEGREE_LABELS[nearestSemi], note: noteName(pNear), label: `→ ${nearestLabel} ${ui.resolveNearest}`, cls: "tone" });
    }

    // Location badge (e.g. "3G 5F · ①")
    let locLabel = "";
    if (typeof opts.s === "number" && typeof opts.fret === "number") {
      const strs = opts.strings || [64, 59, 55, 50, 45, 40];
      const strNum = opts.s + 1;
      const openName = strs[opts.s] !== undefined ? noteName(strs[opts.s]) : "";
      const posPart = opts.fret === 0
        ? `${strNum}${openName} · ${ui.openStrShort}`
        : `${strNum}${openName} ${opts.fret}F`;
      const fPart = (opts.finger >= 1 && opts.finger <= 4)
        ? ` · ${["①", "②", "③", "④"][opts.finger - 1]}`
        : "";
      locLabel = posPart + fPart;
    }

    const stabilityLabel = stabilityPct >= 75 ? ui.lblHigh : (stabilityPct >= 52 ? ui.lblMid : ui.lblTension);

    return {
      notePc,
      semi,
      deg,
      displayNote,
      noteStr,
      intervalTitle,
      inContext,
      role,
      stabilityPct,
      stabilityLabel,
      explanation,
      nextMoves: nextMoves.slice(0, 2),
      locLabel
    };
  }

  function buildMiniPianoSvg(theory, activeSemi, onKeyClick) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 280 56");
    svg.setAttribute("class", "theory-piano-svg");
    svg.setAttribute("role", "img");

    const keys = [];
    for (let s = 0; s <= 12; s++) {
      const absPc = mod12(theory.rootPc + s);
      const isBlack = [1, 3, 6, 8, 10].includes(absPc);
      const semi = mod12(s);
      const inSet = theory.semis.includes(semi);
      const isBlueExtra = !inSet && theory.extraBlueSemi === semi;
      let role = "off";
      if (semi === mod12(activeSemi) && activeSemi !== null && activeSemi !== undefined) role = "active";
      else if (semi === 0) role = "root";
      else if (inSet) role = "tone";
      else if (isBlueExtra) role = "blue";

      keys.push({
        semi,
        absPc,
        name: noteName(absPc),
        deg: (inSet || isBlueExtra || role === "active") ? (DEGREE_LABELS[semi] || "") : "",
        black: isBlack,
        role
      });
    }

    const whiteCount = keys.filter(k => !k.black).length;
    const kw = 280 / Math.max(1, whiteCount);
    const whiteXBefore = [];
    let curW = 0;

    // 1. Render White Keys
    keys.forEach((k) => {
      whiteXBefore.push(curW);
      if (k.black) return;

      const x = curW * kw;
      let fill = "#1e2433";
      let stroke = "#0f172a";
      let sw = "1";
      if (k.role === "active") {
        fill = "#facc15"; stroke = "#ffffff"; sw = "1.8";
      } else if (k.role === "root") {
        fill = "#ef4444";
      } else if (k.role === "tone") {
        fill = "#38bdf8";
      } else if (k.role === "blue") {
        fill = "#4c1d95"; stroke = "#a855f7"; sw = "1.2";
      }

      const g = document.createElementNS(ns, "g");
      g.style.cursor = "pointer";
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", (x + 1).toFixed(1));
      rect.setAttribute("y", "2");
      rect.setAttribute("width", (kw - 2).toFixed(1));
      rect.setAttribute("height", "52");
      rect.setAttribute("rx", "4");
      rect.setAttribute("fill", fill);
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", sw);
      if (k.role === "off") rect.setAttribute("opacity", "0.52");
      g.appendChild(rect);

      const tNote = document.createElementNS(ns, "text");
      tNote.setAttribute("x", (x + kw / 2).toFixed(1));
      tNote.setAttribute("y", "40.5");
      tNote.setAttribute("text-anchor", "middle");
      tNote.setAttribute("font-size", k.name.length > 1 ? "8.2" : "9.2");
      tNote.setAttribute("font-weight", "800");
      tNote.setAttribute("fill", k.role === "off" ? "#64748b" : (k.role === "root" ? "#ffffff" : "#090c10"));
      tNote.textContent = k.name;
      g.appendChild(tNote);

      if (k.deg) {
        const tDeg = document.createElementNS(ns, "text");
        tDeg.setAttribute("x", (x + kw / 2).toFixed(1));
        tDeg.setAttribute("y", "50.5");
        tDeg.setAttribute("text-anchor", "middle");
        tDeg.setAttribute("font-size", "7.5");
        tDeg.setAttribute("font-weight", "700");
        tDeg.setAttribute("fill", k.role === "root" ? "#fee2e2" : "#0f172a");
        tDeg.textContent = k.deg;
        g.appendChild(tDeg);
      }

      if (typeof onKeyClick === "function") {
        g.addEventListener("click", () => onKeyClick(k.absPc));
      }
      svg.appendChild(g);
      curW++;
    });

    // 2. Render Black Keys Overlay
    keys.forEach((k, idx) => {
      if (!k.black) return;
      const wIdx = whiteXBefore[idx];
      const bw = Math.min(22, kw * 0.62);
      const x = wIdx * kw - bw * 0.5;
      let fill = "#090b10";
      let stroke = "#334155";
      let sw = "1";
      let dash = "";
      if (k.role === "active") {
        fill = "#facc15"; stroke = "#ffffff"; sw = "1.6";
      } else if (k.role === "root") {
        fill = "#ef4444"; stroke = "#fecaca";
      } else if (k.role === "tone") {
        fill = "#0284c7"; stroke = "#7dd3fc"; sw = "1.2";
      } else if (k.role === "blue") {
        fill = "#1e1b4b"; stroke = "#a855f7"; sw = "1.3"; dash = "2 1.5";
      }

      const g = document.createElementNS(ns, "g");
      g.style.cursor = "pointer";
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x.toFixed(1));
      rect.setAttribute("y", "2");
      rect.setAttribute("width", bw.toFixed(1));
      rect.setAttribute("height", "30");
      rect.setAttribute("rx", "3");
      rect.setAttribute("fill", fill);
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", sw);
      if (dash) rect.setAttribute("stroke-dasharray", dash);
      g.appendChild(rect);

      if (k.deg && k.role !== "off") {
        const tb = document.createElementNS(ns, "text");
        tb.setAttribute("x", (x + bw / 2).toFixed(1));
        tb.setAttribute("y", "24.5");
        tb.setAttribute("text-anchor", "middle");
        tb.setAttribute("font-size", "7.2");
        tb.setAttribute("font-weight", "800");
        tb.setAttribute("fill", k.role === "active" ? "#090c10" : (k.role === "blue" ? "#e9d5ff" : "#f8fafc"));
        tb.textContent = k.deg;
        g.appendChild(tb);
      }

      if (typeof onKeyClick === "function") {
        g.addEventListener("click", () => onKeyClick(k.absPc));
      }
      svg.appendChild(g);
    });

    return svg;
  }

  global.MusicTheoryCoach = {
    UI_STRINGS,
    noteName,
    getScaleTheory,
    getChordTheory,
    analyzeNoteInContext,
    buildMiniPianoSvg
  };
})(window);
