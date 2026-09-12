const API_BASE = "http://localhost:3001";

let parentToken = "";
let parentId = "";
let activeSessionId = "";

const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (requestUrl.endsWith("/auth/login") && response.ok) {
      const payload = await response.clone().json();
      if (payload?.user?.role === "parent") {
        parentToken = payload.token;
        parentId = payload.user.id;
        queueMicrotask(loadPilotWorkspace);
      }
    }
  } catch {
    // Parent pilot tooling must never interfere with the core family workspace.
  }
  return response;
};

const root = () => document.querySelector("#pilot-operations-root");
const escapeHtml = (value) => {
  const node = document.createElement("span");
  node.textContent = value ?? "";
  return node.innerHTML;
};

async function pilotApi(path, options = {}) {
  const response = await originalFetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(parentToken ? { authorization: `Bearer ${parentToken}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Pilot operation failed");
  return body;
}

function statusCopy(status) {
  if (status === "planned") return "Ready to start";
  if (status === "active") return "In progress";
  if (status === "completed") return "Completed";
  return "Cancelled";
}

function renderWorkspaceShell() {
  if (!root()) return;
  root().innerHTML = `
    <section class="panel pilot-operations" aria-labelledby="pilot-operations-heading">
      <div class="section-header">
        <div>
          <p class="eyebrow">Family pilot operations</p>
          <h2 id="pilot-operations-heading">Pilot session workspace</h2>
          <p class="muted">Start a family pilot session, keep factual notes during the session, and close it when finished.</p>
        </div>
        <span id="pilot-session-count" class="status-pill">0 sessions</span>
      </div>
      <div class="pilot-readiness" role="note">
        <strong>Before you begin</strong>
        <p>Have paper and a pencil ready. Let the child do the thinking. Record only what happened, not ability labels, diagnoses, rankings, or hidden Atlas progression.</p>
      </div>
      <form id="pilot-session-form" class="pilot-session-form">
        <label>Child
          <select id="pilot-learner" required>
            <option value="">Choose a child</option>
          </select>
        </label>
        <label>Session label
          <input id="pilot-session-label" maxlength="120" placeholder="Example: Saturday maths pilot" required>
        </label>
        <button type="submit">Prepare session</button>
      </form>
      <p id="pilot-operation-message" class="muted" role="status" aria-live="polite"></p>
      <div id="pilot-session-list" class="pilot-session-list"></div>
      <div id="pilot-session-detail" class="pilot-session-detail hidden"></div>
    </section>`;

  document.querySelector("#pilot-session-form").addEventListener("submit", createSession);
}

async function populateLearners() {
  const summary = await pilotApi(`/parents/${parentId}/summary`);
  const select = document.querySelector("#pilot-learner");
  select.innerHTML = `<option value="">Choose a child</option>${summary.children.map((child) => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`).join("")}`;
}

async function loadPilotWorkspace() {
  if (!parentToken || !parentId || !root()) return;
  renderWorkspaceShell();
  try {
    await populateLearners();
    await refreshSessions();
  } catch (error) {
    document.querySelector("#pilot-operation-message").textContent = `Pilot workspace unavailable: ${error.message}. Your family learning overview is still available.`;
  }
}

async function refreshSessions() {
  const payload = await pilotApi(`/parents/${parentId}/pilot-sessions`);
  const list = document.querySelector("#pilot-session-list");
  document.querySelector("#pilot-session-count").textContent = `${payload.sessions.length} ${payload.sessions.length === 1 ? "session" : "sessions"}`;
  if (!payload.sessions.length) {
    list.innerHTML = `<p class="muted">No pilot sessions yet. Prepare one when you are ready to observe the family experience.</p>`;
    document.querySelector("#pilot-session-detail").classList.add("hidden");
    return;
  }
  list.innerHTML = payload.sessions.map((session) => `
    <article class="pilot-session-card" data-session-id="${escapeHtml(session.id)}">
      <div>
        <h3>${escapeHtml(session.sessionLabel)}</h3>
        <p>${escapeHtml(session.learnerName || session.learnerId)} · ${escapeHtml(statusCopy(session.status))}</p>
        <small>${session.observationCount || 0} factual ${(session.observationCount || 0) === 1 ? "note" : "notes"}</small>
      </div>
      <button type="button" class="secondary-action" data-open-session="${escapeHtml(session.id)}">Open session</button>
    </article>`).join("");
  list.querySelectorAll("[data-open-session]").forEach((button) => {
    button.addEventListener("click", () => openSession(button.dataset.openSession));
  });
  if (activeSessionId) await openSession(activeSessionId, { silent: true });
}

async function createSession(event) {
  event.preventDefault();
  const learnerId = document.querySelector("#pilot-learner").value;
  const sessionLabel = document.querySelector("#pilot-session-label").value.trim();
  const message = document.querySelector("#pilot-operation-message");
  message.textContent = "";
  try {
    const session = await pilotApi(`/parents/${parentId}/pilot-sessions`, {
      method: "POST",
      body: JSON.stringify({ learnerId, sessionLabel })
    });
    activeSessionId = session.id;
    event.currentTarget.reset();
    message.textContent = "Pilot session prepared. Start it when the child and materials are ready.";
    await refreshSessions();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function openSession(sessionId, { silent = false } = {}) {
  const detail = document.querySelector("#pilot-session-detail");
  const message = document.querySelector("#pilot-operation-message");
  try {
    const session = await pilotApi(`/parents/${parentId}/pilot-sessions/${sessionId}`);
    activeSessionId = session.id;
    detail.classList.remove("hidden");
    const active = session.status === "active";
    detail.innerHTML = `
      <div class="pilot-detail-header">
        <div>
          <p class="eyebrow">${escapeHtml(statusCopy(session.status))}</p>
          <h3>${escapeHtml(session.sessionLabel)}</h3>
          <p class="muted">${escapeHtml(session.learnerName || session.learnerId)}</p>
        </div>
        <div class="pilot-detail-actions">
          ${session.status === "planned" ? '<button type="button" id="start-pilot-session">Start session</button>' : ""}
          ${active ? '<button type="button" id="complete-pilot-session">Finish session</button>' : ""}
        </div>
      </div>
      ${active ? `
        <form id="pilot-observation-form" class="pilot-observation-form">
          <label>What did you observe?
            <select id="pilot-observation-category" required>
              <option value="engagement">Engagement</option>
              <option value="usability">Usability</option>
              <option value="support">Support</option>
              <option value="paper_practice">Paper practice</option>
              <option value="recovery">Recovery</option>
              <option value="other">Other factual note</option>
            </select>
          </label>
          <label>Factual note
            <textarea id="pilot-observation-text" maxlength="500" rows="3" placeholder="Example: Asked for one hint, then completed the paper step independently." required></textarea>
          </label>
          <button type="submit">Save factual note</button>
        </form>` : ""}
      <section class="pilot-notes" aria-label="Pilot observations">
        <h4>Session notes</h4>
        ${session.observations.length ? session.observations.map((item) => `<article class="pilot-note"><strong>${escapeHtml(item.category.replaceAll("_", " "))}</strong><p>${escapeHtml(item.observation)}</p></article>`).join("") : '<p class="muted">No factual observations recorded yet.</p>'}
      </section>`;

    document.querySelector("#start-pilot-session")?.addEventListener("click", () => changeSessionState(session.id, "start"));
    document.querySelector("#complete-pilot-session")?.addEventListener("click", () => changeSessionState(session.id, "complete"));
    document.querySelector("#pilot-observation-form")?.addEventListener("submit", saveObservation);
    if (!silent) detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    message.textContent = `Could not open this pilot session: ${error.message}. Refresh the session list and try again.`;
  }
}

async function changeSessionState(sessionId, action) {
  const message = document.querySelector("#pilot-operation-message");
  try {
    await pilotApi(`/parents/${parentId}/pilot-sessions/${sessionId}/${action}`, { method: "POST", body: "{}" });
    message.textContent = action === "start" ? "Pilot session started. Record only factual events as they happen." : "Pilot session completed. The notes remain available for review.";
    await refreshSessions();
  } catch (error) {
    message.textContent = `${error.message}. The session state was not changed.`;
    await refreshSessions();
  }
}

async function saveObservation(event) {
  event.preventDefault();
  const message = document.querySelector("#pilot-operation-message");
  const category = document.querySelector("#pilot-observation-category").value;
  const observation = document.querySelector("#pilot-observation-text").value.trim();
  try {
    await pilotApi(`/parents/${parentId}/pilot-sessions/${activeSessionId}/observations`, {
      method: "POST",
      body: JSON.stringify({ category, observation })
    });
    message.textContent = "Factual pilot note saved.";
    await openSession(activeSessionId, { silent: true });
    await refreshSessions();
  } catch (error) {
    message.textContent = `${error.message}. Your note was not saved.`;
    await openSession(activeSessionId, { silent: true });
  }
}
