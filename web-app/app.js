import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  update, 
  onValue, 
  push, 
  remove, 
  runTransaction 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { firebaseConfig } from './config.js';

// ==========================================================================
// Firebase Initialization and Configuration Checking
// ==========================================================================

let app, auth, db;
const isFirebaseConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY";

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    showConfigWarning("Firebase 초기화 에러: config.js 설정을 확인해주세요.");
  }
} else {
  // Show warning overlay if Firebase is not yet configured by the user
  showConfigWarning();
}

function showConfigWarning(customMessage) {
  const warningDiv = document.createElement('div');
  warningDiv.style.position = 'fixed';
  warningDiv.style.top = '0';
  warningDiv.style.left = '0';
  warningDiv.style.width = '100vw';
  warningDiv.style.height = '100vh';
  warningDiv.style.backgroundColor = 'rgba(11, 15, 25, 0.95)';
  warningDiv.style.zIndex = '9999';
  warningDiv.style.display = 'flex';
  warningDiv.style.flexDirection = 'column';
  warningDiv.style.alignItems = 'center';
  warningDiv.style.justifyContent = 'center';
  warningDiv.style.padding = '2rem';
  warningDiv.style.textAlign = 'center';
  warningDiv.style.fontFamily = 'sans-serif';
  warningDiv.style.color = '#f8fafc';

  warningDiv.innerHTML = `
    <div style="background: rgba(30, 41, 59, 0.7); padding: 3rem; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); max-width: 500px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
      <h2 style="color: #f43f5e; margin-bottom: 1rem; font-size: 1.5rem;">Firebase 설정 필요</h2>
      <p style="color: #94a3b8; font-size: 0.9rem; line-height: 1.6; margin-bottom: 2rem;">
        ${customMessage || '웹 애플리케이션을 시작하려면 <code>web-app/config.js</code> 파일 내에 본인의 Firebase Realtime Database 및 Auth 정보를 입력해야 합니다.'}
      </p>
      <div style="text-align: left; background: #0f172a; padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); font-family: monospace; font-size: 0.8rem; margin-bottom: 2rem;">
        1. Firebase 콘솔에서 웹 프로젝트 생성<br>
        2. Authentication (이메일/비밀번호) 활성화<br>
        3. Realtime Database 생성<br>
        4. config.js에 구성 객체 붙여넣기
      </div>
      <p style="font-size: 0.8rem; color: #64748b;">정보를 입력하고 저장한 후 페이지를 새로고침 하세요.</p>
    </div>
  `;
  document.body.appendChild(warningDiv);
}

// ==========================================================================
// Application State Variables
// ==========================================================================

let currentUser = null;
let activeTaskId = null;
let tasksData = {};
let timerInterval = null;
let uiUpdateInterval = null;

// ==========================================================================
// Dom Elements Cache
// ==========================================================================

const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const authError = document.getElementById('auth-error');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

const userEmailSpan = document.getElementById('user-email');
const btnLogout = document.getElementById('btn-logout');

const taskListContainer = document.getElementById('task-list');
const btnShowAddTask = document.getElementById('btn-show-add-task');
const addTaskForm = document.getElementById('add-task-form');

const emptyWorkspace = document.getElementById('empty-workspace');
const activeWorkspace = document.getElementById('active-workspace');

const activeTaskTitle = document.getElementById('active-task-title');
const activeTaskCreated = document.getElementById('active-task-created');
const btnDeleteTask = document.getElementById('btn-delete-task');

const timerDisplay = document.getElementById('timer-display');
const btnTimerStart = document.getElementById('btn-timer-start');
const btnTimerStop = document.getElementById('btn-timer-stop');
const timerStatusText = document.getElementById('timer-status-text');

const radialProgress = document.getElementById('radial-progress');
const prodRatioText = document.getElementById('prod-ratio-text');
const statWorkTime = document.getElementById('stat-work-time');
const statDistractTime = document.getElementById('stat-distract-time');
const statNoneTime = document.getElementById('stat-none-time');

const sitesCounter = document.getElementById('sites-counter');
const sitesListWork = document.getElementById('sites-list-work');
const sitesListDistract = document.getElementById('sites-list-distract');
const sitesListNone = document.getElementById('sites-list-none');

const syncKeyValue = document.getElementById('sync-key-value');
const btnCopySyncKey = document.getElementById('btn-copy-sync-key');

// ==========================================================================
// Auth Event Listeners and Functions
// ==========================================================================

if (isFirebaseConfigured) {
  // Listen for login state change
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      userEmailSpan.textContent = user.email;
      syncKeyValue.value = user.uid; // Setup extension sync key
      
      // Automatically sync credentials with Chrome extension
      window.postMessage({
        type: "FOCUS_GUARD_SYNC",
        syncKey: user.uid,
        databaseURL: firebaseConfig.databaseURL
      }, "*");
      
      // Switch views
      authView.classList.remove('active');
      dashboardView.classList.add('active');
      
      // Load user database listeners
      initDatabaseListeners();
    } else {
      currentUser = null;
      activeTaskId = null;
      tasksData = {};
      stopLocalTimerUI();
      
      // Switch views
      dashboardView.classList.remove('active');
      authView.classList.add('active');
    }
  });

  // Login handler
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAuthError();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    signInWithEmailAndPassword(auth, email, password)
      .catch(err => {
        showAuthError(getFriendlyErrorMessage(err.code));
      });
  });

  // Signup handler
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAuthError();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // Automatically create a path in Realtime Database for new user
        const userId = userCredential.user.uid;
        set(ref(db, `users/${userId}`), {
          active: null,
          tasks: {}
        });
      })
      .catch(err => {
        showAuthError(getFriendlyErrorMessage(err.code));
      });
  });

  // Logout handler
  btnLogout.addEventListener('click', () => {
    // If active timer is running, stop it first before logging out
    if (activeTaskId && tasksData[activeTaskId] && tasksData[activeTaskId].status === 'running') {
      stopTaskTimer(activeTaskId).then(() => {
        signOut(auth);
      });
    } else {
      signOut(auth);
    }
  });
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function hideAuthError() {
  authError.classList.add('hidden');
}

function getFriendlyErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email': return '유효하지 않은 이메일 형식입니다.';
    case 'auth/user-disabled': return '사용 중지된 계정입니다.';
    case 'auth/user-not-found': return '존재하지 않는 회원 정보입니다.';
    case 'auth/wrong-password': return '비밀번호가 올바르지 않습니다.';
    case 'auth/email-already-in-use': return '이미 사용 중인 이메일 주소입니다.';
    case 'auth/weak-password': return '비밀번호가 너무 취약합니다 (최소 6자).';
    case 'auth/missing-password': return '비밀번호를 입력하세요.';
    default: return '인증 오류가 발생했습니다. 다시 시도해주세요.';
  }
}

// ==========================================================================
// Database Listeners & Synced UI Updates
// ==========================================================================

let userTasksRef = null;
let userActiveRef = null;

function initDatabaseListeners() {
  if (!currentUser) return;
  const userId = currentUser.uid;

  userTasksRef = ref(db, `users/${userId}/tasks`);
  userActiveRef = ref(db, `users/${userId}/active`);

  // 1. Listen to tasks list updates
  onValue(userTasksRef, (snapshot) => {
    const data = snapshot.val() || {};
    tasksData = data;
    renderTasksList();
    
    // If a task is selected, refresh its detail UI
    if (activeTaskId) {
      if (tasksData[activeTaskId]) {
        renderActiveTaskDetails();
      } else {
        // Active task was deleted from another client
        activeTaskId = null;
        showEmptyState();
      }
    }
  });

  // 2. Listen to active running task status
  onValue(userActiveRef, (snapshot) => {
    const activeId = snapshot.val();
    
    // Instantly notify Chrome extension of the active timer task ID
    window.postMessage({
      type: "FOCUS_GUARD_TIMER",
      activeTaskId: activeId
    }, "*");
    
    // If running task changes, handle UI timers
    if (activeId) {
      const prevActiveTaskId = activeTaskId;
      // If extension or another device started a task, select it
      if (activeId !== activeTaskId) {
        activeTaskId = activeId;
        selectTask(activeId);
      }
      
      // Turn on timer running state UI
      activeWorkspace.classList.add('running');
      btnTimerStart.disabled = true;
      btnTimerStop.disabled = false;
      timerStatusText.textContent = "과제 진행 중 (추적 중)";
      
      startLocalTimerUI();
    } else {
      // Stopped
      activeWorkspace.classList.remove('running');
      btnTimerStart.disabled = false;
      btnTimerStop.disabled = true;
      timerStatusText.textContent = "대기 중";
      
      stopLocalTimerUI();
      // Keep selected task but update controls
      if (activeTaskId && tasksData[activeTaskId]) {
        renderActiveTaskDetails();
      }
    }
  });
}

// ==========================================================================
// Task Management Operations
// ==========================================================================

// Open add task modal
btnShowAddTask.addEventListener('click', () => {
  openModal('add-task-modal');
  document.getElementById('task-title-input').focus();
});

// Form submission for creating new task
addTaskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const titleInput = document.getElementById('task-title-input');
  const title = titleInput.value.trim();
  if (!title) return;

  const userId = currentUser.uid;
  const newTaskRef = push(ref(db, `users/${userId}/tasks`));
  const taskId = newTaskRef.key;

  const newTask = {
    id: taskId,
    t: title,
    created: Date.now(),
    time: 0,
    status: 'idle'
  };

  set(newTaskRef, newTask)
    .then(() => {
      closeModal('add-task-modal');
      titleInput.value = '';
      selectTask(taskId); // Automatically select newly created task
    })
    .catch(err => alert("과제 추가 오류: " + err.message));
  
  // Re-trigger lucide icons refresh
  setTimeout(() => lucide.replace(), 100);
});

// Task Selection helper
function selectTask(taskId) {
  activeTaskId = taskId;
  
  // Update task list styling active class
  document.querySelectorAll('.task-item').forEach(item => {
    if (item.dataset.id === taskId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Load Task UI
  emptyWorkspace.classList.remove('active');
  activeWorkspace.classList.remove('hidden');

  renderActiveTaskDetails();
}

// Delete current active task
btnDeleteTask.addEventListener('click', () => {
  if (!activeTaskId || !confirm("이 과제를 정말 삭제하시겠습니까? 관련 타이머와 방문 사이트 기록이 모두 삭제됩니다.")) return;
  
  const userId = currentUser.uid;
  
  // If task is running, stop active timer first
  if (tasksData[activeTaskId] && tasksData[activeTaskId].status === 'running') {
    set(ref(db, `users/${userId}/active`), null);
  }

  // Remove task node
  remove(ref(db, `users/${userId}/tasks/${activeTaskId}`))
    .then(() => {
      activeTaskId = null;
      showEmptyState();
    })
    .catch(err => alert("삭제 오류: " + err.message));
});

function showEmptyState() {
  activeWorkspace.classList.add('hidden');
  emptyWorkspace.classList.add('active');
  // Deselect all in sidebar
  document.querySelectorAll('.task-item').forEach(item => item.classList.remove('active'));
}

// Render list of tasks in the sidebar
function renderTasksList() {
  taskListContainer.innerHTML = '';
  const tasksArray = Object.values(tasksData).sort((a, b) => b.created - a.created);

  if (tasksArray.length === 0) {
    taskListContainer.innerHTML = '<div class="empty-state-list">생성된 과제가 없습니다.</div>';
    return;
  }

  tasksArray.forEach(task => {
    const isRunning = task.status === 'running';
    const totalSecs = isRunning 
      ? (task.time + Math.floor((Date.now() - task.created) / 1000)) // Fallback placeholder
      : task.time;
      
    const taskButton = document.createElement('button');
    taskButton.className = `task-item ${isRunning ? 'running' : ''} ${task.id === activeTaskId ? 'active' : ''}`;
    taskButton.dataset.id = task.id;
    taskButton.onclick = () => selectTask(task.id);

    // Format creation date
    const dateStr = new Date(task.created).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    
    // Format duration
    const durationFormatted = formatSecondsToDuration(isRunning ? calculateCurrentTaskDuration(task) : task.time);

    taskButton.innerHTML = `
      <span class="task-title">${escapeHtml(task.t)}</span>
      <div class="task-meta">
        <span>${dateStr}</span>
        <span class="task-indicator">
          ${isRunning ? '<i data-lucide="clock" class="text-xs"></i> 진행중' : `<i data-lucide="file-text" class="text-xs text-dark"></i> ${durationFormatted}`}
        </span>
      </div>
    `;
    taskListContainer.appendChild(taskButton);
  });
  
  lucide.replace();
}

// Render active task detail information
function renderActiveTaskDetails() {
  const task = tasksData[activeTaskId];
  if (!task) return;

  activeTaskTitle.textContent = task.t;
  
  const dateObj = new Date(task.created);
  activeTaskCreated.textContent = `생성일: ${dateObj.toLocaleDateString('ko-KR')} ${dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;

  // Set initial timer text (updated dynamically when running)
  const totalDuration = calculateCurrentTaskDuration(task);
  timerDisplay.textContent = formatSecondsToTimer(totalDuration);

  // Enable/disable buttons based on database status
  const isRunning = task.status === 'running';
  btnTimerStart.disabled = isRunning;
  btnTimerStop.disabled = !isRunning;

  // Render visited site log columns
  renderSitesBoard(task.sites || {});
}

// Calculate duration accurately considering start offsets
function calculateCurrentTaskDuration(task) {
  if (task.status === 'running' && task.lastStart) {
    return task.time + Math.floor((Date.now() - task.lastStart) / 1000);
  }
  return task.time || 0;
}

// ==========================================================================
// Timer Controller Handlers
// ==========================================================================

btnTimerStart.addEventListener('click', () => {
  if (!activeTaskId || !currentUser) return;
  const userId = currentUser.uid;
  const task = tasksData[activeTaskId];
  if (!task || task.status === 'running') return;

  // Set running state in database
  const updates = {};
  updates[`users/${userId}/active`] = activeTaskId;
  updates[`users/${userId}/tasks/${activeTaskId}/status`] = 'running';
  updates[`users/${userId}/tasks/${activeTaskId}/lastStart`] = Date.now();
  
  update(ref(db), updates).catch(err => alert("타이머 시작 오류: " + err.message));
});

btnTimerStop.addEventListener('click', () => {
  if (!activeTaskId || !currentUser) return;
  stopTaskTimer(activeTaskId);
});

function stopTaskTimer(taskId) {
  const userId = currentUser.uid;
  const task = tasksData[taskId];
  if (!task || task.status !== 'running' || !task.lastStart) return Promise.resolve();

  // Calculate new duration
  const elapsed = Math.floor((Date.now() - task.lastStart) / 1000);
  const newAccumulatedTime = (task.time || 0) + elapsed;

  const updates = {};
  updates[`users/${userId}/active`] = null;
  updates[`users/${userId}/tasks/${taskId}/status`] = 'idle';
  updates[`users/${userId}/tasks/${taskId}/lastStart`] = null;
  updates[`users/${userId}/tasks/${taskId}/time`] = newAccumulatedTime;

  return update(ref(db), updates);
}

// Local interval updates clock in UI so we don't have to read database every second
function startLocalTimerUI() {
  if (uiUpdateInterval) clearInterval(uiUpdateInterval);
  
  uiUpdateInterval = setInterval(() => {
    const task = tasksData[activeTaskId];
    if (task && task.status === 'running' && task.lastStart) {
      const currentTotal = task.time + Math.floor((Date.now() - task.lastStart) / 1000);
      timerDisplay.textContent = formatSecondsToTimer(currentTotal);
      
      // Update timer indicator text in sidebar list
      const sidebarItems = document.querySelectorAll('.task-item');
      sidebarItems.forEach(item => {
        if (item.dataset.id === activeTaskId) {
          const indicator = item.querySelector('.task-indicator');
          if (indicator) {
            indicator.innerHTML = '<i data-lucide="clock" class="text-xs"></i> ' + formatSecondsToDuration(currentTotal);
          }
        }
      });
    }
  }, 1000);
}

function stopLocalTimerUI() {
  if (uiUpdateInterval) {
    clearInterval(uiUpdateInterval);
    uiUpdateInterval = null;
  }
}

// ==========================================================================
// Sites Dashboard Rendering and Categorization
// ==========================================================================

function renderSitesBoard(sitesObj) {
  // Clear lists
  sitesListWork.innerHTML = '';
  sitesListDistract.innerHTML = '';
  sitesListNone.innerHTML = '';

  const sitesArray = Object.entries(sitesObj).map(([key, value]) => ({
    key: key,
    ...value
  })).sort((a, b) => b.dur - a.dur); // Sort by duration desc

  const totalSites = sitesArray.length;
  sitesCounter.textContent = `총 ${totalSites}개 사이트`;

  let workTimeTotal = 0;
  let distractTimeTotal = 0;
  let noneTimeTotal = 0;

  let hasWorkSites = false;
  let hasDistractSites = false;
  let hasNoneSites = false;

  sitesArray.forEach(site => {
    // Add up total seconds spent per category
    const dur = site.dur || 0;
    if (site.cat === 'work') {
      workTimeTotal += dur;
      hasWorkSites = true;
    } else if (site.cat === 'distract') {
      distractTimeTotal += dur;
      hasDistractSites = true;
    } else {
      noneTimeTotal += dur;
      hasNoneSites = true;
    }

    // Create Site Card Element
    const card = document.createElement('div');
    card.className = 'site-card';
    card.dataset.key = site.key;

    // Format site duration
    const durStr = formatSecondsToDuration(dur);

    // Build categories buttons based on context
    let actionButtons = '';
    if (site.cat === 'none') {
      actionButtons = `
        <button class="btn-move btn-move-work" onclick="moveSiteCategory('${site.key}', 'work')"><i data-lucide="check" class="text-success" style="width:10px;height:10px;"></i> 과제용</button>
        <button class="btn-move btn-move-distract" onclick="moveSiteCategory('${site.key}', 'distract')"><i data-lucide="alert-triangle" class="text-danger" style="width:10px;height:10px;"></i> 딴짓용</button>
      `;
    } else if (site.cat === 'work') {
      actionButtons = `
        <button class="btn-move btn-move-distract" onclick="moveSiteCategory('${site.key}', 'distract')"><i data-lucide="alert-triangle" class="text-danger" style="width:10px;height:10px;"></i> 딴짓용</button>
        <button class="btn-move" onclick="moveSiteCategory('${site.key}', 'none')"><i data-lucide="help-circle" style="width:10px;height:10px;"></i> 미분류</button>
      `;
    } else if (site.cat === 'distract') {
      actionButtons = `
        <button class="btn-move btn-move-work" onclick="moveSiteCategory('${site.key}', 'work')"><i data-lucide="check" class="text-success" style="width:10px;height:10px;"></i> 과제용</button>
        <button class="btn-move" onclick="moveSiteCategory('${site.key}', 'none')"><i data-lucide="help-circle" style="width:10px;height:10px;"></i> 미분류</button>
      `;
    }

    let computedDomain = '사이트';
    try {
      computedDomain = new URL(site.url).hostname;
    } catch (e) {}

    card.innerHTML = `
      <div class="site-card-header">
        <div class="site-info">
          <span class="site-domain" title="${escapeHtml(computedDomain)}">
            <img src="https://www.google.com/s2/favicons?sz=32&domain=${computedDomain}" 
                 style="width: 14px; height: 14px; margin-right: 4px; vertical-align: text-top; border-radius:2px;" 
                 onerror="this.style.display='none'">
            ${escapeHtml(computedDomain)}
          </span>
          <a class="site-url" href="${escapeHtml(site.url)}" target="_blank" title="${escapeHtml(site.url)}">${escapeHtml(site.url)}</a>
        </div>
        <span class="site-duration"><i data-lucide="timer" style="width:11px;height:11px;"></i> ${durStr}</span>
      </div>

      <!-- Comment Section -->
      <div class="site-comment-group">
        <i data-lucide="message-square"></i>
        <input type="text" class="site-comment-input" 
               placeholder="용도 설명 입력... (예: 공식 문서 참고)" 
               value="${escapeHtml(site.cmt || '')}" 
               onblur="updateSiteComment('${site.key}', this.value)"
               onkeydown="if(event.key === 'Enter') { this.blur(); }">
      </div>

      <!-- Actions -->
      <div class="site-actions">
        ${actionButtons}
      </div>
    `;

    // Append to corresponding column container
    if (site.cat === 'work') {
      sitesListWork.appendChild(card);
    } else if (site.cat === 'distract') {
      sitesListDistract.appendChild(card);
    } else {
      sitesListNone.appendChild(card);
    }
  });

  // If columns are empty, append standard placeholder message
  if (!hasWorkSites) sitesListWork.innerHTML = '<div class="empty-column-msg">이곳으로 유용한 사이트를 옮겨보세요.</div>';
  if (!hasDistractSites) sitesListDistract.innerHTML = '<div class="empty-column-msg">과제 중 딴짓한 기록이 이곳에 나타납니다.</div>';
  if (!hasNoneSites) sitesListNone.innerHTML = '<div class="empty-column-msg">타이머가 켜진 상태에서 방문한 사이트들이 이곳에 추가됩니다.</div>';

  // Render analytic values
  statWorkTime.textContent = formatSecondsToDuration(workTimeTotal);
  statDistractTime.textContent = formatSecondsToDuration(distractTimeTotal);
  statNoneTime.textContent = formatSecondsToDuration(noneTimeTotal);

  // Calculate Productive Time Ratio: workTime / (workTime + distractTime)
  const classifiedTotal = workTimeTotal + distractTimeTotal;
  let ratio = 0;
  if (classifiedTotal > 0) {
    ratio = Math.round((workTimeTotal / classifiedTotal) * 100);
  } else if (workTimeTotal > 0) {
    ratio = 100;
  }
  
  prodRatioText.textContent = `${ratio}%`;

  // Update SVG radial path dashoffset (Circumference = 2 * Math.PI * Radius = 2 * 3.14159 * 40 = 251.2)
  const offset = 251.2 - (ratio / 100) * 251.2;
  radialProgress.style.strokeDashoffset = offset;
  
  // Apply specific colors based on ratio index
  if (ratio > 70) {
    radialProgress.style.stroke = "var(--success)";
  } else if (ratio > 40) {
    radialProgress.style.stroke = "var(--primary)";
  } else {
    radialProgress.style.stroke = "var(--danger)";
  }

  lucide.replace();
}

// Global functions exposed to inline html events
window.moveSiteCategory = function(siteKey, newCat) {
  if (!currentUser || !activeTaskId) return;
  const userId = currentUser.uid;
  
  const siteRef = ref(db, `users/${userId}/tasks/${activeTaskId}/sites/${siteKey}`);
  update(siteRef, { cat: newCat === 'none' ? null : newCat })
    .catch(err => console.error("카테고리 이동 오류:", err));
};

window.updateSiteComment = function(siteKey, value) {
  if (!currentUser || !activeTaskId) return;
  const userId = currentUser.uid;
  const commentVal = value.trim();
  
  const siteRef = ref(db, `users/${userId}/tasks/${activeTaskId}/sites/${siteKey}`);
  update(siteRef, { cmt: commentVal || null })
    .catch(err => console.error("댓글 업로드 오류:", err));
};

// ==========================================================================
// Formatting Helpers & Clipboard copy
// ==========================================================================

function formatSecondsToTimer(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

function formatSecondsToDuration(totalSeconds) {
  if (totalSeconds === 0) return '0초';
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}초`);

  return parts.join(' ');
}

// Escape HTML entities for sanitization
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Clipboard copy sync key UID
btnCopySyncKey.addEventListener('click', () => {
  if (!currentUser) return;
  
  navigator.clipboard.writeText(currentUser.uid)
    .then(() => {
      const originalText = btnCopySyncKey.textContent;
      btnCopySyncKey.textContent = "복사됨!";
      btnCopySyncKey.classList.add('btn-success');
      btnCopySyncKey.classList.remove('btn-primary');
      
      setTimeout(() => {
        btnCopySyncKey.textContent = originalText;
        btnCopySyncKey.classList.remove('btn-success');
        btnCopySyncKey.classList.add('btn-primary');
      }, 2000);
    })
    .catch(err => alert("클립보드 복사 실패: " + err.message));
});
