// StudySync — fully merged app logic (all fixes integrated)
// - Auth validation & inline errors
// - UI polish: toasts, modal errors, modals auto-clear
// - Persistent dark-mode (per-user or guest) with safe init
// - Timer that persists across pages, credits minutes to active task/block
// - Tasks & Study Blocks CRUD persisted to currentUser or guest storage
// - Dashboard & Summary rendering (bar chart with Chart.js if available, fallback canvas)
// - Notifications (persisted, Clear All)
// - Settings form (editable subjects + save) and reliable Dark Mode / Logout wiring
// - Summary metrics auto-update (weekly study time, tasks, sessions)
// Replace your existing studysync.js with this file and hard-refresh (Ctrl/Cmd+Shift+R).
// Optional: include Chart.js in summary.html for better chart visuals:
// <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

document.addEventListener("DOMContentLoaded", () => {
  // -------------------------
  // Config / storage keys
  // -------------------------
  const USERS_KEY = "users";
  const CURRENT_KEY = "currentUser";
  const TIMER_KEY = "timerState";
  const GUEST_TASKS = "guest_tasks";
  const GUEST_BLOCKS = "guest_blocks";
  const GUEST_DARK = "darkMode";
  const NOTIF_KEY = "notifications";

  // -------------------------
  // Storage helpers
  // -------------------------
  const getUsers = () => JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  const saveUsers = u => localStorage.setItem(USERS_KEY, JSON.stringify(u));
  const setCurrentUser = u => localStorage.setItem(CURRENT_KEY, JSON.stringify(u));
  const getCurrentUser = () => JSON.parse(localStorage.getItem(CURRENT_KEY) || "null");
  const getGuestTasks = () => JSON.parse(localStorage.getItem(GUEST_TASKS) || "[]");
  const setGuestTasks = t => localStorage.setItem(GUEST_TASKS, JSON.stringify(t));
  const getGuestBlocks = () => JSON.parse(localStorage.getItem(GUEST_BLOCKS) || "[]");
  const setGuestBlocks = b => localStorage.setItem(GUEST_BLOCKS, JSON.stringify(b));
  const getNotifications = () => JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
  const setNotifications = n => localStorage.setItem(NOTIF_KEY, JSON.stringify(n));

  // -------------------------
  // App state
  // -------------------------
  let currentUser = getCurrentUser();
  let tasks = currentUser?.tasks ? [...currentUser.tasks] : [...getGuestTasks()];
  let studyBlocks = currentUser?.studyBlocks ? [...currentUser.studyBlocks] : [...getGuestBlocks()];

  // Timer state (seconds)
  let timerState = JSON.parse(localStorage.getItem(TIMER_KEY) || "null") || {
    mode: "focus",
    secondsLeft: 1500,
    running: false,
    lastTick: null,
    activeTaskId: null,
    activeBlockId: null,
    accumulatedSeconds: 0
  };

  // -------------------------
  // Small UI helpers: toasts & inline errors
  // -------------------------
  function ensureToastContainer() {
    let c = document.getElementById("toastContainer");
    if (!c) {
      c = document.createElement("div");
      c.id = "toastContainer";
      c.style.position = "fixed";
      c.style.right = "1rem";
      c.style.top = "1rem";
      c.style.zIndex = "9999";
      c.style.display = "flex";
      c.style.flexDirection = "column";
      c.style.gap = "0.5rem";
      document.body.appendChild(c);
    }
    return c;
  }
  function showToast(msg, timeout = 3500) {
    try {
      const c = ensureToastContainer();
      const t = document.createElement("div");
      t.textContent = msg;
      t.style.background = "linear-gradient(90deg,var(--primary),var(--accent))";
      t.style.color = "#fff";
      t.style.padding = ".5rem .75rem";
      t.style.borderRadius = "10px";
      t.style.boxShadow = "var(--shadow-sm)";
      t.style.fontWeight = "700";
      t.style.opacity = "1";
      c.appendChild(t);
      setTimeout(() => {
        t.style.transition = "opacity 300ms, transform 300ms";
        t.style.opacity = "0";
        t.style.transform = "translateY(-6px)";
        setTimeout(() => t.remove(), 320);
      }, timeout);
    } catch (e) { /* no-op */ }
  }

  function showFormError(id, message) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = message;
      el.style.display = "block";
      el.setAttribute("aria-hidden", "false");
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
      return;
    }
    showToast(message);
  }
  function clearFormError(id) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "";
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    }
  }

  function showModalError(modalEl, message) {
    if (!modalEl) { showToast(message); return; }
    const content = modalEl.querySelector(".modal-content") || modalEl;
    let err = content.querySelector(".modal-error");
    if (!err) {
      err = document.createElement("div");
      err.className = "modal-error";
      err.style.background = "#fff5f5";
      err.style.color = "#9b1c1c";
      err.style.padding = ".5rem .75rem";
      err.style.borderRadius = "8px";
      err.style.marginBottom = ".6rem";
      err.style.fontWeight = "700";
      content.insertBefore(err, content.firstChild);
    }
    err.textContent = message;
    err.style.display = "block";
  }
  function clearModalError(modalEl) {
    if (!modalEl) return;
    const content = modalEl.querySelector(".modal-content") || modalEl;
    const err = content.querySelector(".modal-error");
    if (err) { err.style.display = "none"; err.textContent = ""; }
  }

  // -------------------------
  // Dark mode getter/setter & safe init
  // -------------------------
  function getGlobalDark() {
    const u = getCurrentUser();
    if (u && typeof u.darkMode !== "undefined") return !!u.darkMode;
    const raw = localStorage.getItem(GUEST_DARK);
    return raw === null ? null : JSON.parse(raw);
  }
  function setGlobalDark(val) {
    const u = getCurrentUser();
    if (u) {
      u.darkMode = !!val;
      const users = getUsers();
      const idx = users.findIndex(x => x.email === u.email);
      if (idx !== -1) users[idx] = u; else users.push(u);
      saveUsers(users);
      setCurrentUser(u);
      currentUser = u;
    } else {
      localStorage.setItem(GUEST_DARK, JSON.stringify(!!val));
    }
    document.body.classList.toggle("dark-mode", !!val);
  }
  (function initTheme() {
    const guestRaw = localStorage.getItem(GUEST_DARK);
    const guestPrefExists = guestRaw !== null;
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null');
    if (user && typeof user.darkMode !== 'undefined') {
      document.body.classList.toggle('dark-mode', !!user.darkMode);
    } else if (guestPrefExists) {
      try { document.body.classList.toggle('dark-mode', JSON.parse(guestRaw)); } catch { document.body.classList.remove('dark-mode'); }
    } else {
      document.body.classList.remove('dark-mode');
    }
  })();

  // -------------------------
  // Notifications persistence & render
  // -------------------------
  function pushNotification(text) {
    const arr = getNotifications();
    arr.unshift({ id: Date.now(), text, time: new Date().toISOString(), read: false });
    setNotifications(arr);
    renderNotifications();
  }
  function renderNotifications() {
    const el = document.getElementById("notificationList");
    if (!el) return;
    const arr = getNotifications();
    if (!arr.length) { el.innerHTML = "<li class='empty'>No notifications yet.</li>"; return; }
    el.innerHTML = "";
    arr.forEach(n => {
      const li = document.createElement("li");
      li.style.padding = ".6rem 0";
      li.innerHTML = `<div style="font-weight:700">${escapeHtml(n.text)}</div><div style="font-size:.85rem;color:var(--muted)">${new Date(n.time).toLocaleString()}</div>`;
      el.appendChild(li);
    });
  }
  window.clearNotifications = () => { localStorage.removeItem(NOTIF_KEY); renderNotifications(); };

  // -------------------------
  // Authoritative load/persist
  // -------------------------
  function loadAuthoritativeData() {
    currentUser = getCurrentUser();
    if (currentUser) {
      tasks = Array.isArray(currentUser.tasks) ? [...currentUser.tasks] : [];
      studyBlocks = Array.isArray(currentUser.studyBlocks) ? [...currentUser.studyBlocks] : [];
    } else {
      tasks = getGuestTasks();
      studyBlocks = getGuestBlocks();
    }
  }
  function persistData() {
    if (getCurrentUser()) {
      const u = getCurrentUser();
      u.tasks = tasks;
      u.studyBlocks = studyBlocks;
      const users = getUsers();
      const idx = users.findIndex(x => x.email === u.email);
      if (idx !== -1) users[idx] = u; else users.push(u);
      saveUsers(users);
      setCurrentUser(u);
      currentUser = u;
    } else {
      setGuestTasks(tasks);
      setGuestBlocks(studyBlocks);
    }
    renderAll();
  }
  function persistTimer() { localStorage.setItem(TIMER_KEY, JSON.stringify(timerState)); }

  // -------------------------
  // Auth validation (inline + lockout)
  // -------------------------
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const LOCK_KEY = 'loginLock';
  const ATTEMPTS_KEY = 'loginAttempts';
  const LOCK_DURATION_MS = 60_000;
  const ATTEMPT_THRESHOLD = 5;
  function handleFailedLoginAttempt() {
    try {
      const lock = JSON.parse(sessionStorage.getItem(LOCK_KEY) || 'null');
      const now = Date.now();
      if (lock && lock.until && now < lock.until) return;
      let attempts = Number(sessionStorage.getItem(ATTEMPTS_KEY) || 0);
      attempts = attempts + 1;
      sessionStorage.setItem(ATTEMPTS_KEY, String(attempts));
      if (attempts >= ATTEMPT_THRESHOLD) {
        const until = Date.now() + LOCK_DURATION_MS;
        sessionStorage.setItem(LOCK_KEY, JSON.stringify({ until }));
        showFormError('loginError', `Too many failed attempts. Try again in ${Math.ceil(LOCK_DURATION_MS/1000)}s.`);
      }
    } catch (e) {}
  }
  function checkLock() {
    try {
      const lock = JSON.parse(sessionStorage.getItem(LOCK_KEY) || 'null');
      if (!lock || !lock.until) return false;
      if (Date.now() > lock.until) { sessionStorage.removeItem(LOCK_KEY); sessionStorage.removeItem(ATTEMPTS_KEY); return false; }
      return true;
    } catch (e) { return false; }
  }

  // -------------------------
  // Timer logic
  // -------------------------
  let timerInterval = null;
  function syncTimerOnLoad() {
    const stored = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    if (stored) {
      timerState = stored;
      if (timerState.running && timerState.lastTick) {
        const now = Date.now();
        const diff = Math.floor((now - timerState.lastTick) / 1000);
        if (diff > 0) {
          timerState.secondsLeft = Math.max(0, timerState.secondsLeft - diff);
          timerState.accumulatedSeconds = (timerState.accumulatedSeconds || 0) + diff;
          timerState.lastTick = now;
        }
      }
    }
    persistTimer();
  }
  function updateTimerDisplay() {
    const timerDisplay = document.getElementById("timerDisplay");
    if (!timerDisplay) return;
    const m = Math.floor(timerState.secondsLeft / 60);
    const s = timerState.secondsLeft % 60;
    timerDisplay.textContent = `${m}:${s.toString().padStart(2,"0")}`;
  }
  function creditAccumulatedMinutes() {
    if (!timerState.accumulatedSeconds || timerState.accumulatedSeconds < 60) return;
    const mins = Math.floor(timerState.accumulatedSeconds / 60);
    timerState.accumulatedSeconds = timerState.accumulatedSeconds % 60;
    loadAuthoritativeData();
    let changed = false;
    if (timerState.activeTaskId) {
      const t = tasks.find(x => x.id === timerState.activeTaskId);
      if (t) { t.minutesSpent = (t.minutesSpent || 0) + mins; changed = true; pushNotification(`Credited ${mins}m to task "${t.title}"`); }
    }
    if (timerState.activeBlockId) {
      const b = studyBlocks.find(x => x.id === timerState.activeBlockId);
      if (b) { b.minutesSpent = (b.minutesSpent || 0) + mins; changed = true; pushNotification(`Credited ${mins}m to study block "${b.title}"`); }
    }
    if (changed) persistData();
  }
  function timerTick() {
    const now = Date.now();
    const diff = Math.floor((now - (timerState.lastTick || now)) / 1000);
    if (diff <= 0) { timerState.lastTick = now; persistTimer(); return; }
    timerState.secondsLeft = Math.max(0, timerState.secondsLeft - diff);
    timerState.lastTick = now;
    timerState.accumulatedSeconds = (timerState.accumulatedSeconds || 0) + diff;
    persistTimer();
    creditAccumulatedMinutes();
    updateTimerDisplay();
    if (timerState.secondsLeft <= 0) {
      timerState.running = false; timerState.lastTick = null; persistTimer(); clearInterval(timerInterval); timerInterval = null; pushNotification("Timer finished");
    }
  }
  function startTimer() { if (timerState.running) return; timerState.running = true; timerState.lastTick = Date.now(); persistTimer(); if (!timerInterval) timerInterval = setInterval(timerTick, 1000); updateTimerDisplay(); }
  function stopTimer() { timerState.running = false; persistTimer(); if (timerInterval) clearInterval(timerInterval); timerInterval = null; }

  // wire basic timer controls
  document.getElementById("startTimer")?.addEventListener("click", () => { if (!timerState.lastTick) timerState.lastTick = Date.now(); startTimer(); });
  document.getElementById("pauseTimer")?.addEventListener("click", () => stopTimer());
  document.querySelectorAll(".timer-modes button").forEach(btn => btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (mode === 'focus' || mode === 'short' || mode === 'long') {
      timerState.mode = mode;
      timerState.secondsLeft = mode === 'focus' ? 1500 : mode === 'short' ? 300 : 900;
      timerState.running = false; timerState.accumulatedSeconds = 0; timerState.lastTick = null; persistTimer(); updateTimerDisplay();
    }
  }));

  // inject custom timer controls
  (function injectCustomTimerControls() {
    const controls = document.querySelector('.timer-controls');
    if (!controls || document.getElementById('customMinutes')) return;
    const wrapper = document.createElement('div'); wrapper.style.display = 'flex'; wrapper.style.gap = '.5rem'; wrapper.style.alignItems = 'center'; wrapper.style.marginTop = '.5rem';
    const input = document.createElement('input'); input.id = 'customMinutes'; input.type = 'number'; input.min = '1'; input.placeholder = 'Custom min';
    input.style.width = '90px'; input.style.padding = '.4rem .6rem'; input.style.borderRadius = '8px'; input.style.border = '1px solid var(--border)';
    wrapper.appendChild(input);
    const setBtn = document.createElement('button'); setBtn.className = 'btn'; setBtn.type = 'button'; setBtn.textContent = 'Set Custom';
    setBtn.addEventListener('click', () => {
      const v = Number(input.value);
      if (!v || v <= 0) return showToast('Enter minutes > 0');
      timerState.mode = 'custom'; timerState.secondsLeft = Math.floor(v) * 60; timerState.running = false; timerState.lastTick = null; timerState.accumulatedSeconds = 0; persistTimer(); updateTimerDisplay();
    });
    wrapper.appendChild(setBtn);
    const resetBtn = document.createElement('button'); resetBtn.className = 'btn'; resetBtn.type = 'button'; resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => { timerState.mode = 'focus'; timerState.secondsLeft = 1500; timerState.running = false; timerState.lastTick = null; timerState.accumulatedSeconds = 0; persistTimer(); updateTimerDisplay(); });
    wrapper.appendChild(resetBtn);
    controls.appendChild(wrapper);
  })();

  syncTimerOnLoad();
  if (timerState.running && !timerInterval) { timerState.lastTick = Date.now(); persistTimer(); timerInterval = setInterval(timerTick, 1000); }
  updateTimerDisplay();

  // -------------------------
  // Elements & initial load
  // -------------------------
  loadAuthoritativeData();
  const taskListEl = document.getElementById("taskList") || document.getElementById("dashboardTaskList");
  const addTaskBtn = document.getElementById("addTaskBtn");
  const taskModal = document.getElementById("taskModal");
  const saveTaskBtn = document.getElementById("saveTaskBtn");
  const closeTaskModalBtn = document.getElementById("closeTaskModal");
  const taskTitleInput = document.getElementById("taskTitle");
  const taskSubjectInput = document.getElementById("taskSubject");
  const taskDateInput = document.getElementById("taskDate");
  const taskPriorityInput = document.getElementById("taskPriority");
  const taskSearchInput = document.getElementById("taskSearch");
  const priorityFilter = document.getElementById("priorityFilter");

  const blockListEl = document.getElementById("blockList");
  const addBlockBtn = document.getElementById("addBlockBtn");
  const blockModal = document.getElementById("blockModal");
  const saveBlockBtn = document.getElementById("saveBlockBtn");
  const closeBlockModalBtn = document.getElementById("closeBlockModal");
  const blockTitleInput = document.getElementById("blockTitle");
  const blockDateInput = document.getElementById("blockDate");
  const blockStartInput = document.getElementById("blockStart");
  const blockEndInput = document.getElementById("blockEnd");
  const blockSearchInput = document.getElementById("blockSearch");

  document.querySelectorAll('.modal').forEach(m => { m.classList.remove('show'); clearModalError(m); });

  // -------------------------
  // Auth wiring (inline errors)
  // -------------------------
  // Login form
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    document.getElementById("loginEmail")?.addEventListener("input", () => clearFormError('loginError'));
    document.getElementById("loginPassword")?.addEventListener("input", () => clearFormError('loginError'));
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (checkLock()) { showFormError('loginError', 'Too many failed attempts. Try again later.'); return; }
      const email = (document.getElementById("loginEmail")?.value || "").trim();
      const password = (document.getElementById("loginPassword")?.value || "");
      if (!email || !emailRegex.test(email)) { showFormError('loginError', 'Enter a valid email.'); return; }
      if (!password) { showFormError('loginError', 'Enter your password.'); return; }
      const users = getUsers();
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) { handleFailedLoginAttempt(); showFormError('loginError', 'Invalid email or password.'); return; }
      sessionStorage.removeItem(ATTEMPTS_KEY); sessionStorage.removeItem(LOCK_KEY);
      setCurrentUser(user); loadAuthoritativeData(); renderAll(); window.location.href = "dashboard.html";
    });
  }
  // Signup form
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    ['signupName','signupEmail','signupPassword'].forEach(id => document.getElementById(id)?.addEventListener('input', () => clearFormError('signupError')));
    signupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      clearFormError('signupError');
      const name = (document.getElementById("signupName")?.value || "").trim();
      const email = (document.getElementById("signupEmail")?.value || "").trim();
      const password = (document.getElementById("signupPassword")?.value || "");
      if (!name || name.length < 2) { showFormError('signupError', 'Enter name (min 2 chars)'); return; }
      if (!email || !emailRegex.test(email)) { showFormError('signupError', 'Enter a valid email'); return; }
      if (!password || password.length < 6) { showFormError('signupError', 'Password must be at least 6 chars'); return; }
      const users = getUsers();
      if (users.some(u => u.email === email)) { showFormError('signupError', 'User already exists'); return; }
      const newUser = { name, email, password, subjects: (document.getElementById("signupSubjects")?.value || ""), tasks: [], studyBlocks: [], darkMode: false };
      users.push(newUser); saveUsers(users); setCurrentUser(newUser); loadAuthoritativeData(); renderAll(); window.location.href = "dashboard.html";
    });
  }

  // -------------------------
  // Modal open/close + save actions (inline errors instead of alerts)
  // -------------------------
  if (addTaskBtn) addTaskBtn.addEventListener("click", () => {
    clearModalError(taskModal);
    if (taskTitleInput) taskTitleInput.value = "";
    if (taskSubjectInput) taskSubjectInput.value = "";
    if (taskDateInput) taskDateInput.value = "";
    if (taskPriorityInput) taskPriorityInput.value = "Low";
    taskModal?.classList.add("show"); taskTitleInput?.focus();
  });
  if (closeTaskModalBtn) closeTaskModalBtn.addEventListener("click", () => { clearModalError(taskModal); taskModal?.classList.remove("show"); });

  if (addBlockBtn) addBlockBtn.addEventListener("click", () => {
    clearModalError(blockModal);
    if (blockTitleInput) blockTitleInput.value = "";
    if (blockDateInput) blockDateInput.value = "";
    if (blockStartInput) blockStartInput.value = "";
    if (blockEndInput) blockEndInput.value = "";
    blockModal?.classList.add("show"); blockTitleInput?.focus();
  });
  if (closeBlockModalBtn) closeBlockModalBtn.addEventListener("click", () => { clearModalError(blockModal); blockModal?.classList.remove("show"); });

  if (saveTaskBtn) {
    saveTaskBtn.addEventListener("click", () => {
      clearModalError(taskModal);
      const title = (taskTitleInput?.value || "").trim();
      const subject = (taskSubjectInput?.value || "").trim();
      const date = taskDateInput?.value;
      const priority = taskPriorityInput?.value || "Low";
      if (!title || !date) { showModalError(taskModal, "Please fill required fields"); return; }
      const newTask = { id: Date.now(), title, subject, date, priority, completed: false, minutesSpent: 0 };
      tasks.push(newTask); persistData(); pushNotification(`Task added: "${newTask.title}"`);
      taskModal?.classList.remove("show"); if (taskTitleInput) taskTitleInput.value = ""; if (taskSubjectInput) taskSubjectInput.value = ""; if (taskDateInput) taskDateInput.value = ""; if (taskPriorityInput) taskPriorityInput.value = "Low";
    });
  }

  if (saveBlockBtn) {
    saveBlockBtn.addEventListener("click", () => {
      clearModalError(blockModal);
      const title = (blockTitleInput?.value || "").trim();
      const date = blockDateInput?.value;
      const start = blockStartInput?.value; const end = blockEndInput?.value;
      if (!title || !date || !start || !end) { showModalError(blockModal, "Please fill all fields"); return; }
      const newBlock = { id: Date.now(), title, date, start, end, minutesSpent: 0 };
      studyBlocks.push(newBlock); persistData(); pushNotification(`Study block added: "${newBlock.title}"`);
      blockModal?.classList.remove("show"); if (blockTitleInput) blockTitleInput.value = ""; if (blockDateInput) blockDateInput.value = ""; if (blockStartInput) blockStartInput.value = ""; if (blockEndInput) blockEndInput.value = "";
    });
  }

  // -------------------------
  // Renderers
  // -------------------------
  function renderTasks() {
    loadAuthoritativeData();
    const el = taskListEl; if (!el) return;
    let filtered = [...tasks];
    const search = (taskSearchInput?.value || "").toLowerCase();
    if (search) filtered = filtered.filter(t => (t.title||"").toLowerCase().includes(search) || (t.subject||"").toLowerCase().includes(search));
    const priority = priorityFilter?.value || "all";
    if (priority !== "all") filtered = filtered.filter(t => (t.priority||"").toLowerCase() === priority.toLowerCase());
    filtered.sort((a,b) => new Date(b.date) - new Date(a.date));

    if (el.tagName === "UL" || el.tagName === "DIV") {
      el.innerHTML = "";
      if (!filtered.length) return el.innerHTML = "<li class='empty'>No tasks found</li>";
      filtered.forEach(t => {
        const li = document.createElement("li"); li.className = "list-item";
        li.innerHTML = `
          <div>
            <strong>${escapeHtml(t.title)}</strong>
            <div class="meta">
              <span class="badge">${escapeHtml(t.priority || "")}</span>
              <span style="margin-left:.5rem;color:var(--muted)">${escapeHtml(t.date)}</span>
              <span style="margin-left:.75rem;color:var(--muted);font-weight:600">${(t.minutesSpent||0)}m</span>
            </div>
          </div>
          <div class="actions">
            <button class="btn" data-id="${t.id}" data-action="start-task">Start</button>
            <input type="checkbox" data-id="${t.id}" class="inline-toggle" ${t.completed ? "checked" : ""}/>
            <button data-id="${t.id}" class="inline-delete">✕</button>
          </div>`;
        el.appendChild(li);
      });
      return;
    }

    if (el.tagName === "TBODY") {
      el.innerHTML = "";
      if (!filtered.length) return el.innerHTML = "<tr class='empty'><td colspan='4'>No tasks found</td></tr>";
      filtered.forEach(t => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.subject || "")}</td><td>${escapeHtml(t.date)}</td>
          <td>
            <button class="btn" data-id="${t.id}" data-action="start-task">Start</button>
            <input type="checkbox" class="toggle-task" data-id="${t.id}" ${t.completed ? "checked" : ""}>
            <button class="delete-task" data-id="${t.id}">✕</button>
            <div style="font-size:.9rem;color:var(--muted)">${(t.minutesSpent||0)}m</div>
          </td>`;
        el.appendChild(tr);
      });
    }
  }

  function renderBlocks() {
    loadAuthoritativeData();
    const el = blockListEl; if (!el) return;
    let filtered = [...studyBlocks];
    const search = (blockSearchInput?.value || "").toLowerCase();
    if (search) filtered = filtered.filter(b => (b.title||"").toLowerCase().includes(search));
    filtered.sort((a,b) => new Date(`${a.date}T${a.start}`) - new Date(`${b.date}T${b.start}`));

    if (el.tagName === "UL" || el.tagName === "DIV") {
      el.innerHTML = "";
      if (!filtered.length) return el.innerHTML = "<li class='empty'>No study sessions</li>";
      filtered.forEach(b => {
        const li = document.createElement("li"); li.className = "list-item";
        li.innerHTML = `
          <div>
            <strong>${escapeHtml(b.title)}</strong>
            <div class="meta">
              <span class="badge">${escapeHtml(b.date)}</span>
              <span style="margin-left:.5rem;color:var(--muted)">${escapeHtml(b.start)} - ${escapeHtml(b.end)}</span>
              <span style="margin-left:.75rem;color:var(--muted);font-weight:600">${(b.minutesSpent||0)}m</span>
            </div>
          </div>
          <div class="actions">
            <button class="btn" data-id="${b.id}" data-action="start-block">Start</button>
            <button data-id="${b.id}" class="inline-delete-block">✕</button>
          </div>`;
        el.appendChild(li);
      });
      return;
    }

    if (el.tagName === "TBODY") {
      el.innerHTML = "";
      if (!filtered.length) return el.innerHTML = "<tr class='empty'><td colspan='3'>No study sessions</td></tr>";
      filtered.forEach(b => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(b.title)}</td><td>${escapeHtml(b.date)}</td><td>${escapeHtml(b.start)} - ${escapeHtml(b.end)} <button class="delete-block" data-id="${b.id}">✕</button><div style="font-size:.9rem;color:var(--muted)">${(b.minutesSpent||0)}m</div></td>`;
        el.appendChild(tr);
      });
    }
  }

  // -------------------------
  // Dashboard & Summary render (bar chart)
  // -------------------------
  const dashboardTaskList = document.getElementById("dashboardTaskList");
  const upcomingSessionEl = document.getElementById("upcomingSession");
  const taskCompletionEl = document.getElementById("taskCompletion");
  const studyTimeEl = document.getElementById("studyTime");
  const productivityEl = document.getElementById("productivity");

  function renderDashboardTasks() {
    if (!dashboardTaskList) return;
    loadAuthoritativeData();
    const todayKey = new Date().toISOString().split("T")[0];
    const todayTasks = tasks.filter(t => t.date === todayKey);
    dashboardTaskList.innerHTML = "";
    if (!todayTasks.length) return dashboardTaskList.innerHTML = "<li class='empty'>No tasks today</li>";
    todayTasks.forEach(task => {
      const li = document.createElement("li");
      li.textContent = `${task.title} (${task.subject || ""}) `;
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = task.completed;
      checkbox.addEventListener("change", () => {
        task.completed = checkbox.checked;
        if (task.completed && timerState.activeTaskId === task.id) {
          stopTimer(); timerState.activeTaskId = null; persistTimer(); pushNotification(`Stopped timer because task "${task.title}" was completed`);
        }
        persistData(); pushNotification(`Task ${task.title} marked ${task.completed ? "completed" : "incomplete"}`); calculateDashboardStats();
      });
      li.appendChild(checkbox); dashboardTaskList.appendChild(li);
    });
  }

  function renderDashboardBlocks() {
    if (!upcomingSessionEl) return;
    loadAuthoritativeData();
    const now = new Date(); const next24h = new Date(now.getTime() + 24*60*60*1000);
    const upcoming = studyBlocks.filter(b => new Date(`${b.date}T${b.start}`) > now && new Date(`${b.date}T${b.start}`) <= next24h)
      .sort((a,b)=> new Date(`${a.date}T${a.start}`)-new Date(`${b.date}T${b.start}`));
    upcomingSessionEl.textContent = upcoming.length ? `${upcoming[0].title} at ${upcoming[0].start}` : "None scheduled";
  }

  function calculateDashboardStats() {
    loadAuthoritativeData();
    if (!taskCompletionEl || !studyTimeEl || !productivityEl) return;
    const todayKey = new Date().toISOString().split("T")[0];
    const todayTasks = tasks.filter(t=> t.date === todayKey);
    const completedTasks = todayTasks.filter(t=> t.completed).length;
    const totalTasks = todayTasks.length;
    const taskCompletion = totalTasks ? Math.round((completedTasks/totalTasks)*100):0;
    const todayStudyTimeBlocks = studyBlocks.filter(b=> b.date===todayKey).reduce((sum,b)=> sum + (b.minutesSpent||0), 0);
    const todayStudyTimeTasks = tasks.filter(t=> t.date===todayKey).reduce((sum,t)=> sum + (t.minutesSpent||0), 0);
    const todayStudyMinutes = todayStudyTimeBlocks + todayStudyTimeTasks;
    const hours = Math.floor(todayStudyMinutes / 60);
    const mins = Math.floor(todayStudyMinutes % 60);
    taskCompletionEl.textContent = `${taskCompletion}%`;
    studyTimeEl.textContent = `${hours}h ${String(mins).padStart(2,'0')}m`;
    productivityEl.textContent = `${taskCompletion}%`;
  }

  function renderSummary() {
    loadAuthoritativeData();
    const tbody = document.getElementById("summaryTableBody");
    if (tbody) {
      tbody.innerHTML = "";
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        const dayTasks = tasks.filter(t => t.date === key);
        const minutes = studyBlocks.filter(b => b.date === key).reduce((s,b)=> s + (b.minutesSpent||0), 0)
          + dayTasks.reduce((s,t)=> s + (t.minutesSpent||0), 0);
        const completed = dayTasks.filter(t => t.completed).length;
        const total = dayTasks.length;
        const productivity = total ? Math.round((completed/total)*100) : 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${key.slice(5)}</td><td>${productivity}%</td><td>${completed}/${total}</td><td>${minutes}</td>`;
        tbody.appendChild(tr);
      }
    }

    const canvas = document.getElementById("progressChart");
    if (!canvas) return;
    try {
      const parent = canvas.parentElement;
      if (parent) parent.style.minHeight = parent.style.minHeight || "240px";
      canvas.style.height = canvas.style.height || "240px";
    } catch {}
    const labels = []; const dataArr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const key = d.toISOString().split("T")[0];
      labels.push(key.slice(5));
      const mins = studyBlocks.filter(b => b.date === key).reduce((s,b)=> s + (b.minutesSpent||0), 0)
        + tasks.filter(t => t.date === key).reduce((s,t)=> s + (t.minutesSpent||0), 0);
      dataArr.push(mins);
    }

    if (window.Chart) {
      if (canvas._chartInstance && canvas._chartInstance.destroy) {
        try { canvas._chartInstance.destroy(); } catch {}
        canvas._chartInstance = null;
      }
      const ctx = canvas.getContext('2d');
      canvas._chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes studied', data: dataArr, backgroundColor: 'rgba(91,124,255,0.9)', borderColor: 'rgba(59,90,200,0.95)', borderWidth: 1 }]},
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { display: true, title: { display: true, text: 'Date (MM-DD)' } },
            y: { display: true, title: { display: true, text: 'Minutes (max 24h)' }, suggestedMin: 0, suggestedMax: 1440, ticks: { stepSize: 240, callback: v => `${Math.floor(v/60)}h` } }
          },
          plugins: { tooltip: { callbacks: { label: ctx => { const mins = ctx.raw; const h = Math.floor(mins/60); const m = mins%60; return ` ${h}h ${m}m (${mins} min)`; } } } }
        }
      });
    } else {
      try {
        const ctx = canvas.getContext('2d');
        const dpi = devicePixelRatio || 1; canvas.width = canvas.clientWidth * dpi; canvas.height = canvas.clientHeight * dpi; ctx.scale(dpi, dpi);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        ctx.clearRect(0,0,w,h);
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#6b7280'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(60,10); ctx.lineTo(60,h-30); ctx.lineTo(w-10,h-30); ctx.stroke();
        const max = 1440; const barAreaWidth = w - 80; const slot = barAreaWidth / dataArr.length; const barWidth = slot * 0.6;
        dataArr.forEach((val,i) => {
          const x = 60 + (slot * i) + (slot - barWidth) / 2;
          const y = (h-30) - ((h-50) * (val / max));
          ctx.fillStyle = 'rgba(91,124,255,0.9)'; ctx.fillRect(x, y, barWidth, h-30-y);
          ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#6b7280';
          ctx.fillText(labels[i], x, h-8);
        });
      } catch(e){}
    }
  }

  // -------------------------
  // Delegated interactions for lists (start/delete/complete)
  // -------------------------
  if (taskListEl) {
    taskListEl.addEventListener("click", (e) => {
      const startBtn = e.target.closest('button[data-action="start-task"]');
      if (startBtn) {
        const id = Number(startBtn.dataset.id);
        timerState.activeTaskId = id;
        if (!timerState.running) { timerState.running = true; timerState.lastTick = Date.now(); timerInterval = setInterval(timerTick,1000); }
        else timerState.lastTick = Date.now();
        persistTimer(); pushNotification(`Started timer for task ID ${id}`); renderTasks(); return;
      }
      const del = e.target.closest('.inline-delete, .delete-task');
      if (del && del.dataset.id) {
        const id = Number(del.dataset.id);
        const removed = tasks.find(t => t.id === id);
        tasks = tasks.filter(t => t.id !== id);
        if (timerState.activeTaskId === id) { stopTimer(); timerState.activeTaskId = null; persistTimer(); }
        persistData(); pushNotification(`Deleted task "${removed?.title || id}"`);
      }
    });
    taskListEl.addEventListener("change", (e) => {
      const cb = e.target.closest('.toggle-task, .inline-toggle');
      if (cb && cb.dataset.id) {
        const id = Number(cb.dataset.id);
        const t = tasks.find(x => x.id === id);
        if (t) {
          t.completed = !!cb.checked;
          if (t.completed && timerState.activeTaskId === t.id) { stopTimer(); timerState.activeTaskId = null; persistTimer(); pushNotification(`Stopped timer because task "${t.title}" was completed`); }
          persistData(); pushNotification(`Task "${t.title}" marked ${t.completed ? "completed" : "incomplete"}`);
        }
      }
    });
  }

  if (blockListEl) {
    blockListEl.addEventListener("click", (e) => {
      const startBtn = e.target.closest('button[data-action="start-block"]');
      if (startBtn) {
        const id = Number(startBtn.dataset.id);
        timerState.activeBlockId = id;
        if (!timerState.running) { timerState.running = true; timerState.lastTick = Date.now(); timerInterval = setInterval(timerTick,1000); }
        else timerState.lastTick = Date.now();
        persistTimer(); pushNotification(`Started timer for block ID ${id}`); renderBlocks(); return;
      }
      const del = e.target.closest('.inline-delete-block, .delete-block');
      if (del && del.dataset.id) {
        const id = Number(del.dataset.id);
        const removed = studyBlocks.find(b => b.id === id);
        studyBlocks = studyBlocks.filter(b => b.id !== id);
        if (timerState.activeBlockId === id) { stopTimer(); timerState.activeBlockId = null; persistTimer(); }
        persistData(); pushNotification(`Deleted study block "${removed?.title || id}"`);
      }
    });
  }

  // -------------------------
  // Summary metrics & Settings form (merged)
  // - updateSummaryMetrics updates three summary cards
  // - initSettingsForm creates/uses #userSubjectsInput and wires save
  // -------------------------
  function readAuthoritativeData() {
    const cur = getCurrentUser();
    if (cur) return { tasks: cur.tasks || [], blocks: cur.studyBlocks || [] };
    return { tasks: getGuestTasks(), blocks: getGuestBlocks() };
  }

  function updateSummaryMetrics() {
    try {
      const { tasks: sTasks, blocks: sBlocks } = readAuthoritativeData();
      const dates = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); dates.push(d.toISOString().split("T")[0]); }
      let weeklyMinutes = 0;
      dates.forEach(key => {
        weeklyMinutes += sBlocks.filter(b => b.date === key).reduce((s,b)=> s + (b.minutesSpent||0), 0);
        weeklyMinutes += sTasks.filter(t => t.date === key).reduce((s,t)=> s + (t.minutesSpent||0), 0);
      });
      const weeklyCompleted = sTasks.filter(t => dates.includes(t.date) && t.completed).length;
      const weeklySessions = sBlocks.filter(b => dates.includes(b.date)).length;
      const weeklyStudyEl = document.getElementById("weeklyStudyTime");
      if (weeklyStudyEl) { const h = Math.floor(weeklyMinutes/60); const m = weeklyMinutes % 60; weeklyStudyEl.textContent = `${h}h ${String(m).padStart(2,'0')}m`; }
      const weeklyTasksEl = document.getElementById("weeklyTasksCompleted"); if (weeklyTasksEl) weeklyTasksEl.textContent = String(weeklyCompleted);
      const weeklySessionsEl = document.getElementById("weeklySessions"); if (weeklySessionsEl) weeklySessionsEl.textContent = String(weeklySessions);
      // dashboard small cards too
      calculateDashboardStats();
    } catch (e) { console.error("updateSummaryMetrics error", e); }
  }

  function initSettingsForm() {
    // Support two variants:
    // - settings.html has #userName, #userEmail, and #userSubjects container (div) OR #userSubjectsInput textarea
    // - Save button expected: #saveSettingsBtn (create if missing)
    const nameIn = document.getElementById("userName");
    const emailIn = document.getElementById("userEmail");
    let subjIn = document.getElementById("userSubjectsInput");
    const subjContainer = document.getElementById("userSubjects");
    let saveBtn = document.getElementById("saveSettingsBtn");

    // If there's a container but no input, create a textarea
    if (!subjIn && subjContainer) {
      subjIn = document.createElement("textarea");
      subjIn.id = "userSubjectsInput";
      subjIn.placeholder = "Subjects (comma separated)";
      subjIn.style.width = "100%";
      subjIn.style.minHeight = "56px";
      subjIn.style.padding = ".6rem .7rem";
      subjContainer.appendChild(subjIn);
    }

    // If save button missing, create one near the container
    if (!saveBtn && (nameIn || subjContainer)) {
      saveBtn = document.createElement("button");
      saveBtn.id = "saveSettingsBtn";
      saveBtn.className = "btn primary";
      saveBtn.textContent = "Save Changes";
      const parent = (subjContainer && subjContainer.parentElement) || (nameIn && nameIn.parentElement);
      if (parent) parent.appendChild(saveBtn);
    }
    if (!nameIn || !emailIn || !subjIn || !saveBtn) return;

    const cur = getCurrentUser();
    if (cur) {
      nameIn.value = cur.name || "";
      emailIn.value = cur.email || "";
      subjIn.value = cur.subjects || (cur.subjects === "" ? "" : (cur.subjects || ""));
      nameIn.disabled = false; emailIn.disabled = false; subjIn.disabled = false; saveBtn.disabled = false;
    } else {
      nameIn.value = ""; emailIn.value = ""; subjIn.value = ""; nameIn.disabled = true; emailIn.disabled = true; subjIn.disabled = true; saveBtn.disabled = true;
    }

    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const user = getCurrentUser();
      if (!user) { showToast("You must be logged in to change settings"); return; }
      const newName = (nameIn.value || "").trim(); const newEmail = (emailIn.value || "").trim(); const newSubjects = (subjIn.value || "").trim();
      if (!newName || !emailRegex.test(newEmail)) { showToast("Please provide a valid name and email"); return; }
      const users = getUsers(); const idx = users.findIndex(u => u.email === user.email);
      user.name = newName; user.email = newEmail; user.subjects = newSubjects;
      if (idx !== -1) users[idx] = user; else users.push(user);
      saveUsers(users); setCurrentUser(user); showToast("Settings saved");
      loadAuthoritativeData(); renderAll();
    });
  }

  // Wire Dark Mode & Logout robustly (in case original handlers failed)
  document.body.addEventListener("click", (ev) => {
    const dm = ev.target.closest("#darkModeToggle");
    if (dm) { ev.preventDefault(); const cur = getGlobalDark(); setGlobalDark(!cur); showToast(getGlobalDark() ? "Dark mode on" : "Dark mode off"); return; }
    const lo = ev.target.closest("#logoutBtn");
    if (lo) { ev.preventDefault(); localStorage.removeItem(CURRENT_KEY); loadAuthoritativeData(); showToast("Logged out"); setTimeout(()=> window.location.href = "index.html", 250); return; }
  });

  // -------------------------
  // Orchestrator & watchers
  // -------------------------
  function renderAll() {
    loadAuthoritativeData();
    renderTasks(); renderBlocks(); renderDashboardTasks(); renderDashboardBlocks(); calculateDashboardStats(); renderSummary(); renderNotifications(); updateTimerDisplay();
  }

  // initial render
  renderAll();

  // settings: init (idempotent)
  initSettingsForm();

  // auto-update summary metrics periodically and on storage/focus
  updateSummaryMetrics();
  setInterval(updateSummaryMetrics, 2000);
  window.addEventListener("storage", (e) => { if ([USERS_KEY, GUEST_TASKS, GUEST_BLOCKS, TIMER_KEY].includes(e.key)) updateSummaryMetrics(); });
  window.addEventListener("focus", updateSummaryMetrics);

  // watchers for task/block search and filters
  document.getElementById("taskSearch")?.addEventListener("input", renderTasks);
  document.getElementById("priorityFilter")?.addEventListener("change", renderTasks);
  document.getElementById("blockSearch")?.addEventListener("input", renderBlocks);

  // expose debug API
  window.__studysync = {
    reload: () => { loadAuthoritativeData(); renderAll(); },
    getState: () => ({ currentUser: getCurrentUser(), timerState, tasks, studyBlocks, notifications: getNotifications() })
  };

  // safety helper functions used above
  function escapeHtml(s) { if (typeof s !== "string") return s || ""; return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
});