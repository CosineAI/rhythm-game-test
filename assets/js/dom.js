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

  // New top-level controls
  const newSongBtn = $('#newSongBtn');
  const pausePlayBtn = $('#pausePlayBtn'); // legacy combined control (unused in current UI)
  const pauseBtn = $('#pauseBtn');
  const playBtn = $('#playBtn');
  const restartBtn = $('#restartBtn');

  const gridlinesContainer = $('#gridlines');
  const hitLine = $('#hitLine');

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
  const settingsSave = $('#settingsSave');
  const settingsCancel = $('#settingsCancel');
  const presetPiano = $('#presetPiano');
  const presetRow = $('#presetRow');
  const presetSplit = $('#presetSplit');

  // Setup modal elements
  const setupModal = $('#setupModal');
  const setupFile = $('#setupFile');
  const setupDifficulty = $('#setupDifficulty');
  const setupGenMethod = $('#setupGenMethod');
  const setupGenerate = $('#setupGenerate');
  const setupStart = $('#setupStart');
  const setupOpenSettings = $('#setupOpenSettings');
  const setupSongName = $('#setupSongName');

  // Results modal elements
  const resultsModal = $('#resultsModal');
  const resultsReplay = $('#resultsReplay');
  const resultsNewSong = $('#resultsNewSong');
  const resultPerfect = $('#resultPerfect');
  const resultGood = $('#resultGood');
  const resultOkay = $('#resultOkay');
  const resultBad = $('#resultBad');
  const resultMaxCombo = $('#resultMaxCombo');
  const resultTotalScore = $('#resultTotalScore');

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
    hitLine,
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
    settingsSave,
    settingsCancel,
    presetPiano,
    presetRow,
    presetSplit,
    resultsModal,
    resultsReplay,
    resultsNewSong,
    resultPerfect,
    resultGood,
    resultOkay,
    resultBad,
    resultMaxCombo,
    resultTotalScore,
    setupModal,
    setupFile,
    setupDifficulty,
    setupGenerate,
    setupStart,
    newSongBtn,
    pausePlayBtn,
    pauseBtn,
    playBtn,
    restartBtn,
    setupOpenSettings,
    setupSongName
  };
})();