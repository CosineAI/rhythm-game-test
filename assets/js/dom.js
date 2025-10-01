(() => {
  const $ = (sel) => document.querySelector(sel);

  const playfield = $('#playfield');
  const judgementEl = $('#judgement');
  const statusEl = $('#status');
  const lanesContainer = $('#lanes');
  const keycapsContainer = $('#keycaps');
  const lanes = Array.from(document.querySelectorAll('.lane'));
  const keycapByLane = Array.from(document.querySelectorAll('#keycaps .keycap'));

  const { KEY_ORDER } = window.RG.Const;
  const keycapNodes = new Map(KEY_ORDER.map(k => [k, document.querySelector(`.keycap[data-key="${k}"]`)]));

  const fileInput = $('#audioFile');
  const audioEl = $('#audioPlayer');
  const analyzeBtn = $('#analyzeBtn');
  const playChartBtn = $('#playChartBtn');
  const difficultySelect = $('#difficultySelect');

  const gridlinesContainer = $('#gridlines');

  const comboEl = $('#combo');
  const comboValueEl = comboEl ? comboEl.querySelector('.value') : null;
  const comboToastEl = $('#comboToast');

  const scoreboardEl = $('#scoreboard');
  const scoreValueEl = $('#scoreValue');

  // Settings modal elements
  const openSettingsBtn = $('#openSettingsBtn');
  const fullscreenBtn = $('#fullscreenBtn');
  const settingsModal = $('#settingsModal');
  const settingsDifficulty = $('#settingsDifficulty');
  const inputLagRange = $('#inputLag');
  const inputLagNumber = $('#inputLagNumber');
  const chartPadRange = $('#chartPad');
  const chartPadNumber = $('#chartPadNumber');
  const keyBind0 = $('#keyBind0');
  const keyBind1 = $('#keyBind1');
  const keyBind2 = $('#keyBind2');
  const keyBind3 = $('#keyBind3');
  const keyBind4 = $('#keyBind4');
  const fallSpeedRange = $('#fallSpeed');
  const fallSpeedNumber = $('#fallSpeedNumber');
  const showGridlines = $('#showGridlines');
  const perspectiveMode = $('#perspectiveMode');
  const settingsSave = $('#settingsSave');
  const settingsCancel = $('#settingsCancel');

  window.RG.Dom = {
    playfield,
    judgementEl,
    statusEl,
    lanesContainer,
    keycapsContainer,
    lanes,
    keycapNodes,
    keycapByLane,
    fileInput,
    audioEl,
    analyzeBtn,
    playChartBtn,
    difficultySelect,
    gridlinesContainer,
    comboEl,
    comboValueEl,
    comboToastEl,
    scoreboardEl,
    scoreValueEl,
    openSettingsBtn,
    fullscreenBtn,
    settingsModal,
    settingsDifficulty,
    inputLagRange,
    inputLagNumber,
    chartPadRange,
    chartPadNumber,
    keyBind0,
    keyBind1,
    keyBind2,
    keyBind3,
    keyBind4,
    fallSpeedRange,
    fallSpeedNumber,
    showGridlines,
    perspectiveMode,
    settingsSave,
    settingsCancel
  };
})();