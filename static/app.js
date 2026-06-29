const form = document.getElementById("transcribe-form");
const audioInput = document.getElementById("audio-input");
const fileDrop = document.getElementById("file-drop");
const fileName = document.getElementById("file-name");
const submitBtn = document.getElementById("submit-btn");
const resultSection = document.getElementById("result-section");
const statusSection = document.getElementById("status-section");
const errorSection = document.getElementById("error-section");
const minutesOutput = document.getElementById("minutes-output");
const statusText = document.getElementById("status-text");
const errorText = document.getElementById("error-text");
const copyBtn = document.getElementById("copy-btn");
const wordDownloadBtn = document.getElementById("word-download-btn");
const downloadBtn = document.getElementById("download-btn");
const sourceTabs = document.querySelectorAll(".source-tab");
const uploadPanel = document.getElementById("upload-panel");
const recordNowPanel = document.getElementById("record-now-panel");
const recordModeTabs = document.querySelectorAll(".record-mode-tab");
const inPersonPanel = document.getElementById("in-person-panel");
const onlinePanel = document.getElementById("online-panel");
const tabIncludeMic = document.getElementById("tab-include-mic");
const tabMicSelectWrap = document.getElementById("tab-mic-select-wrap");
const tabMicSelect = document.getElementById("tab-mic-select");
const tabConnectBtn = document.getElementById("tab-connect-btn");
const tabConnectionStatus = document.getElementById("tab-connection-status");
const micSelect = document.getElementById("mic-select");
const recordStartBtn = document.getElementById("record-start-btn");
const recordStopBtn = document.getElementById("record-stop-btn");
const workflowBar = document.getElementById("workflow-bar");
const recordTimer = document.getElementById("record-timer");
const recordStatus = document.getElementById("record-status");
const recordPreview = document.getElementById("record-preview");
const recordPreviewSlot = document.getElementById("record-preview-slot");
const useOllamaCheckbox = document.getElementById("use-ollama");
const minutesTemplateSelect = document.getElementById("minutes-template");
const templateHintEl = document.getElementById("template-hint");
const ollamaStatusEl = document.getElementById("ollama-status");
const sampleBtn = document.getElementById("sample-btn");

const TEMPLATE_HINTS = {
  standard: "概要・議事内容・決定事項・アクション・次回予定",
  standup: "進捗・報告、今後の予定・課題、決定事項、次回予定",
  simple: "概要と内容のみ。短くまとめたいとき向け",
  report: "報告内容と質疑・コメント、決定事項、次回予定",
};

function getSelectedTemplate() {
  return minutesTemplateSelect?.value || "standard";
}

function updateTemplateHint() {
  if (!templateHintEl) return;
  const template = getSelectedTemplate();
  templateHintEl.textContent = TEMPLATE_HINTS[template] || TEMPLATE_HINTS.standard;
}

let latestMinutes = "";
let audioSource = "record";
let recordMode = "in_person";
let recordedBlob = null;
let mediaRecorder = null;
let activeStreams = [];
let recordingStream = null;
let mixAudioContext = null;
let tabDisplayStream = null;
let tabRecordingStream = null;
let recordChunks = [];
let recordStartedAt = null;
let recordTimerInterval = null;
let isRecordingSession = false;

function setVisible(element, visible) {
  element.classList.toggle("hidden", !visible);
}

function showError(message) {
  errorText.textContent = message;
  setVisible(errorSection, true);
  setVisible(statusSection, false);
  updateSubmitState();
}

function hasAudioReady() {
  if (audioSource === "upload") {
    return Boolean(audioInput.files?.[0]);
  }
  return Boolean(recordedBlob);
}

function updateSubmitState() {
  submitBtn.disabled = !hasAudioReady() || isRecordingActive();
  updateWorkflowStep();
}

function updateWorkflowStep() {
  if (!workflowBar) return;

  workflowBar.classList.remove("step-record", "step-stop", "step-create");

  if (audioSource === "upload") {
    if (hasAudioReady()) {
      workflowBar.classList.add("step-create");
    }
    return;
  }

  if (isRecordingSession) {
    workflowBar.classList.add("step-stop");
    return;
  }

  if (hasAudioReady()) {
    workflowBar.classList.add("step-create");
    return;
  }

  workflowBar.classList.add("step-record");
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function clearRecordedAudio() {
  recordedBlob = null;
  recordPreview.removeAttribute("src");
  recordPreview.load();
  if (recordPreviewSlot) {
    recordPreviewSlot.classList.remove("has-preview");
    recordPreviewSlot.setAttribute("aria-hidden", "true");
  }
  updateRecordStartState();
  updateSubmitState();
}

function clearUploadedFile() {
  audioInput.value = "";
  fileName.textContent = "";
  updateSubmitState();
}

function updateRecordControls() {
  if (audioSource !== "record") return;

  const onlineWaitingTab = recordMode === "online" && !tabRecordingStream;
  recordStartBtn.disabled = isRecordingSession || onlineWaitingTab;
}

function stopAllStreams() {
  activeStreams.forEach((stream) => {
    stream.getTracks().forEach((track) => track.stop());
  });
  activeStreams = [];
  recordingStream = null;
  tabDisplayStream = null;
  tabRecordingStream = null;

  if (mixAudioContext) {
    mixAudioContext.close().catch(() => {});
    mixAudioContext = null;
  }
}

function resetTabConnection() {
  stopAllStreams();
  if (tabConnectionStatus) {
    tabConnectionStatus.textContent = "会議タブ: 未接続";
  }
  if (tabConnectBtn) {
    tabConnectBtn.textContent = "会議タブを接続";
    tabConnectBtn.disabled = false;
  }
  if (tabIncludeMic) {
    tabIncludeMic.disabled = false;
  }
  if (tabMicSelect) {
    tabMicSelect.disabled = false;
  }
  updateTabMicSelectVisibility();
  updateRecordControls();
}

function updateTabMicSelectVisibility() {
  if (!tabMicSelectWrap || !tabIncludeMic) return;
  setVisible(tabMicSelectWrap, tabIncludeMic.checked);
}

function createMixedAudioStream(audioStreams) {
  mixAudioContext = new AudioContext();
  const destination = mixAudioContext.createMediaStreamDestination();

  audioStreams.forEach((stream) => {
    if (!stream?.getAudioTracks().length) return;
    const source = mixAudioContext.createMediaStreamSource(stream);
    source.connect(destination);
  });

  return destination.stream;
}

function isRecordingActive() {
  return isRecordingSession;
}

function setRecordingControlsState(recording) {
  isRecordingSession = recording;
  recordStartBtn.disabled = recording;
  recordStopBtn.disabled = !recording;
  micSelect.disabled = recording;
  recordModeTabs.forEach((tab) => {
    tab.disabled = recording;
  });
  if (tabConnectBtn) {
    tabConnectBtn.disabled = recording;
  }
  if (tabIncludeMic) {
    tabIncludeMic.disabled = recording || Boolean(tabRecordingStream);
  }
  if (tabMicSelect) {
    tabMicSelect.disabled = recording || Boolean(tabRecordingStream);
  }
  if (workflowBar) {
    workflowBar.classList.toggle("is-recording", recording);
  }
  updateRecordControls();
  updateSubmitState();
}

function getPreferredMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForMimeType(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

async function loadMicrophones(selectElement) {
  if (!navigator.mediaDevices?.enumerateDevices) return;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === "audioinput");
  const previousValue = selectElement.value;

  selectElement.innerHTML = "";
  if (inputs.length === 0) {
    selectElement.innerHTML = '<option value="">マイクが見つかりません</option>';
    return;
  }

  inputs.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `マイク ${index + 1}`;
    selectElement.appendChild(option);
  });

  if (previousValue && [...selectElement.options].some((option) => option.value === previousValue)) {
    selectElement.value = previousValue;
  }
}

function trackStream(stream) {
  activeStreams.push(stream);
  return stream;
}

function updateRecordStartState() {
  if (audioSource !== "record") return;

  if (!isRecordingSession && !recordedBlob) {
    if (recordMode === "online") {
      recordStatus.textContent = tabRecordingStream
        ? "会議タブを接続済みです。録音開始を押してください。"
        : "先に会議タブを接続してください。";
      return;
    }
    recordStatus.textContent = "録音開始を押してください";
  }
}

function setRecordMode(mode) {
  if (mode === recordMode) return;

  recordMode = mode;
  recordModeTabs.forEach((tab) => {
    const active = tab.dataset.recordMode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  setVisible(inPersonPanel, mode === "in_person");
  setVisible(onlinePanel, mode === "online");

  if (mode === "in_person") {
    resetTabConnection();
    loadMicrophones(micSelect);
  }

  if (mode === "online") {
    updateTabMicSelectVisibility();
    loadMicrophones(tabMicSelect);
  }

  updateRecordStartState();
  updateRecordControls();
}

function setAudioSource(source) {
  if (source === "upload") {
    if (isRecordingSession) {
      stopRecording();
    }
    resetTabConnection();
  }

  audioSource = source;
  sourceTabs.forEach((tab) => {
    const active = tab.dataset.source === source;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  setVisible(uploadPanel, source === "upload");
  setVisible(recordNowPanel, source === "record");

  if (workflowBar) {
    workflowBar.classList.toggle("is-upload-mode", source === "upload");
  }

  if (source === "record") {
    if (recordMode === "in_person") {
      loadMicrophones(micSelect);
    } else {
      loadMicrophones(tabMicSelect);
    }
    updateRecordStartState();
    updateRecordControls();
  }

  updateSubmitState();
}

recordModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (isRecordingActive()) {
      showError("録音中は録音の種類を切り替えられません。先に録音を停止してください。");
      return;
    }
    clearRecordedAudio();
    setRecordMode(tab.dataset.recordMode);
  });
});

tabIncludeMic?.addEventListener("change", () => {
  updateTabMicSelectVisibility();
});

sourceTabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    if (isRecordingActive()) {
      showError("録音中は入力方法を切り替えられません。先に録音を停止してください。");
      return;
    }
    clearRecordedAudio();
    setAudioSource(tab.dataset.source);
  });
});

audioInput.addEventListener("change", () => {
  const file = audioInput.files[0];
  fileName.textContent = file?.name ?? "";
  if (file) {
    clearRecordedAudio();
  }
  updateSubmitState();
});

["dragenter", "dragover"].forEach((eventName) => {
  fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.remove("dragover");
  });
});

fileDrop.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  audioInput.files = dataTransfer.files;
  fileName.textContent = file.name;
  clearRecordedAudio();
  updateSubmitState();
});

async function getMicrophoneStream(deviceSelect) {
  const constraints = {
    audio: deviceSelect.value ? { deviceId: { exact: deviceSelect.value } } : true,
  };
  return trackStream(await navigator.mediaDevices.getUserMedia(constraints));
}

function finishRecordingUi() {
  clearInterval(recordTimerInterval);
  recordTimerInterval = null;
  setRecordingControlsState(false);
  updateRecordStartState();
}

function finalizeRecordingBlob() {
  const type = mediaRecorder?.mimeType || "audio/webm";
  recordedBlob = new Blob(recordChunks, { type });

  if (recordedBlob.size === 0) {
    showError("録音データが取得できませんでした。もう一度お試しください。");
    clearRecordedAudio();
  } else {
    const url = URL.createObjectURL(recordedBlob);
    recordPreview.src = url;
    if (recordPreviewSlot) {
      recordPreviewSlot.classList.add("has-preview");
      recordPreviewSlot.setAttribute("aria-hidden", "false");
    }
    recordStatus.textContent = "録音が終わりました。「議事録を作成」を押してください";
  }

  stopAllStreams();
  syncTabConnectionUi();
  finishRecordingUi();
}

function syncTabConnectionUi() {
  if (tabRecordingStream) return;

  if (tabConnectionStatus) {
    tabConnectionStatus.textContent = "会議タブ: 未接続";
  }
  if (tabConnectBtn) {
    tabConnectBtn.textContent = "会議タブを接続";
    tabConnectBtn.disabled = false;
  }
  if (tabIncludeMic) {
    tabIncludeMic.disabled = false;
  }
  if (tabMicSelect) {
    tabMicSelect.disabled = false;
  }
  updateTabMicSelectVisibility();
  updateRecordControls();
}

function stopRecording() {
  if (!isRecordingSession) return;

  recordStopBtn.disabled = true;

  if (!mediaRecorder) {
    stopAllStreams();
    syncTabConnectionUi();
    finishRecordingUi();
    return;
  }

  const state = mediaRecorder.state;
  if (state === "inactive") {
    finalizeRecordingBlob();
    return;
  }

  try {
    if (typeof mediaRecorder.requestData === "function") {
      mediaRecorder.requestData();
    }
  } catch (_) {
    // requestData is optional across browsers
  }

  try {
    mediaRecorder.stop();
  } catch (error) {
    stopAllStreams();
    finishRecordingUi();
    showError(`録音を停止できませんでした: ${error.message}`);
  }
}

function createMediaRecorder(recordingStream) {
  const mimeType = getPreferredMimeType();
  const options = { audioBitsPerSecond: 128000 };
  if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
    options.mimeType = mimeType;
  }
  return new MediaRecorder(recordingStream, options);
}

function startMediaRecorder(stream) {
  recordingStream = stream;
  recordChunks = [];
  mediaRecorder = createMediaRecorder(stream);

  stream.getAudioTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      if (isRecordingSession) {
        recordStatus.textContent =
          recordMode === "online" ? "会議タブの共有が終了しました。" : "マイクの接続が切れました。";
        stopRecording();
      }
    });
  });

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      recordChunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener("stop", () => {
    finalizeRecordingBlob();
  });

  mediaRecorder.addEventListener("error", () => {
    showError("録音中にエラーが発生しました。");
    stopAllStreams();
    finishRecordingUi();
  });

  setRecordingControlsState(true);
  recordStartedAt = Date.now();
  recordTimer.textContent = "00:00";
  recordStatus.textContent = "録音中";

  try {
    mediaRecorder.start(250);
  } catch (error) {
    setRecordingControlsState(false);
    stopAllStreams();
    throw error;
  }

  recordTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - recordStartedAt) / 1000;
    recordTimer.textContent = formatClock(elapsed);
  }, 250);
}

recordStartBtn.addEventListener("click", async () => {
  if (isRecordingSession) return;

  setVisible(errorSection, false);
  clearRecordedAudio();
  clearUploadedFile();

  try {
    if (recordMode === "online") {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        showError("このブラウザはオンライン会議の録音に対応していません。Chrome または Edge をお試しください。");
        return;
      }
      if (!tabRecordingStream) {
        showError("先に会議タブを接続してください。");
        return;
      }
      startMediaRecorder(tabRecordingStream);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showError("このブラウザはマイク録音に対応していません。");
      return;
    }

    stopAllStreams();
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch (_) {
      // loadMicrophones may still work with empty labels
    }
    await loadMicrophones(micSelect);
    const micStream = await getMicrophoneStream(micSelect);
    startMediaRecorder(micStream);
  } catch (error) {
    setRecordingControlsState(false);
    stopAllStreams();
    showError(`録音を開始できませんでした: ${error.message}`);
  }
});

async function connectTabAudio() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showError("このブラウザはオンライン会議の録音に対応していません。Chrome または Edge をお試しください。");
    return;
  }

  if (isRecordingActive()) {
    showError("録音中は会議タブを再接続できません。");
    return;
  }

  setVisible(errorSection, false);
  clearRecordedAudio();
  clearUploadedFile();
  resetTabConnection();

  try {
    const displayStream = trackStream(
      await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
    );
    tabDisplayStream = displayStream;
    displayStream.getVideoTracks().forEach((track) => track.stop());

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error(
        "会議タブの音声が取得できませんでした。共有画面で会議タブを選び、「タブの音声も共有」にチェックを入れてください。"
      );
    }

    audioTracks.forEach((track) => {
      track.addEventListener("ended", () => {
        if (isRecordingSession) {
          stopRecording();
        }
        resetTabConnection();
        recordStatus.textContent = "会議タブの共有が終了しました。";
      });
    });

    const tabAudioStream = trackStream(new MediaStream(audioTracks));
    const streamsToMix = [tabAudioStream];

    if (tabIncludeMic?.checked) {
      streamsToMix.push(await getMicrophoneStream(tabMicSelect));
    }

    tabRecordingStream =
      streamsToMix.length > 1 ? createMixedAudioStream(streamsToMix) : tabAudioStream;

    const mixLabel = tabIncludeMic?.checked ? "（マイク込み）" : "";
    tabConnectionStatus.textContent = `会議タブ: 接続済み${mixLabel}`;
    tabConnectBtn.textContent = "会議タブを再接続";
    tabIncludeMic.disabled = true;
    tabMicSelect.disabled = true;
    recordStatus.textContent = "会議タブを接続済みです。録音開始を押してください。";
    updateRecordControls();
  } catch (error) {
    resetTabConnection();
    updateRecordStartState();
    if (error.name !== "NotAllowedError") {
      showError(error.message);
    }
  }
}

tabConnectBtn?.addEventListener("click", connectTabAudio);

recordStopBtn.addEventListener("click", () => {
  stopRecording();
});

function getAudioFileForSubmit() {
  if (audioSource === "upload") {
    return audioInput.files[0] ?? null;
  }

  if (!recordedBlob) {
    return null;
  }

  const mimeType = recordedBlob.type || "audio/webm";
  const extension = extensionForMimeType(mimeType);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = recordMode === "online" ? "online-meeting" : "meeting-recording";
  return new File([recordedBlob], `${prefix}-${timestamp}.${extension}`, { type: mimeType });
}

function getMissingAudioMessage() {
  if (audioSource === "upload") {
    return "音声ファイルを選択してください。";
  }
  if (recordMode === "online") {
    return "先に会議タブを接続して録音してください。";
  }
  return "先に録音してください。";
}

function showMinutesResult(data) {
  latestMinutes = data.minutes;
  minutesOutput.textContent = latestMinutes;
  setVisible(resultSection, true);
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

sampleBtn?.addEventListener("click", async () => {
  if (!sampleBtn) return;
  if (isRecordingActive()) {
    showError("録音中はサンプルを表示できません。");
    return;
  }

  setVisible(errorSection, false);
  setVisible(statusSection, true);
  statusText.textContent = "サンプル出力を読み込み中…";
  sampleBtn.disabled = true;

  try {
    let response = await fetch("/api/sample");
    if (!response.ok) {
      response = await fetch("/static/sample-output.json");
    }
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "サンプルの読み込みに失敗しました。");
    }
    showMinutesResult(data);
  } catch (error) {
    showError(error.message);
  } finally {
    setVisible(statusSection, false);
    sampleBtn.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = getAudioFileForSubmit();
  if (!file) {
    showError(getMissingAudioMessage());
    return;
  }

  if (isRecordingActive()) {
    showError("録音中です。先に録音を停止してください。");
    return;
  }

  setVisible(errorSection, false);
  setVisible(resultSection, false);
  setVisible(statusSection, true);
  submitBtn.disabled = true;

  const useOllama = useOllamaCheckbox.checked;
  const transcribeFormData = new FormData();
  transcribeFormData.append("audio", file);
  transcribeFormData.append("include_timestamps", form.include_timestamps.checked ? "true" : "false");
  transcribeFormData.append("quality", "high");
  transcribeFormData.append("use_ollama", "false");
  transcribeFormData.append("template", getSelectedTemplate());

  try {
    statusText.textContent = "文字起こし中…少し時間がかかることがあります";

    const transcribeResponse = await fetch("/api/transcribe", {
      method: "POST",
      body: transcribeFormData,
    });

    const data = await transcribeResponse.json();
    if (!transcribeResponse.ok) {
      throw new Error(data.detail || "文字起こしに失敗しました。");
    }

    if (useOllama) {
      statusText.textContent = "議事録を作成中…";
      const formatFormData = new FormData();
      formatFormData.append("transcript", data.transcript);
      formatFormData.append("language", data.language);
      formatFormData.append("duration_seconds", String(data.duration_seconds));
      formatFormData.append("template", getSelectedTemplate());

      const formatResponse = await fetch("/api/format", {
        method: "POST",
        body: formatFormData,
      });
      const formatData = await formatResponse.json();
      if (!formatResponse.ok) {
        throw new Error(formatData.detail || "議事録の作成に失敗しました。");
      }

      data.minutes = formatData.minutes;
      data.formatter = formatData.formatter;
      data.ollama_error = formatData.ollama_error;
    }

    showMinutesResult(data);
  } catch (error) {
    showError(error.message);
  } finally {
    setVisible(statusSection, false);
    updateSubmitState();
  }
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(latestMinutes);
  const label = copyBtn.querySelector(".btn-label");
  if (label) {
    const original = label.textContent;
    label.textContent = "コピーしました";
    setTimeout(() => {
      label.textContent = original;
    }, 1500);
  }
});

downloadBtn.addEventListener("click", () => {
  const timestamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([latestMinutes], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `議事録-${timestamp}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
});

wordDownloadBtn.addEventListener("click", async () => {
  if (!latestMinutes.trim()) {
    showError("議事録がありません。先に議事録を作成してください。");
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  wordDownloadBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("minutes", latestMinutes);

    const response = await fetch("/api/export/docx", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Word ファイルの作成に失敗しました。");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `議事録-${timestamp}.docx`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showError(error.message);
  } finally {
    wordDownloadBtn.disabled = false;
  }
});

async function loadOllamaStatus() {
  if (!ollamaStatusEl) return;

  try {
    const response = await fetch("/api/ollama/status");
    const data = await response.json();
    ollamaStatusEl.classList.remove("ready", "warn", "error");

    if (!data.available) {
      ollamaStatusEl.textContent = "";
      ollamaStatusEl.hidden = true;
      ollamaStatusEl.classList.add("hidden");
      return;
    }

    ollamaStatusEl.hidden = false;
    ollamaStatusEl.classList.remove("hidden");

    if (data.model_ready) {
      ollamaStatusEl.textContent = "議事録を整える機能が使えます";
      ollamaStatusEl.classList.add("ready");
      return;
    }

    ollamaStatusEl.textContent = "議事録を整える機能は、今は使えません（文字起こしのみ作成されます）";
    ollamaStatusEl.classList.add("warn");
  } catch (error) {
    ollamaStatusEl.hidden = false;
    ollamaStatusEl.classList.remove("hidden");
    ollamaStatusEl.textContent = "議事録を整える機能の状態を確認できませんでした";
    ollamaStatusEl.classList.add("error");
  }
}

loadMicrophones(micSelect);
updateTabMicSelectVisibility();
setRecordingControlsState(false);
updateRecordStartState();
updateWorkflowStep();
updateRecordControls();
loadOllamaStatus();
updateTemplateHint();
minutesTemplateSelect?.addEventListener("change", updateTemplateHint);

window.addEventListener("beforeunload", () => {
  if (isRecordingSession) {
    stopRecording();
  } else {
    stopAllStreams();
  }
});
