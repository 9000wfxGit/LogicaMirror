import { findCheckpointForSegment, getCheckpointSource, splitSegmentByCheckpoint } from "../core/checkpoints/gating.js";
import { createStudyDocument } from "../core/documents/documentModel.js";
import { createMemoryReflection } from "../core/memory/reflection.js";
import { clearProviderConfig, loadProviderConfig, saveProviderConfig } from "../infrastructure/ai/providerConfigStore.js";
import { scanDocumentWithProvider, testProviderConnection, verifyPredictionWithProvider } from "../infrastructure/ai/scanDocumentApi.js";
import { readStudyFile } from "../infrastructure/import/readStudyFile.js";
import { appendAppLog, clearAppLogs, loadAppLogs, serializeAppLogs } from "../infrastructure/logging/appLogStore.js";
import { loadSession, saveSession } from "../infrastructure/persistence/localSessionStore.js";
import { t } from "../shared/i18n/translations.js";
import { getTutorialContent } from "../shared/tutorial/tutorialContent.js";
import { sampleDocumentText, sampleDocumentTitle } from "./sampleDocument.js";

const initialDocument = createStudyDocument({
  title: sampleDocumentTitle,
  text: sampleDocumentText,
  language: "en"
});

export function startApp(root) {
  const app = new LogicaMirrorApp(root);
  app.render();
}

class LogicaMirrorApp {
  constructor(root) {
    this.root = root;
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf";
    this.fileInput.hidden = true;
    document.body.append(this.fileInput);

    const restored = loadSession();
    const providerConfig = loadProviderConfig();
    this.state = restored || createInitialState(initialDocument);
    this.state.importMessage = "";
    this.state.settingsOpen = false;
    this.state.apiConfigDraft = providerConfig?.value || defaultApiConfigTemplate();
    this.state.apiConfigSaved = Boolean(providerConfig?.value);
    this.state.apiConfigMessage = providerConfig?.value ? "API configuration saved locally." : "";
    this.state.apiStatus = providerConfig?.value ? "untested" : "not-configured";
    this.state.apiStatusMessage = providerConfig?.value ? this.t("apiUntested") : this.t("apiNotConfigured");
    this.state.scanMessage = "";
    this.state.scanning = false;
    this.state.testingConnection = false;
    this.state.tutorialOpen = false;
    this.state.logsOpen = false;
    this.state.logs = loadAppLogs();
    this.state.logMessage = "";

    this.recordLog("info", "app", "Session started", {
      documentTitle: this.state.document.title,
      checkpointCount: this.state.document.checkpoints.length,
      apiConfigSaved: this.state.apiConfigSaved
    });

    this.fileInput.addEventListener("change", () => this.handleFileImport());
  }

  render() {
    const { document: studyDocument, language } = this.state;
    const currentCheckpoint = this.getCurrentCheckpoint();
    const currentEntry = currentCheckpoint ? this.getCheckpointEntry(currentCheckpoint.id) : null;
    const currentSegment = currentCheckpoint ? studyDocument.segments[currentCheckpoint.segmentIndex] : null;
    const currentSource = currentCheckpoint && currentSegment ? getCheckpointSource(currentSegment, currentCheckpoint) : "";
    const segmentLabel = currentCheckpoint
      ? `Segment ${String(currentCheckpoint.segmentIndex + 1).padStart(2, "0")} / ${studyDocument.segments.length}`
      : t(language, "noCheckpoints");

    this.root.innerHTML = `
      <main class="app-shell ${this.state.workspaceExpanded ? "workspace-expanded" : ""}">
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark" aria-hidden="true">LM</span>
            <span>LogicaMirror</span>
          </div>
          <button class="document-title" type="button" data-action="reset-view">
            <span>${escapeHtml(studyDocument.title)}</span>
            <span aria-hidden="true">v</span>
          </button>
          <div class="top-actions">
            <select class="language-select" data-action="language" aria-label="Language">
              ${["en", "de", "es"].map((option) => `<option value="${option}" ${option === language ? "selected" : ""}>${option.toUpperCase()}</option>`).join("")}
            </select>
            <button class="icon-button" type="button" title="${this.t("developerLogs")}" data-action="open-logs">Logs</button>
            <button class="icon-button" type="button" title="${this.t("tutorial")}" data-action="open-tutorial">Tutorial</button>
            <button class="icon-button" type="button" title="Local files" data-action="import">Folder</button>
            <button class="icon-button ${this.state.apiConfigSaved ? "configured" : ""}" type="button" title="${this.t("apiSettings")}" data-action="open-settings">Gear</button>
            <button class="profile-button" type="button" title="Profile">M</button>
          </div>
        </header>

        <section class="reader-pane">
          <div class="reader-toolbar">
            <button class="link-button" type="button" data-action="import">
              <span aria-hidden="true">Upload</span>
              <span>${t(language, "importLabel")}</span>
            </button>
            <button class="scan-button" type="button" data-action="scan-document" ${this.state.scanning ? "disabled" : ""}>
              ${this.state.scanning ? this.t("scanningDocument") : this.t("scanDocument")}
            </button>
            <button class="test-api-button" type="button" data-action="test-api" ${this.state.testingConnection || this.state.scanning ? "disabled" : ""}>
              ${this.state.testingConnection ? this.t("testingApi") : this.t("testApi")}
            </button>
            ${this.renderApiStatus()}
            <div class="segment-nav">
              <span>${segmentLabel}</span>
              <button class="icon-button" type="button" title="${t(language, "previous")}" data-action="prev">Prev</button>
              <button class="icon-button" type="button" title="${t(language, "next")}" data-action="next">Next</button>
            </div>
          </div>
          ${this.state.importMessage ? `<div class="inline-message">${escapeHtml(this.state.importMessage)}</div>` : ""}
          ${this.state.scanMessage ? `<div class="inline-message ${this.state.apiStatus === "error" ? "inline-error" : ""}">${escapeHtml(this.state.scanMessage)}</div>` : ""}
          <article class="source-document" aria-label="Study source">
            ${studyDocument.segments.map((segment) => this.renderSegment(segment)).join("")}
          </article>
        </section>

        <aside class="workspace-pane" aria-label="${t(language, "predictionWorkspace")}">
          ${currentCheckpoint ? this.renderWorkspace(currentCheckpoint, currentEntry, currentSource) : `<p>${t(language, "noCheckpoints")}</p>`}
        </aside>
        ${this.state.settingsOpen ? this.renderSettingsDialog() : ""}
        ${this.state.tutorialOpen ? this.renderTutorialDialog() : ""}
        ${this.state.logsOpen ? this.renderLogsDialog() : ""}
      </main>
    `;

    this.bindEvents();
    saveSession(createPersistedSession(this.state));
  }

  renderSegment(segment) {
    const checkpoint = findCheckpointForSegment(this.state.document.checkpoints, segment.index);
    const isActive = checkpoint && checkpoint.id === this.getCurrentCheckpoint()?.id;
    const entry = checkpoint ? this.getCheckpointEntry(checkpoint.id) : null;
    const isRevealed = Boolean(entry?.revealed);
    const parts = splitSegmentByCheckpoint(segment, checkpoint);
    const segmentClasses = ["source-segment", `segment-${segment.kind}`];

    if (isActive) {
      segmentClasses.push("active-segment");
    }

    if (segment.kind === "heading") {
      return `<h1 class="${segmentClasses.join(" ")}">${escapeHtml(segment.text.replace(/^#+\s*/, ""))}</h1>`;
    }

    if (!checkpoint) {
      return `<p class="${segmentClasses.join(" ")}">${escapeHtml(segment.text)}</p>`;
    }

    const gatedMode = parts.before.trim() ? "" : "gated-block";
    const afterMode = parts.before.trim() ? "" : "after-block";
    const sourceClass = isRevealed ? "revealed-source" : "gated-source";

    return `
      <div class="${segmentClasses.join(" ")}" data-checkpoint-id="${checkpoint.id}">
        ${isActive ? `<div class="checkpoint-rule" aria-hidden="true"><span>::</span></div>` : ""}
        <p>
          ${escapeHtml(parts.before)}
          <span class="${sourceClass} ${gatedMode}" title="${isRevealed ? this.t("sourceRevealed") : this.t("sourceHidden")}">${escapeHtml(parts.gated)}</span>
          <span class="${afterMode}">${escapeHtml(parts.after)}</span>
        </p>
      </div>
    `;
  }

  renderWorkspace(checkpoint, entry, sourceText) {
    const prediction = entry?.prediction || "";
    const committed = Boolean(entry?.committed);
    const verification = entry?.verification || null;
    const canReveal = committed || prediction.trim().length > 0;
    const note = entry?.note || "";
    const tags = entry?.tags || [];
    const memoryStatus = entry?.memory?.status || "";
    const showReasoning = Boolean(entry?.showReasoning);

    return `
      <div class="workspace-header">
        <div>
          <h2>${this.t("predictionWorkspace")}</h2>
          <p>${escapeHtml(checkpoint.kind.replace("-", " "))}</p>
        </div>
        <button class="icon-button" type="button" title="Expand" data-action="toggle-workspace">${this.state.workspaceExpanded ? "Close" : "Focus"}</button>
      </div>

      <section class="concept-focus" aria-label="${this.t("conceptToPredict")}">
        <span>${this.t("conceptToPredict")}</span>
        <strong>${escapeHtml(checkpoint.target)}</strong>
        <em>${escapeHtml(checkpoint.kind.replace("-", " "))}</em>
      </section>

      <div class="checkpoint-prompt">${escapeHtml(checkpoint.prompt)}</div>

      <label class="prediction-editor">
        <textarea data-field="prediction" spellcheck="true">${escapeHtml(prediction)}</textarea>
        <span data-counter="prediction">${prediction.length} chars</span>
      </label>

      <button class="primary-button" type="button" data-action="commit">
        ${committed ? this.t("updatePrediction") : this.t("commitPrediction")}
      </button>

      <div class="state-grid">
        <button class="state-pill state-success" type="button" data-action="commit">
          ${committed ? this.t("predictionSaved") : this.t("commitPrediction")}
        </button>
        <button class="state-pill ${canReveal ? "state-ready" : ""}" type="button" data-action="reveal" ${canReveal ? "" : "disabled"}>
          ${canReveal ? this.t("revealEnabled") : this.t("revealLocked")}
        </button>
      </div>

      <button class="secondary-button" type="button" data-action="verify">
        ${entry?.verifying ? this.t("checkingReasoning") : this.t("verifyReasoning")}
      </button>

      ${entry?.verifying ? `
        <section class="verification-card pending">
          <div class="verification-summary">
            <span>${this.t("checkingReasoning")}</span>
          </div>
          <p>${this.t("checkingReasoningDetail")}</p>
        </section>
      ` : ""}

      ${entry?.verificationError ? `
        <section class="verification-card error-state">
          <div class="verification-summary">
            <span>${this.t("verificationErrorTitle")}</span>
          </div>
          <p>${escapeHtml(entry.verificationError)}</p>
        </section>
      ` : ""}

      <section class="notes-section">
        <h3>${this.t("quickNotes")}</h3>
        <textarea class="notes-input" data-field="note" placeholder="${this.t("notePlaceholder")}">${escapeHtml(note)}</textarea>
        <div class="tag-row">
          ${["clarify", "important", "connect", "doubt"].map((tag) => `
            <button class="tag-button ${tags.includes(tag) ? "selected" : ""}" type="button" data-action="tag" data-tag="${tag}">
              ${tagSymbol(tag)} ${this.t(tag)}
            </button>
          `).join("")}
        </div>
      </section>

      ${verification ? this.renderVerification(verification, showReasoning) : ""}

      ${entry?.revealed ? `
        <section class="revealed-panel">
          <h3>${this.t("sourceRevealed")}</h3>
          <p>${escapeHtml(sourceText)}</p>
          <div class="memory-row" aria-label="${this.t("memory")}">
            ${["understood", "partial", "misunderstood"].map((status) => `
              <button class="memory-button ${memoryStatus === status ? "selected" : ""}" type="button" data-action="memory" data-status="${status}">
                ${this.t(status)}
              </button>
            `).join("")}
          </div>
        </section>
      ` : ""}
    `;
  }

  renderApiStatus() {
    return `
      <div class="api-status ${escapeHtml(this.state.apiStatus)}" title="${escapeHtml(this.state.apiStatusMessage || "")}">
        <span aria-hidden="true"></span>
        <strong>${escapeHtml(this.state.apiStatusMessage || this.t("apiNotConfigured"))}</strong>
      </div>
    `;
  }

  renderVerification(verification, showReasoning) {
    return `
      <section class="verification-card ${verification.kind}">
        <div class="verification-summary">
          <span>${escapeHtml(verification.label)}</span>
          <button type="button" data-action="toggle-reasoning">${showReasoning ? this.t("hideReasoning") : this.t("showReasoning")}</button>
        </div>
        <p>${escapeHtml(verification.detail)}</p>
        ${showReasoning ? `<p class="expanded-reasoning">${escapeHtml(verification.expanded || "")}</p>` : ""}
      </section>
    `;
  }

  renderSettingsDialog() {
    return `
      <div class="settings-overlay" role="presentation">
        <section class="settings-dialog" role="dialog" aria-modal="true" aria-label="${this.t("apiSettings")}">
          <div class="settings-header">
            <div>
              <h2>${this.t("apiSettings")}</h2>
              <p>${this.t("apiSettingsDetail")}</p>
            </div>
            <button class="icon-button" type="button" data-action="close-settings" title="${this.t("close")}">Close</button>
          </div>
          <label class="config-editor">
            <span>${this.t("apiConfigLabel")}</span>
            <textarea data-field="apiConfig" spellcheck="false">${escapeHtml(this.state.apiConfigDraft)}</textarea>
          </label>
          <p class="settings-note">${this.t("apiConfigSecurity")}</p>
          ${this.state.apiConfigMessage ? `<p class="settings-message">${escapeHtml(this.state.apiConfigMessage)}</p>` : ""}
          <div class="settings-actions">
            <button class="secondary-button" type="button" data-action="clear-api-config">${this.t("clearConfig")}</button>
            <button class="primary-button" type="button" data-action="save-api-config">${this.t("saveConfig")}</button>
          </div>
        </section>
      </div>
    `;
  }

  renderTutorialDialog() {
    const tutorial = getTutorialContent(this.state.language);

    return `
      <div class="tutorial-overlay" role="presentation">
        <section class="tutorial-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(tutorial.title)}">
          <div class="tutorial-header">
            <div>
              <span>${this.t("tutorial")}</span>
              <h2>${escapeHtml(tutorial.title)}</h2>
              <p>${escapeHtml(tutorial.subtitle)}</p>
            </div>
            <button class="icon-button" type="button" data-action="close-tutorial" title="${this.t("close")}">Close</button>
          </div>

          <section class="tutorial-intro">
            <h3>${escapeHtml(tutorial.thesisTitle)}</h3>
            <p>${escapeHtml(tutorial.thesis)}</p>
          </section>

          <section class="tutorial-steps" aria-label="${escapeHtml(tutorial.stepsTitle)}">
            <h3>${escapeHtml(tutorial.stepsTitle)}</h3>
            <ol>
              ${tutorial.steps.map((step) => `
                <li>
                  <strong>${escapeHtml(step.name)}</strong>
                  <p>${escapeHtml(step.detail)}</p>
                </li>
              `).join("")}
            </ol>
          </section>

          <section class="tutorial-split">
            <div>
              <h3>${escapeHtml(tutorial.rulesTitle)}</h3>
              <ul>
                ${tutorial.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}
              </ul>
            </div>
            <div>
              <h3>${escapeHtml(tutorial.checkpointTitle)}</h3>
              <p>${escapeHtml(tutorial.checkpointText)}</p>
            </div>
          </section>

          <button class="primary-button tutorial-start" type="button" data-action="close-tutorial">
            ${escapeHtml(tutorial.closeLabel)}
          </button>
        </section>
      </div>
    `;
  }

  renderLogsDialog() {
    const logs = this.state.logs || [];

    return `
      <div class="logs-overlay" role="presentation">
        <section class="logs-dialog" role="dialog" aria-modal="true" aria-label="${this.t("developerLogs")}">
          <div class="logs-header">
            <div>
              <h2>${this.t("developerLogs")}</h2>
              <p>${this.t("developerLogsDetail")}</p>
            </div>
            <button class="icon-button" type="button" data-action="close-logs" title="${this.t("close")}">Close</button>
          </div>
          <div class="logs-actions">
            <button class="secondary-button" type="button" data-action="clear-logs">${this.t("clearLogs")}</button>
            <button class="primary-button" type="button" data-action="copy-logs">${this.t("copyLogs")}</button>
          </div>
          ${this.state.logMessage ? `<p class="logs-message">${escapeHtml(this.state.logMessage)}</p>` : ""}
          <p class="logs-note">${this.t("logPrivacyNote")}</p>
          <div class="logs-list">
            ${logs.length === 0 ? `<p class="logs-empty">${this.t("noLogs")}</p>` : logs.map((log) => `
              <article class="log-entry ${escapeHtml(log.level)}">
                <div class="log-entry-header">
                  <span>${escapeHtml(log.level.toUpperCase())}</span>
                  <strong>${escapeHtml(log.area)}</strong>
                  <time>${escapeHtml(formatLogTime(log.timestamp))}</time>
                </div>
                <p>${escapeHtml(log.message)}</p>
                ${hasLogDetails(log.details) ? `<pre>${escapeHtml(JSON.stringify(log.details, null, 2))}</pre>` : ""}
              </article>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  bindEvents() {
    this.root.querySelectorAll("[data-action]").forEach((element) => {
      if (element.tagName === "SELECT") {
        element.addEventListener("change", (event) => this.handleAction(event));
      } else {
        element.addEventListener("click", (event) => this.handleAction(event));
      }
    });

    this.root.querySelectorAll("[data-field]").forEach((element) => {
      element.addEventListener("input", (event) => this.handleFieldInput(event));
    });
  }

  handleAction(event) {
    const target = event.currentTarget;
    const action = target.dataset.action;

    if (action === "language") {
      this.setState({ language: target.value });
      return;
    }

    if (action === "import") {
      this.fileInput.click();
      return;
    }

    if (action === "open-settings") {
      this.setState({ settingsOpen: true });
      return;
    }

    if (action === "close-settings") {
      this.setState({ settingsOpen: false });
      return;
    }

    if (action === "save-api-config") {
      this.saveApiConfig();
      return;
    }

    if (action === "open-tutorial") {
      this.recordLog("info", "tutorial", "Tutorial opened");
      this.setState({ tutorialOpen: true });
      return;
    }

    if (action === "close-tutorial") {
      this.setState({ tutorialOpen: false });
      return;
    }

    if (action === "open-logs") {
      this.setState({
        logsOpen: true,
        logs: loadAppLogs(),
        logMessage: ""
      });
      return;
    }

    if (action === "close-logs") {
      this.setState({ logsOpen: false, logMessage: "" });
      return;
    }

    if (action === "copy-logs") {
      this.copyLogs();
      return;
    }

    if (action === "clear-logs") {
      clearAppLogs();
      this.setState({
        logs: [],
        logMessage: this.t("logsCleared")
      });
      return;
    }

    if (action === "clear-api-config") {
      clearProviderConfig();
      this.recordLog("info", "api", "API configuration cleared");
      this.setState({
        apiConfigDraft: defaultApiConfigTemplate(),
        apiConfigSaved: false,
        apiConfigMessage: this.t("configCleared"),
        apiStatus: "not-configured",
        apiStatusMessage: this.t("apiNotConfigured"),
        scanMessage: ""
      });
      return;
    }

    if (action === "test-api") {
      this.testApiConnection();
      return;
    }

    if (action === "scan-document") {
      this.scanDocument();
      return;
    }

    if (action === "prev") {
      this.moveCheckpoint(-1);
      return;
    }

    if (action === "next") {
      this.moveCheckpoint(1);
      return;
    }

    if (action === "commit") {
      this.updateCurrentEntry((entry) => ({ ...entry, committed: true }));
      return;
    }

    if (action === "verify") {
      this.verifyCurrentPrediction();
      return;
    }

    if (action === "reveal") {
      const checkpoint = this.getCurrentCheckpoint();
      this.recordLog("info", "review", "Checkpoint source revealed", {
        checkpointId: checkpoint?.id || null,
        target: checkpoint?.target || null
      });
      this.updateCurrentEntry((entry) => ({ ...entry, committed: true, revealed: true }));
      return;
    }

    if (action === "tag") {
      this.toggleCurrentTag(target.dataset.tag);
      return;
    }

    if (action === "memory") {
      const checkpoint = this.getCurrentCheckpoint();
      this.recordLog("info", "reflection", "Memory status updated", {
        checkpointId: checkpoint?.id || null,
        target: checkpoint?.target || null,
        status: target.dataset.status
      });
      this.updateCurrentEntry((entry, checkpoint) => ({
        ...entry,
        memory: createMemoryReflection({
          checkpointId: checkpoint.id,
          status: target.dataset.status,
          note: entry.note
        })
      }));
      return;
    }

    if (action === "toggle-reasoning") {
      this.updateCurrentEntry((entry) => ({ ...entry, showReasoning: !entry.showReasoning }));
      return;
    }

    if (action === "toggle-workspace") {
      this.setState({ workspaceExpanded: !this.state.workspaceExpanded });
      return;
    }

    if (action === "reset-view") {
      this.setState({ workspaceExpanded: false });
    }
  }

  handleFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.value;

    if (field === "prediction") {
      this.updateCurrentEntry((entry) => ({ ...entry, prediction: value }), { render: false });
      const counter = this.root.querySelector('[data-counter="prediction"]');
      if (counter) {
        counter.textContent = `${value.length} chars`;
      }
    }

    if (field === "note") {
      this.updateCurrentEntry((entry) => ({
        ...entry,
        note: value,
        memory: entry.memory ? { ...entry.memory, note: value, updatedAt: new Date().toISOString() } : entry.memory
      }), { render: false });
    }

    if (field === "apiConfig") {
      this.state = {
        ...this.state,
        apiConfigDraft: value,
        apiConfigMessage: ""
      };
    }
  }

  async copyLogs() {
    const logs = loadAppLogs();
    const text = serializeAppLogs(logs);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!copyTextWithTemporaryElement(text)) {
        throw new Error("Clipboard API is not available.");
      }

      this.setState({
        logs,
        logMessage: this.t("logsCopied")
      });
    } catch (error) {
      this.recordLog("warn", "logs", "Could not copy logs to clipboard", {
        error: error.message || "Clipboard copy failed"
      });
      this.setState({
        logs: loadAppLogs(),
        logMessage: this.t("logsCopyFailed")
      });
    }
  }

  saveApiConfig() {
    const result = saveProviderConfig(this.state.apiConfigDraft);

    if (!result.ok) {
      this.recordLog("error", "api", "API configuration save failed", {
        error: result.error
      });
      this.setState({
        apiConfigSaved: false,
        apiConfigMessage: result.error
      });
      return;
    }

    this.recordLog("info", "api", result.config ? "API configuration saved" : "API configuration cleared", {
      format: result.config?.format || null
    });

    this.setState({
      apiConfigSaved: Boolean(result.config),
      apiConfigMessage: result.config ? this.t("configSaved") : this.t("configCleared"),
      apiStatus: result.config ? "untested" : "not-configured",
      apiStatusMessage: result.config ? this.t("apiUntested") : this.t("apiNotConfigured"),
      scanMessage: ""
    });
  }

  async testApiConnection() {
    const providerConfig = loadProviderConfig();

    if (!providerConfig?.value) {
      this.recordLog("warn", "api", "API connection test skipped", {
        reason: "missing provider configuration"
      });
      this.setState({
        apiStatus: "not-configured",
        apiStatusMessage: this.t("apiNotConfigured"),
        scanMessage: this.t("apiMissingConfig")
      });
      return;
    }

    this.recordLog("info", "api", "API connection test started", {
      task: "scan-material"
    });

    this.setState({
      testingConnection: true,
      apiStatus: "connecting",
      apiStatusMessage: this.t("apiConnecting"),
      scanMessage: this.t("testingApi")
    });

    try {
      const result = await testProviderConnection(providerConfig);

      if (!result.ok) {
        this.recordLog("error", "api", "API connection test failed", {
          message: result.message,
          providerMeta: result.providerMeta
        });
        this.setState({
          testingConnection: false,
          apiStatus: result.status || "error",
          apiStatusMessage: result.message,
          scanMessage: result.message
        });
        return;
      }

      this.recordLog("info", "api", "API connection verified", {
        providerMeta: result.providerMeta
      });
      this.setState({
        testingConnection: false,
        apiStatus: "connected",
        apiStatusMessage: this.t("apiConnected"),
        scanMessage: buildProviderMessage(this.t("apiVerified"), result.providerMeta)
      });
    } catch (error) {
      this.recordLog("error", "api", "API connection test crashed", {
        error
      });
      this.setState({
        testingConnection: false,
        apiStatus: "error",
        apiStatusMessage: error.message || this.t("apiError"),
        scanMessage: error.message || this.t("apiError")
      });
    }
  }

  async scanDocument() {
    const providerConfig = loadProviderConfig();

    if (!providerConfig?.value) {
      this.recordLog("warn", "scan", "Document scan skipped", {
        reason: "missing provider configuration"
      });
      this.setState({
        apiStatus: "not-configured",
        apiStatusMessage: this.t("apiNotConfigured"),
        scanMessage: this.t("apiMissingConfig")
      });
      return;
    }

    this.recordLog("info", "scan", "Document scan started", {
      documentTitle: this.state.document.title,
      segmentCount: this.state.document.segments.length
    });

    this.setState({
      scanning: true,
      apiStatus: "connecting",
      apiStatusMessage: this.t("apiConnecting"),
      scanMessage: this.t("scanningDocument")
    });

    try {
      const result = await scanDocumentWithProvider({
        document: this.state.document,
        providerConfig
      });

      if (!result.ok) {
        this.recordLog("error", "scan", "Document scan failed", {
          message: result.message,
          providerMeta: result.providerMeta
        });
        this.setState({
          scanning: false,
          apiStatus: result.status === "not-configured" ? "not-configured" : "error",
          apiStatusMessage: result.message,
          scanMessage: result.message
        });
        return;
      }

      this.recordLog("info", "scan", "Document scan completed", {
        checkpointCount: result.checkpoints.length,
        providerMeta: result.providerMeta
      });
      this.setState({
        scanning: false,
        apiStatus: "connected",
        apiStatusMessage: this.t("apiConnected"),
        scanMessage: buildProviderMessage(result.message, result.providerMeta),
        activeCheckpointIndex: 0,
        checkpointEntries: {},
        document: {
          ...this.state.document,
          checkpoints: result.checkpoints,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      this.recordLog("error", "scan", "Document scan crashed", {
        error
      });
      this.setState({
        scanning: false,
        apiStatus: "error",
        apiStatusMessage: error.message || this.t("apiError"),
        scanMessage: error.message || this.t("apiError")
      });
    }
  }

  handleFileImport() {
    const file = this.fileInput.files?.[0];

    readStudyFile(file)
      .then(({ title, text }) => {
        const document = createStudyDocument({ title, text, language: this.state.language });
        this.recordLog("info", "import", "Study file imported", {
          title,
          textLength: text.length,
          segmentCount: document.segments.length,
          checkpointCount: document.checkpoints.length
        });
        this.setState({
          document,
          activeCheckpointIndex: 0,
          checkpointEntries: {},
          importMessage: `${title} loaded.`
        });
      })
      .catch((error) => {
        this.recordLog("error", "import", "Study file import failed", {
          fileName: file?.name || null,
          error
        });
        this.setState({ importMessage: error.message });
      })
      .finally(() => {
        this.fileInput.value = "";
      });
  }

  async verifyCurrentPrediction() {
    const checkpoint = this.getCurrentCheckpoint();
    const segment = checkpoint ? this.state.document.segments[checkpoint.segmentIndex] : null;

    if (!checkpoint || !segment) {
      return;
    }

    const sourceText = getCheckpointSource(segment, checkpoint);
    const currentEntry = this.getCheckpointEntry(checkpoint.id);
    const prediction = currentEntry.prediction;
    const providerConfig = loadProviderConfig();

    if (!providerConfig?.value) {
      const message = this.t("verificationRequiresApi");
      this.recordLog("error", "verification", "Remote verification blocked", {
        checkpointId: checkpoint.id,
        target: checkpoint.target,
        reason: "missing provider configuration"
      });
      this.updateCurrentEntry((entry) => ({
        ...entry,
        committed: entry.committed || entry.prediction.trim().length > 0,
        verifying: false,
        verification: null,
        verificationError: message
      }));
      this.setState({
        apiStatus: "not-configured",
        apiStatusMessage: this.t("apiNotConfigured"),
        scanMessage: message
      });
      return;
    }

    this.recordLog("info", "verification", "Verification started", {
      checkpointId: checkpoint.id,
      target: checkpoint.target,
      kind: checkpoint.kind,
      predictionLength: prediction.length,
      remoteConfigured: true
    });

    this.updateCurrentEntry((entry) => ({
      ...entry,
      committed: entry.committed || entry.prediction.trim().length > 0,
      verifying: true,
      verificationError: ""
    }));

    try {
      const remoteResult = await verifyPredictionWithProvider({
        prediction,
        sourceText,
        segmentText: segment.text,
        target: checkpoint.target,
        prompt: checkpoint.prompt,
        language: this.state.language,
        providerConfig
      });

      if (!remoteResult.ok) {
        const message = remoteResult.message || this.t("verificationConnectionFailed");
        this.recordLog("error", "verification", "Remote verification failed", {
          message,
          providerMeta: remoteResult.providerMeta
        });
        this.updateCurrentEntry((entry) => ({
          ...entry,
          verifying: false,
          verification: null,
          verificationError: message
        }));
        this.setState({
          apiStatus: remoteResult.status === "not-configured" ? "not-configured" : "error",
          apiStatusMessage: message,
          scanMessage: message
        });
        return;
      }

      const verification = {
        ...remoteResult.verification,
        providerMeta: remoteResult.providerMeta
      };

      this.recordLog("info", "verification", "Remote verification completed", {
        resultKind: verification.kind,
        providerMeta: remoteResult.providerMeta
      });
      this.setState({
        apiStatus: "connected",
        apiStatusMessage: this.t("apiConnected"),
        scanMessage: buildProviderMessage(this.t("remoteVerificationComplete"), remoteResult.providerMeta)
      });

      this.updateCurrentEntry((entry) => ({
        ...entry,
        verifying: false,
        verifyCount: (entry.verifyCount || 0) + 1,
        verification,
        verificationError: ""
      }));
    } catch (error) {
      const message = error.message || this.t("verificationConnectionFailed");
      this.recordLog("error", "verification", "Remote verification crashed", {
        error
      });
      this.updateCurrentEntry((entry) => ({
        ...entry,
        verifying: false,
        verification: null,
        verificationError: message
      }));
      this.setState({
        apiStatus: "error",
        apiStatusMessage: message,
        scanMessage: message
      });
    }
  }

  toggleCurrentTag(tag) {
    this.updateCurrentEntry((entry) => {
      const tags = new Set(entry.tags || []);

      if (tags.has(tag)) {
        tags.delete(tag);
      } else {
        tags.add(tag);
      }

      return { ...entry, tags: [...tags] };
    });
  }

  moveCheckpoint(direction) {
    const total = this.state.document.checkpoints.length;

    if (total === 0) {
      return;
    }

    const activeCheckpointIndex = (this.state.activeCheckpointIndex + direction + total) % total;
    this.setState({ activeCheckpointIndex });
  }

  updateCurrentEntry(updater, options = { render: true }) {
    const checkpoint = this.getCurrentCheckpoint();

    if (!checkpoint) {
      return;
    }

    const current = this.getCheckpointEntry(checkpoint.id);
    const nextEntry = updater(current, checkpoint);

    const nextState = {
      ...this.state,
      checkpointEntries: {
        ...this.state.checkpointEntries,
        [checkpoint.id]: nextEntry
      }
    };

    this.state = nextState;
    saveSession(createPersistedSession(this.state));

    if (options.render) {
      this.render();
    }
  }

  getCurrentCheckpoint() {
    return this.state.document.checkpoints[this.state.activeCheckpointIndex] || null;
  }

  getCheckpointEntry(checkpointId) {
    return (
      this.state.checkpointEntries[checkpointId] || {
        prediction: "",
        committed: false,
        revealed: false,
        note: "",
        tags: [],
        verifyCount: 0,
        verification: null,
        verificationError: "",
        showReasoning: false,
        verifying: false,
        memory: null
      }
    );
  }

  setState(partialState) {
    this.state = {
      ...this.state,
      ...partialState
    };

    this.render();
  }

  recordLog(level, area, message, details = null) {
    const logs = appendAppLog({ level, area, message, details });
    this.state = {
      ...this.state,
      logs
    };

    if (this.state.logsOpen) {
      this.render();
    }

    return logs;
  }

  t(key) {
    return t(this.state.language, key);
  }
}

function createInitialState(document) {
  return {
    document,
    language: document.language || "en",
    activeCheckpointIndex: 0,
    checkpointEntries: {},
    workspaceExpanded: false,
    importMessage: "",
    settingsOpen: false,
    apiConfigDraft: defaultApiConfigTemplate(),
    apiConfigSaved: false,
    apiConfigMessage: "",
    apiStatus: "not-configured",
    apiStatusMessage: "",
    scanMessage: "",
    scanning: false,
    testingConnection: false,
    tutorialOpen: false,
    logsOpen: false,
    logs: [],
    logMessage: ""
  };
}

function createPersistedSession(state) {
  return {
    document: state.document,
    language: state.language,
    activeCheckpointIndex: state.activeCheckpointIndex,
    checkpointEntries: state.checkpointEntries,
    workspaceExpanded: state.workspaceExpanded
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function tagSymbol(tag) {
  return {
    clarify: "?",
    important: "*",
    connect: "<->",
    doubt: "!"
  }[tag];
}

function hasLogDetails(details) {
  return Boolean(
    details &&
      (typeof details !== "object" || Object.keys(details).length > 0)
  );
}

function formatLogTime(timestamp) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "medium"
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

function copyTextWithTemporaryElement(text) {
  const element = document.createElement("textarea");
  element.value = text;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.left = "-9999px";
  document.body.append(element);
  element.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    element.remove();
  }
}

function defaultApiConfigTemplate() {
  return `{
  "provider": "openai",
  "apiKey": "",
  "baseUrl": "",
  "models": {
    "scan-material": "",
    "verify-prediction": "",
    "generate-hint": "",
    "deep-assist": "",
    "memory-reflection": ""
  }
}`;
}

function buildProviderMessage(message, providerMeta) {
  if (!providerMeta?.requestAttempted) {
    return message;
  }

  const detailParts = [
    providerMeta.model ? `model: ${providerMeta.model}` : "",
    providerMeta.status ? `provider HTTP ${providerMeta.status}` : "",
    providerMeta.requestId ? `request id: ${providerMeta.requestId}` : ""
  ].filter(Boolean);

  return detailParts.length > 0 ? `${message} (${detailParts.join(", ")})` : message;
}
