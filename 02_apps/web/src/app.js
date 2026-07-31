const API_BASE = "http://localhost:3001";

const state = {
  token: "",
  learnerId: "",
  parentId: "",
  activeMissionId: "",
  learnerName: ""
};

const el = {
  loginScreen: document.querySelector("#login-screen"),
  workspaceScreen: document.querySelector("#workspace-screen"),
  loginForm: document.querySelector("#login-form"),
  loginError: document.querySelector("#login-error"),
  welcomeHeading: document.querySelector("#welcome-heading"),
  missionCount: document.querySelector("#mission-count"),
  missionsList: document.querySelector("#missions-list"),
  missionHeading: document.querySelector("#mission-heading"),
  missionSummary: document.querySelector("#mission-summary"),
  missionSteps: document.querySelector("#mission-steps"),
  completeMission: document.querySelector("#complete-mission"),
  companionThread: document.querySelector("#companion-thread"),
  companionForm: document.querySelector("#companion-form"),
  companionInput: document.querySelector("#companion-input"),
  parentSummary: document.querySelector("#parent-summary"),
  refreshSummary: document.querySelector("#refresh-summary")
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Atlas API request failed");
  }

  return body;
}

function showWorkspace() {
  el.loginScreen.classList.add("hidden");
  el.workspaceScreen.classList.remove("hidden");
}

function missionStatusLabel(status) {
  return status === "completed" ? "completed" : "active";
}

function renderHome(home) {
  state.learnerName = home.learner.name;
  el.welcomeHeading.textContent = `Good Morning, ${home.learner.name}`;
  el.missionCount.textContent = `${home.todayMissions.length} mission${home.todayMissions.length === 1 ? "" : "s"}`;
  el.missionsList.innerHTML = "";

  home.todayMissions.forEach((mission) => {
    const card = document.createElement("article");
    card.className = "mission-card";
    card.innerHTML = `
      <div>
        <h3>${mission.title}</h3>
        <p>${mission.domains.join(" + ")} · ${mission.durationMinutes} min · <span class="${mission.status === "completed" ? "complete" : ""}">${missionStatusLabel(mission.status)}</span></p>
      </div>
      <button type="button" data-mission-id="${mission.id}">Open</button>
    `;

    card.querySelector("button").addEventListener("click", () => openMission(mission.id));
    el.missionsList.append(card);
  });
}

function renderMission(mission) {
  state.activeMissionId = mission.id;
  el.missionHeading.textContent = mission.title;
  el.missionSummary.textContent = mission.summary;
  el.completeMission.disabled = mission.status === "completed";
  el.completeMission.textContent = mission.status === "completed" ? "Mission Completed" : "Complete Mission";
  el.missionSteps.innerHTML = "";

  mission.steps.forEach((step) => {
    const item = document.createElement("li");
    item.className = "step";
    item.innerHTML = `<strong>${step.title}</strong><p>${step.instruction}</p>`;
    el.missionSteps.append(item);
  });
}

function addCompanionMessage(author, text) {
  const message = document.createElement("div");
  message.className = "message";
  message.innerHTML = `<strong>${author}</strong><span>${text}</span>`;
  el.companionThread.append(message);
  el.companionThread.scrollTop = el.companionThread.scrollHeight;
}

function renderParentSummary(summary) {
  el.parentSummary.innerHTML = "";

  summary.children.forEach((child) => {
    const row = document.createElement("article");
    row.className = "summary-row";
    row.innerHTML = `
      <h3>${child.name}</h3>
      <p>${child.completedMissionCount} completed · ${child.activeMissionCount} active</p>
      <p>${child.highlights.join(". ")}</p>
      <p><strong>Family mission:</strong> ${child.familyMission}</p>
    `;
    el.parentSummary.append(row);
  });
}

async function refreshHome() {
  const home = await api(`/learners/${state.learnerId}/home`);
  renderHome(home);
}

async function refreshParentSummary() {
  const summary = await api(`/parents/${state.parentId}/summary`);
  renderParentSummary(summary);
}

async function openMission(id) {
  const mission = await api(`/missions/${id}`);
  renderMission(mission);
}

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.loginError.textContent = "";

  const form = new FormData(el.loginForm);
  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });

    state.token = result.token;
    state.learnerId = result.user.id;
    state.parentId = result.user.parentId;
    showWorkspace();
    const home = await api(`/learners/${state.learnerId}/home`);
    renderHome(home);
    addCompanionMessage("Atlas Companion", home.companionMessage);
    if (home.todayMissions[0]) await openMission(home.todayMissions[0].id);
  } catch (error) {
    el.loginError.textContent = error.message;
  }
});

el.completeMission.addEventListener("click", async () => {
  if (!state.activeMissionId) {
    return;
  }

  await api(`/missions/${state.activeMissionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ explanation: "I worked through each mission step.", reflection: "I feel more confident and ready to keep learning." })
  });
  await openMission(state.activeMissionId);
  await refreshHome();
  addCompanionMessage("Atlas Companion", "Mission complete. Celebrate one thing you discovered!");
});

el.companionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = el.companionInput.value.trim();

  if (!text) {
    return;
  }

  el.companionInput.value = "";
  addCompanionMessage(state.learnerName, text);
  const result = await api("/companion/message", {
    method: "POST",
    body: JSON.stringify({
      learnerId: state.learnerId,
      missionId: state.activeMissionId,
      message: text
    })
  });
  addCompanionMessage("Atlas Companion", result.reply);
});

el.refreshSummary?.addEventListener("click", refreshParentSummary);
