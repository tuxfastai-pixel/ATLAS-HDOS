const API_BASE = "http://localhost:3001";
const state = { token:"", learnerId:"", parentId:"", learnerName:"", mission:null, attempt:null, adaptive:null, step:0, responses:{}, completed:[] };
const $ = (selector) => document.querySelector(selector);

async function api(path, options={}) {
  const {headers={},...rest}=options;
  const response=await fetch(`${API_BASE}${path}`,{...rest,headers:{"content-type":"application/json",...(state.token?{authorization:`Bearer ${state.token}`}:{}) ,...headers}});
  const body=await response.json();
  if(!response.ok) throw new Error(body.error?.message||"Atlas request failed");
  return body;
}

function show(id){["#login-screen","#workspace-screen","#parent-screen"].forEach(x=>$(x).classList.toggle("hidden",x!==id));}
function esc(value){const node=document.createElement("span");node.textContent=value??"";return node.innerHTML;}
function missionActionLabel(m, completed){return m.status==="in_progress"?"Continue mission":completed?"Try again":"Start mission";}

async function loadHome(){
  const [home,history,growth,recommended]=await Promise.all([
    api(`/learners/${state.learnerId}/home`),
    api(`/learners/${state.learnerId}/mission-history`),
    api(`/learners/${state.learnerId}/growth-dna`),
    api(`/learners/${state.learnerId}/recommendation`)
  ]);
  state.learnerName=home.learner.name;
  const recommendation=recommended.recommendation;
  $("#recommendation-card").innerHTML=recommendation?`<h3>${esc(recommendation.title)}</h3><h4>Why Atlas picked this</h4><p>${esc(recommendation.reason)}</p><button id="start-recommended" type="button">Open recommended mission</button>`:`<p>Nothing new is ready right now. Finish an active mission or check again after more learning evidence is recorded.</p>`;
  if(recommendation)$("#start-recommended").onclick=()=>openMission(recommendation.missionId);
  const visible=growth.dimensions.filter(d=>d.evidenceCount>0).sort((a,b)=>b.evidenceCount-a.evidenceCount).slice(0,4);
  $("#growth-dna-list").innerHTML=visible.length?visible.map(d=>`<article class="growth-signal"><h3>${esc(d.dimension.replaceAll("_"," "))}</h3><p><strong>${esc(d.confidenceInSignal==="low"?"Early signal":d.trend)}</strong> · ${d.evidenceCount} ${d.evidenceCount===1?"observation":"observations"}</p><p>${esc(d.explanation)}</p></article>`).join(""):`<p>Complete missions to begin gathering gentle, explainable learning signals.</p>`;
  $("#welcome-heading").textContent=`Welcome, ${home.learner.name}`;
  $("#mission-count").textContent=`${home.todayMissions.length} ${home.todayMissions.length===1?"mission":"missions"}`;
  $("#missions-list").innerHTML="";
  home.todayMissions.forEach(m=>{
    const card=document.createElement("article"),completed=history.attempts.find(a=>a.missionId===m.id&&a.status==="completed");
    card.className="mission-card";
    card.innerHTML=`<div><h3>${esc(m.title)}</h3><p>${esc(m.domains.join(" + "))} · ${m.durationMinutes} min</p><p><strong>${m.status==="in_progress"?"Ready to continue":completed?"Completed before":"Ready to start"}</strong></p></div><button type="button">${missionActionLabel(m,completed)}</button>`;
    card.querySelector("button").onclick=()=>completed?retryMission(m.id,completed.id):openMission(m.id);
    $("#missions-list").append(card);
  });
}

async function loadAdaptivePlayer(){state.adaptive=state.attempt?await api(`/attempts/${state.attempt.id}/player`):null;return state.adaptive;}
async function retryMission(missionId,attemptId){state.mission=await api(`/missions/${missionId}`);state.attempt=await api(`/attempts/${attemptId}/retry`,{method:"POST",body:"{}"});state.step=0;state.responses={};state.completed=[];await loadAdaptivePlayer();$("#mission-heading").textContent=state.mission.title;$("#mission-summary").textContent="A fresh attempt is ready. Your earlier completed attempt stays in history.";$("#workspace-message").textContent="Start when you are ready. Atlas will guide you one step at a time.";$("#progress-area").classList.remove("hidden");renderStep();}
async function openMission(id){state.mission=await api(`/missions/${id}`);state.attempt=await api(`/missions/${id}/attempts/start`,{method:"POST",body:"{}"});state.step=state.attempt.currentStep;state.responses=state.attempt.responses||{};state.completed=state.attempt.completedSteps||[];await loadAdaptivePlayer();$("#mission-heading").textContent=state.mission.title;$("#mission-summary").textContent=state.mission.summary;$("#workspace-message").textContent=state.attempt.currentStep>0?"Welcome back. Your saved place is ready.":"Start with the current step. You can save and come back at any time.";$("#progress-area").classList.remove("hidden");renderStep();}

const confidence=["I need help","I am getting it","I understand","I can explain it"];
const responseTypes=new Set(["number","choice","short_text","reflection","confidence"]);
const stepResponseKey=(index=state.step)=>`step_${index+1}`;

function savedStepResponse(index=state.step){return state.responses[stepResponseKey(index)]||null;}
function stepRequiresResponse(step){return responseTypes.has(step.type);}
function hasCurrentResponse(){
  const step=state.mission?.steps?.[state.step];
  if(!step||!stepRequiresResponse(step))return true;
  const saved=savedStepResponse();
  if(!saved)return false;
  if(step.type==="number")return Number.isFinite(saved.answer);
  if(step.type==="choice")return Boolean(saved.choice);
  if(step.type==="short_text")return Boolean(saved.shortText?.trim());
  if(step.type==="reflection")return Boolean(saved.reflection?.trim());
  if(step.type==="confidence")return Boolean(saved.confidence);
  return true;
}

function inputFor(step){
  const saved=savedStepResponse()||{};
  if(step.type==="number")return `<label class="response-input">Your answer<input data-response="answer" type="number" min="0" max="100" value="${esc(saved.answer??"")}" inputmode="numeric" required><small>Work it out first, then enter a whole number from 0 to 100.</small></label>`;
  if(step.type==="confidence")return `<fieldset><legend>How confident do you feel?</legend>${confidence.map(c=>`<label class="choice"><input type="radio" name="confidence" value="${c}" ${saved.confidence===c?"checked":""}>${c}</label>`).join("")}</fieldset>`;
  if(step.type==="short_text")return `<label>Your response<textarea data-response="short_text" rows="${state.learnerId.includes("leago")?5:2}" maxlength="1000" required>${esc(saved.shortText??"")}</textarea></label>${state.learnerId.includes("leago")?'<label>Optional research note<textarea data-response="researchNote" rows="2" maxlength="1000">'+esc(state.responses.researchNote||"")+'</textarea></label>':""}`;
  if(step.type==="reflection")return `<label>Reflection<textarea data-response="reflection" rows="${state.learnerId.includes("leago")?5:2}" maxlength="1000" required>${esc(saved.reflection??"")}</textarea></label>`;
  if(step.type==="choice")return `<div class="choice-grid">${["I practised this","I need another look"].map(choice=>`<button type="button" data-choice="${choice}" aria-pressed="${saved.choice===choice}" class="${saved.choice===choice?"choice-selected":""}">${choice}</button>`).join("")}</div>${saved.choice?'<div class="continue-cue" role="status"><strong>Great — I’ve recorded that.</strong><span>Tap Next to continue your mission. ➜</span></div>':""}`;
  return `<p class="instruction-note">Read this step, then choose Next when you are ready.</p>`;
}

function collect(){
  const step=state.mission?.steps?.[state.step];
  if(!step)return;
  const key=stepResponseKey();
  const current={...(state.responses[key]||{})};
  document.querySelectorAll("[data-response]").forEach(i=>{
    if(i.dataset.response==="answer"){
      if(i.value!=="")current.answer=Number(i.value); else delete current.answer;
    }else if(i.dataset.response==="short_text"){
      current.shortText=i.value;
    }else if(i.dataset.response==="reflection"){
      current.reflection=i.value;
    }else if(i.dataset.response==="researchNote"&&i.value!==""){
      state.responses.researchNote=i.value;
    }
  });
  const selected=document.querySelector('input[name="confidence"]:checked');
  if(selected)current.confidence=selected.value;
  if(Object.keys(current).length)state.responses[key]=current;
  if(Number.isFinite(current.answer))state.responses.answer=current.answer;
  if(current.shortText)state.responses.short_text=current.shortText;
  if(current.reflection)state.responses.reflection=current.reflection;
  if(current.confidence)state.responses.confidence=current.confidence;
  if(current.choice)state.responses.choice=current.choice;
}

function adaptivePanel(){const player=state.adaptive,challenge=player?.challenge;if(!challenge||challenge.stepOrder!==state.step+1)return "";const paper=challenge.paperPractice;return `<section class="paper-practice-panel" aria-label="Paper practice"><h4>Paper practice</h4><p>${esc(challenge.prompt)}</p><p>Write this challenge on paper and work through it step by step. Atlas records only what you confirm here.</p>${player.permittedActions.confirmWritten?'<button type="button" data-adaptive-action="confirm-written">I wrote it down</button>':paper.confirmedWritten?'<p class="adaptive-confirmed">Paper step ready.</p>':""}</section><section class="support-panel" aria-live="polite"><h4>Thinking support</h4>${player.permittedActions.recordIndependentAttempt?'<p>Enter your answer above after working it out, then record your independent attempt.</p><button type="button" data-adaptive-action="attempt">Check my answer</button>':'<p>Your independent attempt has been recorded.</p>'}${challenge.support?`<div class="support-content"><strong>${esc(challenge.support.kind.replaceAll("_"," "))}</strong><p>${esc(challenge.support.content)}</p></div>`:""}${player.permittedActions.requestSupport?'<button type="button" data-adaptive-action="support">Would you like a little help?</button>':challenge.supportComplete?'<p>You have used the available support. Try the original challenge again or take a short pause.</p>':""}${player.permittedActions.completePaperStep?'<button type="button" data-adaptive-action="paper-complete">I finished this paper step</button>':paper.stepCompleted?'<p class="adaptive-confirmed">Paper practice complete.</p>':""}</section>`;}
function adaptiveStepReady(){const challenge=state.adaptive?.challenge;if(!challenge||challenge.stepOrder!==state.step+1)return true;const paper=challenge.paperPractice;return !state.adaptive.permittedActions.recordIndependentAttempt&&(!paper.required||paper.stepCompleted);}
function canAdvance(){return hasCurrentResponse()&&adaptiveStepReady();}

function responseForCurrentStep(){
  const step=state.mission.steps[state.step];
  const saved=savedStepResponse()||{};
  if(step.type==="number"&&Number.isFinite(saved.answer))return {answer:saved.answer};
  if(step.type==="short_text"&&saved.shortText)return {shortText:saved.shortText};
  if(step.type==="reflection"&&saved.reflection)return {reflection:saved.reflection};
  if(step.type==="confidence"&&saved.confidence)return {confidence:saved.confidence};
  if(step.type==="choice"&&saved.choice)return {choice:saved.choice};
  return null;
}

async function adaptiveAction(action){
  const player=state.adaptive,challenge=player?.challenge;
  if(!challenge)return;
  collect();
  const response=action==="attempt"?responseForCurrentStep():null;
  if(action==="attempt"&&!response){$("#workspace-message").textContent="Enter your answer first, then choose Check my answer.";return;}
  try{
    state.adaptive=await api(`/attempts/${state.attempt.id}/challenges/${challenge.id}/${action}`,{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({stateVersion:player.stateVersion,...(response?{response}:{})})});
    $("#workspace-message").textContent=action==="support"?"Here is a small piece of support. Keep doing the thinking on paper.":action==="attempt"?"Your answer was recorded. Keep following the paper and support steps shown below.":"That learning step was saved.";
    renderStep();
  }catch(error){$("#workspace-message").textContent=error.message;await loadAdaptivePlayer();renderStep();}
}

function updateAdvanceState(){
  collect();
  const next=$("#next-step");
  if(next)next.disabled=!canAdvance();
}

function renderStep(){
  const step=state.mission.steps[state.step], total=state.mission.steps.length, percent=Math.round(state.completed.length/total*100);
  $("#step-indicator").textContent=`Step ${state.step+1} of ${total}${state.completed.includes(state.step)?" · completed":" · current"}`;
  $("#mission-progress").value=percent;
  $("#mission-progress").textContent=`${percent}%`;
  $("#progress-label").textContent=`${percent}% complete`;
  $("#current-step").innerHTML=`<h3>${esc(step.title)}</h3><p>${esc(step.instruction)}</p>${inputFor(step)}${adaptivePanel()}`;
  $("#previous-step").disabled=state.step===0;
  $("#next-step").classList.toggle("hidden",state.step===total-1);
  $("#next-step").disabled=!canAdvance();
  $("#complete-mission").classList.toggle("hidden",state.step!==total-1);
  if(state.step===total-1)$("#complete-mission").disabled=!canAdvance();

  $("#current-step").querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>{
    const key=stepResponseKey();
    state.responses[key]={...(state.responses[key]||{}),choice:b.dataset.choice};
    state.responses.choice=b.dataset.choice;
    $("#workspace-message").textContent="Great — I’ve recorded that. Tap Next when you are ready.";
    renderStep();
  });
  $("#current-step").querySelectorAll("[data-response]").forEach(input=>{
    input.addEventListener("input",updateAdvanceState);
    input.addEventListener("change",updateAdvanceState);
  });
  $("#current-step").querySelectorAll('input[name="confidence"]').forEach(input=>input.addEventListener("change",updateAdvanceState));
  $("#current-step").querySelectorAll("[data-adaptive-action]").forEach(b=>b.onclick=()=>adaptiveAction(b.dataset.adaptiveAction));
  $("#current-step").focus();
}

async function save(){collect();state.attempt=await api(`/attempts/${state.attempt.id}`,{method:"PATCH",body:JSON.stringify({currentStep:state.step,completedSteps:state.completed,responses:state.responses})});await loadAdaptivePlayer();}
$("#previous-step").onclick=async()=>{collect();state.step--;await save();renderStep();};
$("#next-step").onclick=async()=>{collect();if(!canAdvance()){$("#workspace-message").textContent="Answer this step before moving on.";return;}if(!state.completed.includes(state.step))state.completed.push(state.step);state.step++;await save();renderStep();};
$("#save-exit").onclick=async()=>{await save();$("#progress-area").classList.add("hidden");$("#mission-summary").textContent="Progress saved. Choose Continue mission when you want to return.";$("#workspace-message").textContent="Your place is saved.";await loadHome();};
$("#abandon-attempt").onclick=async()=>{if(!window.confirm("Leave this attempt? Your saved attempt will close, but you can start a fresh attempt later."))return;await api(`/attempts/${state.attempt.id}/abandon`,{method:"POST",body:"{}"});$("#progress-area").classList.add("hidden");$("#workspace-message").textContent="This attempt is closed. You can start the mission again when you are ready.";await loadHome();};
$("#complete-mission").onclick=async()=>{collect();if(!canAdvance()){$("#workspace-message").textContent="Answer this final step before completing the mission.";return;}if(!state.completed.includes(state.step))state.completed.push(state.step);const explanation=state.responses.short_text||state.responses.answer?.toString()||"I completed each guided step.";const reflection=state.responses.reflection||state.responses.confidence||"I am getting it";await api(`/attempts/${state.attempt.id}/complete`,{method:"POST",body:JSON.stringify({currentStep:state.step,completedSteps:state.completed,responses:state.responses,explanation,reflection})});$("#current-step").innerHTML="<h3>Mission complete!</h3><p>Your work has been saved. Atlas will use the completed mission as one piece of your evolving learning picture.</p>";$("#complete-mission").disabled=true;$("#workspace-message").textContent="Well done. You can return to your missions when you are ready.";await loadHome();};

async function loadParent(){const summary=await api(`/parents/${state.parentId}/summary`);$("#parent-summary").innerHTML=summary.children.map(c=>`<article class="panel child-summary" data-learner-id="${esc(c.id)}"><p class="eyebrow">Child overview</p><h2>${esc(c.name)}</h2><section class="child-recommendation" aria-label="Recommendation for ${esc(c.name)}"><h3>Recommended next mission</h3>${c.recommendation?`<p><strong>${esc(c.recommendation.title)}</strong></p><p class="recommendation-reason">${esc(c.recommendation.reason)}</p><p class="supported-growth-areas"><strong>Growth areas this mission supports:</strong> ${esc(c.recommendation.supportedGrowthAreas.length?c.recommendation.supportedGrowthAreas.join(", "):"No recorded alignment used")}</p>`:`<p class="recommendation-reason">No new mission is ready right now.</p><p class="supported-growth-areas"><strong>Growth areas this mission supports:</strong> No recorded alignment used</p>`}</section><p><strong>Currently doing:</strong> ${esc(c.currentMission?.title||"No active mission")} ${c.currentMission?`(${c.currentMission.percentage||0}% complete)`:""}</p><p><strong>Most recently completed:</strong> ${esc(c.mostRecentCompletedMission||"None yet")}</p><p><strong>Next focus:</strong> ${esc(c.nextFocus)}</p><p><strong>Family activity:</strong> ${esc(c.familyMission)}</p><h3>Learning process & growth insights</h3>${c.growthInsights.length?c.growthInsights.map(i=>`<div class="growth-signal"><p>${esc(i.insight)}</p><small><strong>Why Atlas is showing this:</strong> ${esc(i.whyAtlasIsShowingThis)}</small></div>`).join(""):"<p>Atlas needs more factual learning evidence before showing an insight.</p>"}</article>`).join("");}
$("#login-form").onsubmit=async e=>{e.preventDefault();$("#login-error").textContent="";try{const form=new FormData(e.currentTarget), result=await api("/auth/login",{method:"POST",body:JSON.stringify({username:form.get("username"),password:form.get("password")})});state.token=result.token;if(result.user.role==="parent"){state.parentId=result.user.id;show("#parent-screen");await loadParent();}else{state.learnerId=result.user.id;state.parentId=result.user.parentId;show("#workspace-screen");await loadHome();}}catch(error){$("#login-error").textContent=error.message;}};
$("#companion-form").onsubmit=async e=>{e.preventDefault();const input=$("#companion-input"),message=input.value.trim();if(!message)return;input.value="";const result=await api("/companion/message",{method:"POST",body:JSON.stringify({learnerId:state.learnerId,missionId:state.mission?.id,message})});$("#companion-thread").textContent=result.reply;};
