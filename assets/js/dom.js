(() => {
  const $ = (sel) => document.querySelector(sel);

  const playfield = $('#playfield');
  const judgementEl = $('#judgement');
  const statusEl = $('#status');
  const lanesContainer = $('#lanes');
  const keycapsContainer = $('#keycaps');
  const lanes = Array.from(document.querySelectorAll('.lane'));

  const { KEY_ORDER } = window.RG.Const;
  const keycapNodes = new Map(KEY_ORDER.map(k => [k, document.querySelector(`.keycap[data-key="${k}"]`)]));

  const fileInput = $('#audioFile');
  const audioEl = $('#audioPlayer');
  const analyzeBtn = $('#analyzeBtn');
  const playChartBtn = $('#playChartBtn');
  const difficultySelect = $('#difficultySelect');

  const comboEl = $('#combo');
  const comboValueEl = comboEl ? comboEl.querySelector('.value') : null;
  const comboToastEl = $('#comboToast');

  window.RG.Dom = {
    playfield,
    judgementEl,
    statusEl,
    lanesContainer,
    keycapsContainer,
    lanes,
    keycapNodes,
    fileInput,
    audioEl,
    analyzeBtn,
    playChartBtn,
    difficultySelect,
    comboEl,
    comboValueEl,
    comboToastEl
  };
})();