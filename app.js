'use strict';

/* ==========================================================================
   Registrar — Student Records UI
   Talks to the FastAPI endpoints:
     GET    /students?course&sort_by&order&page&limit
     GET    /student/{id}
     POST   /CreateStudent
     PUT    /UpdateStudent/{id}
     DELETE /DeleteStudent/{id}
   ========================================================================== */

/* ---------- Constants ---------- */
const SORT_FIELDS = ['marks', 'age', 'name'];
const EDITABLE_FIELDS = ['name', 'age', 'email', 'course', 'marks'];
const STORAGE_KEY = 'registrar:settings:v1';
const DEFAULTS = Object.freeze({ baseUrl: 'http://127.0.0.1:8000', demo: false, limit: 10 });
const REQUEST_TIMEOUT = 10000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- Icons ---------- */
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4.2a3.5 3.5 0 0 1 0 6.6"/><path d="M22 21a6 6 0 0 0-4-5.6"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
};

const icon = (name, size = 18) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((node) => {
    node.outerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 18);
  });
}

/* ---------- Settings persistence ---------- */
const storage = {
  load() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  },
  save(values) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* storage unavailable */ }
  },
};

/* ---------- State ---------- */
const saved = storage.load();
const state = {
  baseUrl: saved.baseUrl,
  demo: Boolean(saved.demo),
  limit: [5, 10, 20, 50].includes(Number(saved.limit)) ? Number(saved.limit) : DEFAULTS.limit,
  course: '',
  sortBy: '',
  order: 'asc',
  page: 1,
  total: 0,
  students: [],
  courses: [],
  offline: false,
  loadedOnce: false,
  reqId: 0,
  editing: null,
  viewing: null,
  pendingDelete: null,
};

const persist = () => storage.save({ baseUrl: state.baseUrl, demo: state.demo, limit: state.limit });

/* ---------- DOM ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

hydrateIcons();

const el = {
  panel: $('#panel'),
  statusPill: $('#statusPill'),
  statusText: $('#statusPill .status-text'),
  settingsBtn: $('#settingsBtn'),
  newBtn: $('#newBtn'),
  today: $('#todayLabel'),

  statTotal: $('#statTotal'),
  statTotalFoot: $('#statTotalFoot'),
  statAvg: $('#statAvg'),
  statAvgBar: $('#statAvgBar'),
  statTop: $('#statTop'),
  statTopFoot: $('#statTopFoot'),
  statCourses: $('#statCourses'),
  statCoursesFoot: $('#statCoursesFoot'),

  lookupForm: $('#lookupForm'),
  lookupInput: $('#lookupInput'),
  courseInput: $('#courseInput'),
  courseClear: $('#courseClear'),
  courseList: $('#courseList'),
  sortSelect: $('#sortSelect'),
  orderBtn: $('#orderBtn'),
  limitSelect: $('#limitSelect'),
  refreshBtn: $('#refreshBtn'),
  chips: $('#chips'),

  table: $('#table'),
  tbody: $('#tbody'),
  empty: $('#empty'),
  pagerInfo: $('#pagerInfo'),
  pager: $('#pager'),

  formDialog: $('#formDialog'),
  form: $('#studentForm'),
  formEyebrow: $('#formEyebrow'),
  formTitle: $('#formTitle'),
  formBanner: $('#formBanner'),
  formSubmit: $('#formSubmit'),
  fId: $('#f-id'),
  fName: $('#f-name'),
  fAge: $('#f-age'),
  fEmail: $('#f-email'),
  fCourse: $('#f-course'),
  fMarks: $('#f-marks'),
  fMarksRange: $('#f-marks-range'),
  gradePreview: $('#gradePreview'),

  drawer: $('#detailDrawer'),
  detailBody: $('#detailBody'),

  confirmDialog: $('#confirmDialog'),
  confirmText: $('#confirmText'),
  confirmBtn: $('#confirmBtn'),

  settingsDialog: $('#settingsDialog'),
  settingsForm: $('#settingsForm'),
  sUrl: $('#s-url'),
  sDemo: $('#s-demo'),
  sTest: $('#s-test'),
  sResult: $('#s-result'),
  sReset: $('#s-reset'),
  sCopy: $('#s-copy'),
  corsSnippet: $('#corsSnippet'),

  toasts: $('#toasts'),
};

/* ---------- Utilities ---------- */
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function gradeOf(marks) {
  const m = Number(marks);
  if (m >= 90) return 'A+';
  if (m >= 80) return 'A';
  if (m >= 70) return 'B';
  if (m >= 60) return 'C';
  return 'F';
}
const gradeKey = (grade) => ({ 'A+': 'aplus', A: 'a', B: 'b', C: 'c', F: 'f' }[grade]);

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function hueFor(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

/* Mirrors Python's str.title() closely enough for names */
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

function animateNumber(node, to, { decimals = 0, duration = 900 } = {}) {
  const from = Number(node.dataset.value || 0);
  node.dataset.value = String(to);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
    node.textContent = to.toFixed(decimals);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = (from + (to - from) * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Validation (mirrors the Pydantic models) ---------- */
function validateStudent(data, { partial = false } = {}) {
  const errors = {};
  const check = (key, fn) => {
    if (partial && data[key] === undefined) return;
    const msg = fn(data[key]);
    if (msg) errors[key] = msg;
  };
  const intIn = (v, lo, hi, label) => {
    if (isBlank(v)) return `${label} is required`;
    const n = Number(v);
    if (!Number.isInteger(n)) return `${label} must be a whole number`;
    if (n < lo || n > hi) return `${label} must be between ${lo} and ${hi}`;
    return '';
  };

  if (!partial) {
    check('id', (v) => {
      if (isBlank(v)) return 'Student ID is required';
      if (!/^[A-Za-z0-9_-]{1,50}$/.test(String(v).trim())) return 'Use letters, numbers, “-” or “_” (max 50)';
      return '';
    });
  }
  check('name', (v) => {
    if (isBlank(v)) return 'Name is required';
    const s = String(v);
    if (s.length < 2 || s.length > 50) return 'Name must be 2–50 characters';
    if (!/^\p{L}+$/u.test(s.replace(/ /g, ''))) return 'Name must contain only letters and spaces';
    return '';
  });
  check('age', (v) => intIn(v, 1, 100, 'Age'));
  check('email', (v) => {
    if (isBlank(v)) return 'Email is required';
    if (!EMAIL_RE.test(String(v).trim())) return 'Enter a valid email address';
    return '';
  });
  check('course', (v) => {
    if (isBlank(v)) return 'Course is required';
    if (String(v).length > 50) return 'Course must be at most 50 characters';
    return '';
  });
  check('marks', (v) => intIn(v, 0, 100, 'Marks'));
  return errors;
}

/* ---------- Errors ---------- */
const cleanMsg = (m) => String(m || 'Invalid value').replace(/^Value error,\s*/i, '');

function formatDetail(detail) {
  if (detail == null) return 'Unexpected error';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
        return field ? `${field}: ${cleanMsg(d.msg)}` : cleanMsg(d.msg);
      })
      .join(' · ');
  }
  try { return JSON.stringify(detail); } catch { return 'Unexpected error'; }
}

function detailToFieldErrors(detail) {
  const out = {};
  if (!Array.isArray(detail)) return out;
  for (const d of detail) {
    const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null;
    if (typeof field === 'string' && !out[field]) out[field] = cleanMsg(d.msg);
  }
  return out;
}

class ApiError extends Error {
  constructor(status, detail) {
    super(formatDetail(detail));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/* ---------- HTTP client ---------- */
const http = {
  async request(method, path, { query, body, baseUrl = state.baseUrl } = {}) {
    let url;
    try {
      url = new URL(path.replace(/^\//, ''), String(baseUrl).trim().replace(/\/*$/, '/'));
    } catch {
      throw new ApiError(0, `“${baseUrl}” is not a valid URL.`);
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    let res;
    try {
      res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(0, err.name === 'AbortError'
        ? 'The request timed out.'
        : 'Could not reach the API. Make sure the server is running and CORS is enabled.');
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = raw; }
    }
    if (!res.ok) {
      const detail = data && typeof data === 'object' && 'detail' in data
        ? data.detail
        : (res.statusText || `Request failed (${res.status})`);
      throw new ApiError(res.status, detail);
    }
    return data;
  },
  list: (query) => http.request('GET', '/students', { query }),
  get: (id) => http.request('GET', `/student/${encodeURIComponent(id)}`),
  create: (body) => http.request('POST', '/CreateStudent', { body }),
  update: (id, body) => http.request('PUT', `/UpdateStudent/${encodeURIComponent(id)}`, { body }),
  remove: (id) => http.request('DELETE', `/DeleteStudent/${encodeURIComponent(id)}`),
};

/* ---------- Demo backend (same rules and messages as the FastAPI app) ---------- */
const demo = (() => {
  const SEED = [
    ['S001', 'Ananya Iyer', 21, 'Python', 94],
    ['S002', 'Rohan Mehta', 22, 'Data Science', 87],
    ['S003', 'Kavya Sharma', 20, 'Python', 78],
    ['S004', 'Arjun Patel', 23, 'Web Development', 65],
    ['S005', 'Meera Nair', 21, 'Data Science', 91],
    ['S006', 'Vikram Rao', 24, 'Machine Learning', 58],
    ['S007', 'Isha Kapoor', 20, 'Web Development', 82],
    ['S008', 'Aditya Verma', 22, 'Python', 71],
    ['S009', 'Sara Thomas', 21, 'Machine Learning', 96],
    ['S010', 'Nikhil Joshi', 23, 'Data Science', 49],
    ['S011', 'Priya Das', 19, 'Web Development', 88],
    ['S012', 'Karan Malhotra', 22, 'Python', 63],
  ].map(([id, name, age, course, marks]) => ({
    id, name, age, course, marks,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
  }));

  const db = new Map();
  const reset = () => {
    db.clear();
    SEED.forEach((s) => db.set(s.id, { ...s }));
  };
  reset();

  const wait = () => new Promise((r) => setTimeout(r, 160 + Math.random() * 220));
  const clone = (s) => ({ ...s });
  const fail422 = (errors) => {
    throw new ApiError(422, Object.entries(errors).map(([field, msg]) => ({ loc: ['body', field], msg, type: 'value_error' })));
  };
  const emailTaken = (email, exceptId) => [...db.values()].some((s) => s.email === email && s.id !== exceptId);

  return {
    reset,
    async list({ course, sort_by, order = 'asc', page = 1, limit = 2 } = {}) {
      await wait();
      page = Number(page);
      limit = Number(limit);
      if (sort_by && !SORT_FIELDS.includes(sort_by)) {
        throw new ApiError(400, `Invalid sort_by '${sort_by}', Choose from ${JSON.stringify(SORT_FIELDS)}`);
      }
      if (!['asc', 'desc'].includes(order)) {
        throw new ApiError(400, `Invalid order '${order}', Choose from ["asc", "desc"]`);
      }
      let rows = [...db.values()];
      if (course) rows = rows.filter((s) => s.course.toLowerCase() === String(course).toLowerCase());
      const total = rows.length;
      const dir = order === 'desc' ? -1 : 1;
      if (sort_by) {
        rows.sort((a, b) => {
          const x = a[sort_by];
          const y = b[sort_by];
          return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
        });
      } else {
        rows.sort((a, b) => a.id.localeCompare(b.id));
      }
      const start = (page - 1) * limit;
      return { page, limit, total_students: total, students: rows.slice(start, start + limit).map(clone) };
    },
    async get(id) {
      await wait();
      const s = db.get(id);
      if (!s) throw new ApiError(404, `Student with the Id '${id}' not found`);
      return clone(s);
    },
    async create(body) {
      await wait();
      const errors = validateStudent(body);
      if (Object.keys(errors).length) fail422(errors);
      if (db.has(body.id)) throw new ApiError(400, `Student with the Id '${body.id}' already exists`);
      if (emailTaken(body.email)) throw new ApiError(400, `Email '${body.email}' is already used by another student`);
      const student = {
        id: body.id,
        name: titleCase(body.name),
        age: Number(body.age),
        email: body.email,
        course: body.course,
        marks: Number(body.marks),
      };
      db.set(student.id, student);
      return clone(student);
    },
    async update(id, changes) {
      await wait();
      const s = db.get(id);
      if (!s) throw new ApiError(404, `Student with the Id '${id}' does not exists..`);
      const errors = validateStudent(changes, { partial: true });
      if (Object.keys(errors).length) fail422(errors);
      if (changes.email !== undefined && emailTaken(changes.email, id)) {
        throw new ApiError(400, `Email '${changes.email}' is already used by another student`);
      }
      Object.assign(s, changes);
      if (changes.name !== undefined) s.name = titleCase(changes.name);
      return clone(s);
    },
    async remove(id) {
      await wait();
      if (!db.delete(id)) throw new ApiError(404, `Student with the Id '${id}' not found`);
      return { message: `Student '${id}' deleted successfully` };
    },
  };
})();

const api = () => (state.demo ? demo : http);

/* ---------- Toasts ---------- */
function toast(type, title, message = '', duration = 4500) {
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');
  node.style.setProperty('--dur', `${duration}ms`);
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
  node.innerHTML = `
    <span class="toast-icon">${icon(iconName, 18)}</span>
    <div class="toast-body">
      <p class="toast-title">${esc(title)}</p>
      ${message ? `<p class="toast-msg">${esc(message)}</p>` : ''}
    </div>
    <button class="toast-close" type="button" aria-label="Dismiss">${icon('x', 16)}</button>`;

  const dismiss = () => {
    if (node.classList.contains('is-out')) return;
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 300);
  };
  node.querySelector('.toast-close').addEventListener('click', dismiss);
  el.toasts.append(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  setTimeout(dismiss, duration);

  while (el.toasts.children.length > 4) el.toasts.firstElementChild.remove();
}

/* ---------- Dialog helpers ---------- */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function openDialog(dialog) {
  if (dialog.open) return;
  dialog.classList.remove('is-closing');
  dialog.showModal();
}

function closeDialog(dialog) {
  if (!dialog || !dialog.open || dialog.classList.contains('is-closing')) return;
  dialog.classList.add('is-closing');
  setTimeout(() => {
    dialog.classList.remove('is-closing');
    dialog.close();
  }, reduceMotion.matches ? 0 : 190);
}

$$('dialog').forEach((dialog) => {
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });
});

document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) closeDialog(closer.closest('dialog'));
});

/* ---------- Connection status ---------- */
function setConnection(status) {
  const labels = { online: 'Connected', offline: 'Offline', demo: 'Demo data', checking: 'Connecting…' };
  el.statusPill.dataset.state = status;
  el.statusText.textContent = labels[status];
  el.statusPill.title = status === 'demo' ? 'Using in-browser demo data' : `API: ${state.baseUrl}`;
}

/* ---------- Data loading ---------- */
function setLoading(on) {
  el.panel.classList.toggle('is-loading', on);
  el.panel.setAttribute('aria-busy', String(on));
  el.refreshBtn.classList.toggle('is-spinning', on);
  if (on && !state.students.length) renderSkeleton();
}

async function loadStudents() {
  const id = ++state.reqId;
  setLoading(true);
  try {
    const data = await api().list({
      course: state.course || undefined,
      sort_by: state.sortBy || undefined,
      order: state.order,
      page: state.page,
      limit: state.limit,
    });
    if (id !== state.reqId) return;

    state.total = Number(data.total_students) || 0;
    state.students = Array.isArray(data.students) ? data.students : [];
    state.offline = false;
    state.loadedOnce = true;
    setConnection(state.demo ? 'demo' : 'online');

    const pages = Math.max(1, Math.ceil(state.total / state.limit));
    if (state.page > pages) {
      state.page = pages;
      loadStudents();
      return;
    }
    render();
  } catch (err) {
    if (id !== state.reqId) return;
    state.students = [];
    state.total = 0;
    if (err.status === 0) {
      state.offline = true;
      setConnection('offline');
    } else {
      toast('error', 'Could not load students', err.message);
    }
    render();
  } finally {
    if (id === state.reqId) setLoading(false);
  }
}

async function loadStats() {
  try {
    const all = [];
    let page = 1;
    let total = Infinity;
    while (all.length < total && page <= 50) {
      const data = await api().list({ page, limit: 100 });
      total = Number(data.total_students) || 0;
      const rows = Array.isArray(data.students) ? data.students : [];
      all.push(...rows);
      if (!rows.length) break;
      page += 1;
    }
    renderStats(all);
  } catch {
    renderStats(null);
  }
}

const refreshAll = () => Promise.all([loadStudents(), loadStats()]);

/* ---------- Rendering ---------- */
function render() {
  renderChips();
  renderTable();
  renderPager();
  renderSortState();
}

const hasFilters = () => Boolean(state.course || state.sortBy);

function renderSkeleton() {
  el.table.hidden = false;
  el.empty.hidden = true;
  const row = () => `
    <tr class="skeleton">
      <td><span class="sk" style="width:46px"></span></td>
      <td><div class="sk-row"><span class="sk sk-circle"></span><div style="flex:1"><span class="sk" style="width:60%;margin-bottom:8px"></span><span class="sk" style="width:80%;height:10px"></span></div></div></td>
      <td><span class="sk" style="width:24px"></span></td>
      <td><span class="sk" style="width:90px;height:22px;border-radius:999px"></span></td>
      <td><span class="sk" style="width:120px"></span></td>
      <td><span class="sk" style="width:36px;height:22px"></span></td>
      <td><span class="sk" style="width:90px;margin-left:auto"></span></td>
    </tr>`;
  el.tbody.innerHTML = Array.from({ length: Math.min(state.limit, 6) }, row).join('');
}

function rowHtml(s, i) {
  const grade = gradeOf(s.marks);
  const g = gradeKey(grade);
  const marks = Math.max(0, Math.min(100, Number(s.marks) || 0));
  return `
    <tr style="--i:${i}" data-id="${esc(s.id)}">
      <td class="c-id" data-label="ID"><span class="mono">${esc(s.id)}</span></td>
      <td class="c-student">
        <div class="student">
          <span class="avatar" style="--h:${hueFor(s.name)}" aria-hidden="true">${esc(initials(s.name))}</span>
          <div class="student-meta">
            <button type="button" class="student-name" data-act="view">${esc(s.name)}</button>
            <span class="student-email">${esc(s.email)}</span>
          </div>
        </div>
      </td>
      <td class="c-age" data-label="Age">${esc(s.age)}</td>
      <td class="c-course" data-label="Course">
        <button type="button" class="course-tag" data-act="filter-course" title="Show only ${esc(s.course)}">${esc(s.course)}</button>
      </td>
      <td class="c-marks" data-label="Marks">
        <div class="marks" data-g="${g}">
          <span class="marks-num">${esc(marks)}</span>
          <span class="marks-bar"><span style="width:${marks}%"></span></span>
        </div>
      </td>
      <td class="c-grade" data-label="Grade"><span class="grade" data-g="${g}">${grade}</span></td>
      <td class="c-actions">
        <div class="row-actions">
          <button type="button" class="act-btn" data-act="view" aria-label="View ${esc(s.name)}" title="View">${icon('eye', 16)}</button>
          <button type="button" class="act-btn" data-act="edit" aria-label="Edit ${esc(s.name)}" title="Edit">${icon('edit', 16)}</button>
          <button type="button" class="act-btn" data-act="delete" aria-label="Delete ${esc(s.name)}" title="Delete">${icon('trash', 16)}</button>
        </div>
      </td>
    </tr>`;
}

function renderTable() {
  if (state.offline) return showEmpty('offline');
  if (!state.students.length) return showEmpty(state.course ? 'filtered' : 'none');
  el.empty.hidden = true;
  el.table.hidden = false;
  el.tbody.innerHTML = state.students.map(rowHtml).join('');
}

function showEmpty(kind) {
  el.tbody.innerHTML = '';
  el.table.hidden = true;
  const views = {
    offline: {
      icon: 'plug', danger: true,
      title: 'Can’t reach the API',
      text: `No response from <span class="mono">${esc(state.baseUrl)}</span>. Start your FastAPI server (and enable CORS), or explore with demo data.`,
      actions: `<button class="btn btn-ghost" data-act="settings">${icon('sliders', 16)}Connection settings</button>
                <button class="btn btn-ghost" data-act="retry">${icon('refresh', 16)}Retry</button>
                <button class="btn btn-primary" data-act="demo">Use demo data</button>`,
    },
    filtered: {
      icon: 'filter',
      title: 'No matching students',
      text: `Nobody is enrolled in <strong>${esc(state.course)}</strong> yet. Course matching ignores letter case but needs the full name.`,
      actions: `<button class="btn btn-ghost" data-act="clear">Clear filters</button>
                <button class="btn btn-primary" data-act="new">${icon('plus', 16)}Add student</button>`,
    },
    none: {
      icon: 'database',
      title: 'No students yet',
      text: 'Your records table is empty. Add the first student to get started.',
      actions: `<button class="btn btn-primary" data-act="new">${icon('plus', 16)}Add first student</button>`,
    },
  };
  const v = views[kind];
  el.empty.innerHTML = `
    <div class="empty-icon ${v.danger ? 'is-danger' : ''}">${icon(v.icon, 24)}</div>
    <h3>${v.title}</h3>
    <p>${v.text}</p>
    <div class="empty-actions">${v.actions}</div>`;
  el.empty.hidden = false;
}

function renderChips() {
  const chips = [];
  if (state.course) {
    chips.push(`<span class="chip">Course: ${esc(state.course)}<button type="button" data-chip="course" aria-label="Remove course filter">${icon('x', 13)}</button></span>`);
  }
  if (state.sortBy) {
    chips.push(`<span class="chip">Sorted by ${esc(state.sortBy)} ${state.order === 'desc' ? '↓' : '↑'}<button type="button" data-chip="sort" aria-label="Remove sorting">${icon('x', 13)}</button></span>`);
  }
  if (chips.length > 1) chips.push('<button type="button" class="chip chip-clear" data-chip="all">Clear all</button>');
  el.chips.innerHTML = chips.join('');
}

function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

function renderPager() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  if (!state.total) {
    el.pagerInfo.textContent = state.offline ? 'Not connected' : 'No records';
    el.pager.innerHTML = '';
    return;
  }
  const from = (state.page - 1) * state.limit + 1;
  const to = Math.min(state.total, from + state.students.length - 1);
  el.pagerInfo.innerHTML = `Showing <strong>${from}–${to}</strong> of <strong>${state.total}</strong> student${state.total === 1 ? '' : 's'}`;

  const buttons = [
    `<button type="button" class="page-btn" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('chevronLeft', 16)}</button>`,
    ...pageList(state.page, totalPages).map((p) => (p === '…'
      ? '<span class="page-gap">…</span>'
      : `<button type="button" class="page-btn ${p === state.page ? 'is-current' : ''}" data-page="${p}" ${p === state.page ? 'aria-current="page"' : ''}>${p}</button>`)),
    `<button type="button" class="page-btn" data-page="${state.page + 1}" ${state.page >= totalPages ? 'disabled' : ''} aria-label="Next page">${icon('chevronRight', 16)}</button>`,
  ];
  el.pager.innerHTML = buttons.join('');
}

function renderSortState() {
  el.sortSelect.value = state.sortBy;
  el.orderBtn.disabled = !state.sortBy;
  el.orderBtn.dataset.order = state.order;
  el.orderBtn.querySelector('span').textContent = state.order === 'desc' ? 'Desc' : 'Asc';
  el.orderBtn.setAttribute('aria-label', `Order: ${state.order === 'desc' ? 'descending' : 'ascending'}`);

  $$('.table thead th[data-col]').forEach((th) => {
    const col = th.dataset.col;
    const active = state.sortBy ? col === state.sortBy : col === 'id';
    if (active) th.setAttribute('aria-sort', state.sortBy && state.order === 'desc' ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
  });
}

function renderStats(all) {
  if (!all) {
    ['statTotal', 'statAvg', 'statCourses'].forEach((k) => { el[k].textContent = '—'; el[k].dataset.value = '0'; });
    el.statTop.textContent = '—';
    el.statTopFoot.textContent = 'Highest marks overall';
    el.statAvgBar.style.width = '0%';
    el.statCoursesFoot.textContent = 'Offered right now';
    return;
  }

  animateNumber(el.statTotal, all.length);

  const avg = all.length ? all.reduce((sum, s) => sum + Number(s.marks || 0), 0) / all.length : 0;
  animateNumber(el.statAvg, avg, { decimals: 1 });
  requestAnimationFrame(() => { el.statAvgBar.style.width = `${avg}%`; });

  const top = all.reduce((best, s) => (!best || s.marks > best.marks ? s : best), null);
  el.statTop.textContent = top ? top.name : '—';
  el.statTopFoot.textContent = top ? `${top.marks} marks · Grade ${gradeOf(top.marks)} · ${top.course}` : 'Highest marks overall';

  const counts = new Map();
  all.forEach((s) => counts.set(s.course, (counts.get(s.course) || 0) + 1));
  animateNumber(el.statCourses, counts.size);
  const popular = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  el.statCoursesFoot.textContent = popular ? `Most popular: ${popular[0]} (${popular[1]})` : 'Offered right now';

  const passing = all.filter((s) => s.marks >= 60).length;
  el.statTotalFoot.textContent = all.length ? `${Math.round((passing / all.length) * 100)}% passing (grade C or above)` : 'Across all courses';

  state.courses = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  el.courseList.innerHTML = state.courses.map((c) => `<option value="${esc(c)}"></option>`).join('');
}

/* ---------- Detail drawer ---------- */
function openDetail(student) {
  state.viewing = student;
  const grade = gradeOf(student.marks);
  const g = gradeKey(grade);
  const C = 2 * Math.PI * 60;
  const marks = Math.max(0, Math.min(100, Number(student.marks) || 0));
  const rank = { 'A+': 'Outstanding', A: 'Excellent', B: 'Very good', C: 'Satisfactory', F: 'Needs support' }[grade];

  el.detailBody.innerHTML = `
    <div class="profile">
      <div class="ring" data-g="${g}">
        <svg viewBox="0 0 132 132" width="132" height="132" aria-hidden="true">
          <circle class="ring-track" cx="66" cy="66" r="60" fill="none" stroke-width="5"/>
          <circle class="ring-value" cx="66" cy="66" r="60" fill="none" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" data-target="${(C * (1 - marks / 100)).toFixed(2)}"/>
        </svg>
        <span class="avatar" style="--h:${hueFor(student.name)}">${esc(initials(student.name))}</span>
      </div>
      <h3 id="detailName">${esc(student.name)}</h3>
      <button type="button" class="profile-id" data-act="copy-id" title="Copy student ID">${esc(student.id)} ${icon('copy', 13)}</button>
      <a class="profile-email" href="mailto:${esc(student.email)}">${icon('mail', 15)}${esc(student.email)}</a>
    </div>
    <dl class="detail-grid">
      <div class="detail-item"><dt>Marks</dt><dd><span class="mono">${esc(marks)}</span><span style="color:var(--text-3);font-size:13px"> / 100</span></dd></div>
      <div class="detail-item"><dt>Grade</dt><dd><span class="grade" data-g="${g}">${grade}</span></dd></div>
      <div class="detail-item"><dt>Age</dt><dd>${esc(student.age)}</dd></div>
      <div class="detail-item"><dt>Course</dt><dd style="font-size:15px">${esc(student.course)}</dd></div>
    </dl>
    <p class="detail-note"><strong>${rank}.</strong> ${grade === 'F'
      ? `${esc(student.name.split(' ')[0])} is ${60 - marks} mark${60 - marks === 1 ? '' : 's'} away from a passing grade.`
      : grade === 'A+'
        ? 'Top grade band — 90 marks or above.'
        : `${esc(nextBandGap(marks))} to reach the next grade band.`}</p>`;

  openDialog(el.drawer);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ring = el.detailBody.querySelector('.ring-value');
    if (ring) ring.style.strokeDashoffset = ring.dataset.target;
  }));
}

function nextBandGap(marks) {
  const next = [60, 70, 80, 90].find((b) => marks < b);
  const gap = next - marks;
  return `${gap} more mark${gap === 1 ? '' : 's'}`;
}

/* ---------- Create / edit form ---------- */
const FIELD_INPUTS = () => ({ id: el.fId, name: el.fName, age: el.fAge, email: el.fEmail, course: el.fCourse, marks: el.fMarks });

function readForm() {
  const num = (input) => (input.value.trim() === '' ? '' : Number(input.value));
  return {
    id: el.fId.value.trim(),
    name: el.fName.value.trim().replace(/\s+/g, ' '),
    age: num(el.fAge),
    email: el.fEmail.value.trim(),
    course: el.fCourse.value.trim(),
    marks: num(el.fMarks),
  };
}

function setFieldError(name, message) {
  const field = el.form.querySelector(`[data-field="${name}"]`);
  if (!field) return;
  field.classList.toggle('has-error', Boolean(message));
  field.querySelector('.field-error').textContent = message || '';
  const input = FIELD_INPUTS()[name];
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function showFieldErrors(errors) {
  Object.keys(FIELD_INPUTS()).forEach((name) => setFieldError(name, errors[name]));
}

function showBanner(message) {
  if (!message) {
    el.formBanner.hidden = true;
    el.formBanner.innerHTML = '';
    return;
  }
  el.formBanner.innerHTML = `${icon('alert', 16)}<span>${esc(message)}</span>`;
  el.formBanner.hidden = false;
}

function shake(node) {
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
  node.addEventListener('animationend', () => node.classList.remove('shake'), { once: true });
}

function syncMarks(source) {
  if (source === 'range') {
    el.fMarks.value = el.fMarksRange.value;
  } else if (el.fMarks.value !== '') {
    el.fMarksRange.value = String(Math.min(100, Math.max(0, Number(el.fMarks.value) || 0)));
  }
  el.fMarksRange.style.setProperty('--fill', `${el.fMarksRange.value}%`);
  const value = el.fMarks.value;
  const valid = value !== '' && Number(value) >= 0 && Number(value) <= 100;
  if (valid) {
    const grade = gradeOf(value);
    el.gradePreview.textContent = `Grade ${grade}`;
    el.gradePreview.dataset.g = gradeKey(grade);
  } else {
    el.gradePreview.textContent = '—';
    delete el.gradePreview.dataset.g;
  }
}

function openForm(student = null) {
  if (state.offline && !state.demo) {
    toast('error', 'Not connected', 'Connect to your API or switch to demo data first.');
    openSettings();
    return;
  }
  state.editing = student;
  el.form.reset();
  showFieldErrors({});
  showBanner('');

  const editing = Boolean(student);
  el.formEyebrow.textContent = editing ? `Editing ${student.id}` : 'New enrolment';
  el.formTitle.textContent = editing ? 'Update student' : 'Add a student';
  el.formSubmit.querySelector('.btn-label').textContent = editing ? 'Save changes' : 'Create student';
  el.fId.disabled = editing;

  const values = student || { id: suggestId(), name: '', age: '', email: '', course: state.course || '', marks: 75 };
  el.fId.value = values.id;
  el.fName.value = values.name;
  el.fAge.value = values.age;
  el.fEmail.value = values.email;
  el.fCourse.value = values.course;
  el.fMarks.value = values.marks;
  syncMarks('number');

  openDialog(el.formDialog);
  setTimeout(() => (editing ? el.fName : el.fId).focus(), 60);
}

function suggestId() {
  const nums = state.students
    .map((s) => /^S(\d+)$/i.exec(s.id))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  if (!nums.length) return '';
  const next = Math.max(state.total, ...nums) + 1;
  return `S${String(next).padStart(3, '0')}`;
}

function setBusy(button, busy) {
  button.classList.toggle('is-busy', busy);
  button.disabled = busy;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  showBanner('');
  const data = readForm();
  const errors = validateStudent(data);
  showFieldErrors(errors);

  const firstInvalid = Object.keys(FIELD_INPUTS()).find((k) => errors[k]);
  if (firstInvalid) {
    FIELD_INPUTS()[firstInvalid].focus();
    shake(el.form);
    return;
  }

  setBusy(el.formSubmit, true);
  try {
    if (state.editing) {
      const original = state.editing;
      const changes = {};
      EDITABLE_FIELDS.forEach((k) => {
        if (String(data[k]) !== String(original[k])) changes[k] = data[k];
      });
      if (!Object.keys(changes).length) {
        toast('info', 'Nothing to save', 'No fields were changed.');
        closeDialog(el.formDialog);
        return;
      }
      const updated = await api().update(original.id, changes);
      toast('success', 'Changes saved', `${updated?.name || original.name} was updated.`);
      if (el.drawer.open && state.viewing?.id === original.id && updated) openDetail(updated);
    } else {
      const created = await api().create(data);
      toast('success', 'Student created', `${created?.name || data.name} (${data.id}) was added.`);
    }
    closeDialog(el.formDialog);
    await refreshAll();
  } catch (err) {
    applyServerError(err);
  } finally {
    setBusy(el.formSubmit, false);
  }
}

function applyServerError(err) {
  if (err.status === 422) {
    const fieldErrors = detailToFieldErrors(err.detail);
    showFieldErrors(fieldErrors);
    if (!Object.keys(fieldErrors).length) showBanner(err.message);
  } else if (err.status === 400 && /email/i.test(err.message)) {
    setFieldError('email', err.message);
    el.fEmail.focus();
  } else if (err.status === 400 && /\bid\b/i.test(err.message)) {
    setFieldError('id', err.message);
    el.fId.focus();
  } else if (err.status === 404) {
    showBanner(`${err.message}. It may have been deleted — the list will refresh.`);
    loadStudents();
  } else {
    showBanner(err.message);
  }
  shake(el.form);
}

/* ---------- Delete ---------- */
function askDelete(student) {
  state.pendingDelete = student;
  el.confirmText.innerHTML = `<strong>${esc(student.name)}</strong> <span class="mono">(${esc(student.id)})</span> will be permanently removed. This can’t be undone.`;
  openDialog(el.confirmDialog);
  setTimeout(() => el.confirmDialog.querySelector('[data-close]').focus(), 50);
}

async function confirmDelete() {
  const student = state.pendingDelete;
  if (!student) return;
  setBusy(el.confirmBtn, true);
  try {
    const res = await api().remove(student.id);
    toast('success', 'Student deleted', res?.message || `${student.name} was removed.`);
    closeDialog(el.confirmDialog);
    if (el.drawer.open && state.viewing?.id === student.id) closeDialog(el.drawer);
    if (state.students.length === 1 && state.page > 1) state.page -= 1;
    await refreshAll();
  } catch (err) {
    toast('error', 'Delete failed', err.message);
    if (err.status === 404) {
      closeDialog(el.confirmDialog);
      refreshAll();
    }
  } finally {
    setBusy(el.confirmBtn, false);
    state.pendingDelete = null;
  }
}

/* ---------- Lookup by ID ---------- */
async function lookup(e) {
  e.preventDefault();
  const id = el.lookupInput.value.trim();
  if (!id) {
    el.lookupInput.focus();
    return;
  }
  el.lookupForm.classList.remove('shake');
  try {
    const student = await api().get(id);
    openDetail(student);
  } catch (err) {
    shake(el.lookupForm);
    toast('error', err.status === 404 ? 'Student not found' : 'Lookup failed', err.message);
  }
}

/* ---------- Settings ---------- */
function openSettings() {
  el.sUrl.value = state.baseUrl;
  el.sDemo.checked = state.demo;
  el.sResult.className = 'test-result';
  el.sResult.textContent = '';
  el.sReset.hidden = !state.demo;
  openDialog(el.settingsDialog);
}

async function testConnection() {
  const url = el.sUrl.value.trim() || DEFAULTS.baseUrl;
  el.sResult.className = 'test-result';
  el.sResult.textContent = 'Testing…';
  setBusy(el.sTest, true);
  try {
    const data = await http.request('GET', '/students', { query: { limit: 1 }, baseUrl: url });
    const n = Number(data?.total_students) || 0;
    el.sResult.className = 'test-result ok';
    el.sResult.innerHTML = `${icon('check', 14)} Connected — ${n} student${n === 1 ? '' : 's'} in the database`;
  } catch (err) {
    el.sResult.className = 'test-result bad';
    el.sResult.innerHTML = `${icon('alert', 14)} ${esc(err.message)}`;
  } finally {
    setBusy(el.sTest, false);
  }
}

function saveSettings(e) {
  e.preventDefault();
  const url = el.sUrl.value.trim() || DEFAULTS.baseUrl;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('bad protocol');
  } catch {
    el.sResult.className = 'test-result bad';
    el.sResult.innerHTML = `${icon('alert', 14)} Enter a full URL such as http://127.0.0.1:8000`;
    el.sUrl.focus();
    return;
  }
  const modeChanged = state.demo !== el.sDemo.checked;
  state.baseUrl = url.replace(/\/+$/, '');
  state.demo = el.sDemo.checked;
  persist();
  closeDialog(el.settingsDialog);
  resetView();
  setConnection(state.demo ? 'demo' : 'checking');
  if (modeChanged) toast('info', state.demo ? 'Demo mode on' : 'Live mode on', state.demo ? 'Changes stay in this browser tab.' : `Using ${state.baseUrl}`);
  refreshAll();
}

function enableDemo() {
  state.demo = true;
  persist();
  resetView();
  setConnection('demo');
  toast('info', 'Demo mode on', 'Exploring sample data. Switch back anytime in settings.');
  refreshAll();
}

function resetView() {
  state.page = 1;
  state.students = [];
  state.offline = false;
}

/* ---------- Filter / sort helpers ---------- */
function setCourse(value) {
  state.course = value.trim();
  el.courseInput.value = state.course;
  el.courseClear.hidden = !state.course;
  state.page = 1;
  loadStudents();
}

function setSort(field, order) {
  state.sortBy = field;
  if (order) state.order = order;
  state.page = 1;
  renderSortState();
  loadStudents();
}

function findStudent(id) {
  return state.students.find((s) => s.id === id) || null;
}

/* ---------- Event wiring ---------- */
el.newBtn.addEventListener('click', () => openForm());
el.settingsBtn.addEventListener('click', openSettings);
el.statusPill.addEventListener('click', openSettings);
el.refreshBtn.addEventListener('click', () => refreshAll());
el.lookupForm.addEventListener('submit', lookup);
el.lookupInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    el.lookupInput.value = '';
    el.lookupInput.blur();
  }
});

const debouncedCourse = debounce((v) => setCourse(v), 350);
el.courseInput.addEventListener('input', () => {
  el.courseClear.hidden = !el.courseInput.value;
  debouncedCourse(el.courseInput.value);
});
el.courseClear.addEventListener('click', () => {
  setCourse('');
  el.courseInput.focus();
});

el.sortSelect.addEventListener('change', () => setSort(el.sortSelect.value));
el.orderBtn.addEventListener('click', () => setSort(state.sortBy, state.order === 'asc' ? 'desc' : 'asc'));
el.limitSelect.addEventListener('change', () => {
  state.limit = Number(el.limitSelect.value);
  state.page = 1;
  persist();
  loadStudents();
});

$$('.th-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.sort;
    if (!field) return setSort('', 'asc');
    if (state.sortBy === field) setSort(field, state.order === 'asc' ? 'desc' : 'asc');
    else setSort(field, field === 'marks' ? 'desc' : 'asc');
  });
});

el.chips.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-chip]');
  if (!btn) return;
  const kind = btn.dataset.chip;
  if (kind === 'course' || kind === 'all') {
    state.course = '';
    el.courseInput.value = '';
    el.courseClear.hidden = true;
  }
  if (kind === 'sort' || kind === 'all') {
    state.sortBy = '';
    state.order = 'asc';
  }
  state.page = 1;
  renderSortState();
  loadStudents();
});

el.tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const row = btn.closest('tr[data-id]');
  const student = row && findStudent(row.dataset.id);
  if (!student) return;
  const act = btn.dataset.act;
  if (act === 'view') openDetail(student);
  else if (act === 'edit') openForm(student);
  else if (act === 'delete') askDelete(student);
  else if (act === 'filter-course') setCourse(student.course);
});

el.empty.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'settings') openSettings();
  else if (act === 'retry') { setConnection('checking'); refreshAll(); }
  else if (act === 'demo') enableDemo();
  else if (act === 'new') openForm();
  else if (act === 'clear') {
    state.course = '';
    state.sortBy = '';
    state.order = 'asc';
    el.courseInput.value = '';
    el.courseClear.hidden = true;
    state.page = 1;
    renderSortState();
    loadStudents();
  }
});

el.pager.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  const page = Number(btn.dataset.page);
  if (page === state.page) return;
  state.page = page;
  loadStudents();
  el.panel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
});

/* Drawer actions */
el.drawer.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || !state.viewing) return;
  const act = btn.dataset.act;
  if (act === 'edit') {
    const student = state.viewing;
    closeDialog(el.drawer);
    setTimeout(() => openForm(student), reduceMotion.matches ? 0 : 200);
  } else if (act === 'delete') {
    askDelete(state.viewing);
  } else if (act === 'copy-id') {
    const ok = await copyText(state.viewing.id);
    toast(ok ? 'success' : 'error', ok ? 'ID copied' : 'Copy failed', ok ? state.viewing.id : 'Your browser blocked clipboard access.', 2500);
  }
});

/* Form */
el.form.addEventListener('submit', handleFormSubmit);
el.fMarksRange.addEventListener('input', () => {
  syncMarks('range');
  if (el.form.querySelector('[data-field="marks"]').classList.contains('has-error')) setFieldError('marks', '');
});
el.fMarks.addEventListener('input', () => syncMarks('number'));

Object.entries(FIELD_INPUTS()).forEach(([name, input]) => {
  input.addEventListener('blur', () => {
    if (name === 'id' && state.editing) return;
    if (input.value.trim() === '' && !input.closest('.field').classList.contains('has-error')) return;
    setFieldError(name, validateStudent(readForm())[name]);
  });
  input.addEventListener('input', () => {
    if (input.closest('.field').classList.contains('has-error')) {
      setFieldError(name, validateStudent(readForm())[name]);
    }
  });
});

el.formDialog.addEventListener('close', () => {
  state.editing = null;
});

/* Confirm */
el.confirmBtn.addEventListener('click', confirmDelete);
el.confirmDialog.addEventListener('close', () => {
  if (!el.confirmBtn.classList.contains('is-busy')) state.pendingDelete = null;
});

/* Settings */
el.settingsForm.addEventListener('submit', saveSettings);
el.sTest.addEventListener('click', testConnection);
el.sDemo.addEventListener('change', () => { el.sReset.hidden = !el.sDemo.checked; });
el.sReset.addEventListener('click', () => {
  demo.reset();
  toast('success', 'Demo data reset', 'Sample records were restored.');
  if (state.demo) refreshAll();
});
el.sCopy.addEventListener('click', async () => {
  const ok = await copyText(el.corsSnippet.textContent);
  toast(ok ? 'success' : 'error', ok ? 'Snippet copied' : 'Copy failed', ok ? 'Paste it after app = FastAPI().' : '', 2500);
});

/* Keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const t = e.target;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
  if (typing) return;

  if (e.key === '/') {
    e.preventDefault();
    el.lookupInput.focus();
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    openForm();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    refreshAll();
  }
});

/* ---------- Init ---------- */
function init() {
  el.today.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  el.limitSelect.value = String(state.limit);
  setConnection(state.demo ? 'demo' : 'checking');
  renderSortState();
  renderSkeleton();
  refreshAll();
}

init();
