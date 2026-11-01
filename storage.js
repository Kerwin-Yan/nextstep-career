/* Browser-only data store. No bundled personal records or network synchronization. */
(() => {
  'use strict';
  const DB_NAME = 'nextstep-personal-workspace';
  const DB_VERSION = 2;
  const STORE = 'workspace';
  const KEY = 'current';
  const MAX_RESUME_BYTES = 10 * 1024 * 1024;
  const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
  const COLLECTIONS = ['jobs', 'tasks', 'applications', 'resumes', 'reviews', 'events'];
  const STATUS_KEYS = ['applied', 'screening', 'interviewing', 'rejected', 'offer'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const dateAt = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
  };
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  const initial = () => ({ version: 2, profile: { owner: '', city: '', salary: '', goalWindow: '', initialized: false }, jobs: [], tasks: [], applications: [], resumes: [], reviews: [], events: [] });
  const fail = message => { throw new Error(message || '备份的数据格式不正确。'); };
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const string = (value, label, max = 10000, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(label + '格式不正确。');
    return value;
  };
  const optionalStrings = (row, keys) => keys.forEach(key => { if (row[key] !== undefined) string(row[key], key); });
  function safeTree(value, depth = 0) {
    if (depth > 16) fail('备份嵌套层级过多。');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { if (value.length > 20000) fail('备份的记录过多。'); value.forEach(item => safeTree(item, depth + 1)); return; }
    if (!isObject(value)) fail();
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('备份包含不支持的字段。');
      safeTree(item, depth + 1);
    }
  }
  function attachmentBytes(content) {
    if (typeof content !== 'string' || content.length > Math.ceil(MAX_RESUME_BYTES / 3) * 4 + 1024) fail('简历附件超过 10 MB。');
    const match = /^data:[^,\r\n]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(content);
    if (!match || match[1].length % 4 !== 0) fail('简历附件内容无效。');
    const bytes = match[1].length / 4 * 3 - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0);
    if (bytes > MAX_RESUME_BYTES) fail('简历附件超过 10 MB。');
    return bytes;
  }
  function normalize(value) {
    safeTree(value);
    if (!isObject(value) || ![1, 2].includes(value.version)) fail('不支持此备份版本。');
    const legacy = value.version === 1;
    const next = initial();
    if (!legacy) {
      if (!isObject(value.profile) || typeof value.profile.initialized !== 'boolean') fail('个人信息格式不正确。');
      const p = value.profile;
      next.profile = { owner: string(p.owner, '昵称', 80), city: string(p.city, '城市', 120), salary: string(p.salary, '期望薪资', 240), goalWindow: string(p.goalWindow, '目标时间', 240), initialized: p.initialized };
      if (p.initialized && !p.owner.trim()) fail('已建立的空间需要昵称。');
    }
    for (const key of COLLECTIONS) {
      if (!Array.isArray(value[key]) || value[key].length > 20000) fail('缺少有效的' + key + '记录。');
      const ids = new Set();
      next[key] = value[key].map((item, index) => {
        if (!isObject(item)) fail('记录格式不正确。');
        const row = clone(item);
        if (legacy && !row.id && ['applications', 'resumes', 'reviews', 'events'].includes(key)) row.id = 'import-' + key + '-' + index;
        string(row.id, '记录标识', 160, true);
        if (ids.has(row.id)) fail('备份含重复记录标识。');
        ids.add(row.id);
        return row;
      });
    }
    next.jobs.forEach(j => {
      string(j.company, '公司名称', 200, true); string(j.title, '岗位名称', 200, true);
      optionalStrings(j, ['initials', 'subtitle', 'category', 'location', 'salary', 'stage', 'source', 'next', 'cue', 'assessment']);
    });
    next.tasks.forEach(t => {
      string(t.title, '待办内容', 500, true);
      if (![1, 2, 3].includes(t.priority) || typeof t.done !== 'boolean' || !validDate(t.due)) fail('待办的日期、优先级或完成状态无效。');
      optionalStrings(t, ['detail', 'category', 'kind']);
    });
    const jobs = new Set(next.jobs.map(j => j.id));
    const applicationJobs = new Set();
    next.applications.forEach(a => {
      if (!jobs.has(a.jobId) || !STATUS_KEYS.includes(a.status)) fail('投递记录的岗位或状态无效。');
      if (applicationJobs.has(a.jobId)) fail('同一岗位存在重复投递状态。');
      applicationJobs.add(a.jobId);
      if ((a.date !== undefined && !validDate(a.date)) || (a.updated !== undefined && !validDate(a.updated))) fail('投递记录日期无效。');
      optionalStrings(a, ['note']);
    });
    next.resumes.forEach(r => {
      string(r.name, '文件名称', 255, true);
      const bytes = attachmentBytes(r.content);
      if (r.size === undefined && legacy) r.size = bytes;
      if (!Number.isInteger(r.size) || r.size < 0 || r.size !== bytes) fail('附件大小与内容不一致。');
      if (r.type !== undefined) string(r.type, '文件类型', 255);
      if (r.date !== undefined && !validDate(r.date)) fail('附件日期无效。');
    });
    next.reviews.forEach(r => {
      if (!jobs.has(r.jobId)) fail('复盘关联的岗位不存在。');
      string(r.content, '复盘内容', 10000, true);
      optionalStrings(r, ['round']);
      if (r.date !== undefined && !validDate(r.date)) fail('复盘日期无效。');
    });
    next.events.forEach(e => {
      string(e.title, '进展标题', 500, true);
      if (!validDate(e.date)) fail('进展日期无效。');
      optionalStrings(e, ['detail', 'time', 'kind']);
    });
    return next;
  }
  let connection = null;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('此浏览器暂不支持 IndexedDB。')); return; }
      let settled = false;
      let request;
      const finishError = error => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => finishError(new Error('浏览器数据库打开超时，请关闭其他旧页面后重试。')), 8000);
      try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch (error) { finishError(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      request.onerror = () => finishError(request.error || new Error('数据库打开失败。'));
      request.onblocked = () => finishError(new Error('旧页面阻止数据库升级，请关闭其他页面后重试。'));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true; clearTimeout(timer);
        db.onversionchange = () => { db.close(); connection = null; };
        db.onclose = () => { connection = null; };
        resolve(db);
      };
    }).catch(error => { connection = null; throw error; });
    return connection;
  }
  function envelope(record) {
    if (record === undefined || record === null) return { state: initial(), revision: 0 };
    const value = record.state || record;
    const revision = record.revision === undefined ? 0 : record.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) fail('数据库修订号无效。');
    return { state: normalize(value), revision };
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      let result;
      let validationError;
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => { try { result = envelope(request.result); } catch (error) { validationError = error; } };
      tx.oncomplete = () => validationError ? reject(validationError) : result ? resolve(result) : reject(new Error('数据库未返回记录。'));
      tx.onerror = () => reject(tx.error || request.error || new Error('数据库读取失败。'));
      tx.onabort = () => reject(tx.error || new Error('数据库读取中断。'));
    });
  }
  async function write(value, expectedRevision) {
    const state = normalize(value);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('缺少数据库修订号，请重新打开。');
    const db = await open();
    return new Promise((resolve, reject) => {
      let failure;
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(KEY);
      request.onsuccess = () => {
        try {
          const current = envelope(request.result);
          if (current.revision !== expectedRevision) {
            const error = new Error('另一个页面已经修改记录。请先备份未提交的输入，再重新打开读取最新记录。');
            error.code = 'CONFLICT'; throw error;
          }
          store.put({ key: KEY, revision: expectedRevision + 1, state });
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve({ state, revision: expectedRevision + 1 });
      tx.onerror = () => reject(failure || tx.error || request.error || new Error('数据库保存失败。'));
      tx.onabort = () => reject(failure || tx.error || new Error('数据库保存中断。'));
    });
  }
  globalThis.NextStepStore = Object.freeze({ DB_NAME, DB_VERSION, STORE, KEY, MAX_RESUME_BYTES, MAX_IMPORT_BYTES, STATUS_KEYS, clone, dateAt, validDate, initial, normalize, attachmentBytes, read, write });
})();
