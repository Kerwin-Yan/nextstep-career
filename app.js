/* Personal workspace: user-entered records stay in the current browser. */
(() => {
  'use strict';
  const S = globalThis.NextStepStore;
  const id = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const freshTask = () => ({ title: '', priority: 2, due: S.dateAt() });
  const freshJob = () => ({ company: '', title: '', location: '', salary: '', source: '' });
  const freshProgress = () => ({ type: 'note', jobId: '', status: 'applied', note: '' });
  const freshReview = () => ({ jobId: '', round: '第一轮', content: '' });
  const inputText = (value, label, max, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('请填写有效的' + label + (value?.length > max ? '（最多 ' + max + ' 字）' : '') + '。');
    return value.trim();
  };
  const visible = el => !el.disabled && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  document.addEventListener('alpine:init', () => {
    Alpine.data('workbench', () => ({
      state: S.initial(), view: 'overview', panel: null, activeJob: null, query: '', jobFilter: 'all', taskFilter: 'pending',
      loading: true, saving: false, savingResume: false, error: '', formError: '', message: '', focusId: null,
      modalReturn: null, pendingImport: null, imported: false,
      profileForm: { owner: '', city: '', salary: '', goalWindow: '', starter: true },
      newTask: freshTask(), newProgress: freshProgress(), newJob: freshJob(), newReview: freshReview(),
      _loaded: false, _revision: 0, _clock: Date.now(), _today: S.dateAt(), _readingImport: false,
      navs: [
        { key: 'overview', label: '求职总览', shortLabel: '总览', icon: 'grid' },
        { key: 'jobs', label: '岗位机会', shortLabel: '岗位', icon: 'briefcase' },
        { key: 'tasks', label: '行动计划', shortLabel: '计划', icon: 'checklist' },
        { key: 'resumes', label: '我的简历', shortLabel: '简历', icon: 'file' },
        { key: 'reviews', label: '面试复盘', shortLabel: '复盘', icon: 'chat' }
      ],
      statuses: [{ key: 'applied', label: '等待反馈' }, { key: 'screening', label: '筛选沟通' }, { key: 'interviewing', label: '面试中' }, { key: 'rejected', label: '未通过' }, { key: 'offer', label: '收到 Offer' }],
      async init() {
        const section = location.hash.slice(1);
        if (this.navs.some(n => n.key === section)) this.view = section;
        this.$watch('view', value => {
          if (!this.navs.some(n => n.key === value)) { this.view = 'overview'; return; }
          this.query = '';
          history.replaceState(null, '', location.pathname + location.search + '#' + value);
        });
        this._onHash = () => {
          const section = location.hash.slice(1);
          if (this.navs.some(n => n.key === section)) this.view = section;
        };
        window.addEventListener('hashchange', this._onHash);
        this._onWake = () => { if (document.visibilityState !== 'hidden') this.refreshClock(); };
        window.addEventListener('focus', this._onWake);
        window.addEventListener('pageshow', this._onWake);
        document.addEventListener('visibilitychange', this._onWake);
        this.refreshClock();
        await this.retryLoad();
      },
      destroy() {
        clearTimeout(this._clockTimer); clearTimeout(this._messageTimer); clearTimeout(this._focusTimer);
        window.removeEventListener('hashchange', this._onHash);
        window.removeEventListener('focus', this._onWake);
        window.removeEventListener('pageshow', this._onWake);
        document.removeEventListener('visibilitychange', this._onWake);
      },
      refreshClock() {
        this._clock = Date.now();
        const nextDate = S.dateAt(new Date(this._clock));
        if (this.newTask.due === this._today) this.newTask.due = nextDate;
        this._today = nextDate;
        clearTimeout(this._clockTimer);
        const nextMidnight = Date.parse(nextDate + 'T00:00:00+08:00') + 86400000;
        this._clockTimer = setTimeout(() => this.refreshClock(), Math.max(100, nextMidnight - this._clock + 30));
      },
      async retryLoad() {
        if (this.saving || this.savingResume) return;
        this.loading = true;
        try {
          const loaded = await S.read();
          this.state = loaded.state; this._revision = loaded.revision; this._loaded = true;
          this.profileForm = { ...this.state.profile, starter: !this.state.profile.initialized && this.state.tasks.length === 0 };
          this.error = ''; this.formError = '';
          if (!this.state.profile.initialized) this.open('welcome');
        } catch (error) {
          this._loaded = false;
          this.error = '未能读取此浏览器的记录。原数据未被覆盖。' + (error.message || '请稍后重试。');
        } finally { this.loading = false; }
      },
      get today() { this._clock; return S.dateAt(); },
      get dateLabel() { this._clock; return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()); },
      get heading() { return this.navs.find(n => n.key === this.view)?.label || '求职总览'; },
      get spaceName() { return this.state.profile.owner ? this.state.profile.owner + '的求职空间' : '我的求职空间'; },
      get totalTasks() { return this.state.tasks.length; },
      get completed() { return this.state.tasks.filter(t => t.done).length; },
      get percent() { return this.totalTasks ? Math.round(this.completed / this.totalTasks * 100) : 0; },
      get todayTasks() { return this.state.tasks.filter(t => t.due === this.today).sort((a, b) => Number(a.done) - Number(b.done) || a.priority - b.priority); },
      get todayDone() { return this.todayTasks.filter(t => t.done).length; },
      get visibleTasks() { return this.todayTasks.filter(t => this.taskFilter === 'all' || !t.done); },
      get allTasks() { return [...this.state.tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.priority - b.priority || a.due.localeCompare(b.due)); },
      get interviewCount() { return this.state.applications.filter(a => a.status === 'interviewing').length; },
      get feedbackCount() { return this.state.applications.filter(a => a.status !== 'applied').length; },
      get todayEvents() { return this.state.events.filter(e => e.date === this.today).slice().reverse(); },
      get feedback() { return this.statuses.map(s => ({ ...s, count: this.state.applications.filter(a => a.status === s.key).length })); },
      get filteredJobs() {
        const applied = new Set(this.state.applications.map(a => a.jobId));
        let jobs = this.state.jobs;
        if (this.jobFilter === 'pending') jobs = jobs.filter(j => !applied.has(j.id));
        if (this.jobFilter === 'applied') jobs = jobs.filter(j => applied.has(j.id));
        const q = this.query.trim().toLowerCase();
        return q ? jobs.filter(j => [j.company, j.title, j.location, j.source].join(' ').toLowerCase().includes(q)) : jobs;
      },
      get readiness() { return this.state.resumes.length > 0 && this.state.tasks.some(t => t.done && (t.kind === 'case' || t.id === 'task-case' || /案例/.test(t.title))); },
      get currentMilestone() { return !this.state.profile.initialized ? 0 : this.state.applications.some(a => a.status === 'offer') ? 4 : this.state.applications.length ? 3 : this.readiness ? 2 : 1; },
      get milestones() {
        return [
          { title: '背景梳理', detail: '明确方向、收入与地点要求', done: this.state.profile.initialized },
          { title: '投递准备', detail: '一份可投递简历与已完成的项目案例任务', done: this.readiness },
          { title: '开始投递', detail: '记录实际发生的定向投递', done: this.state.applications.length > 0 },
          { title: '拿到 Offer', detail: '记录录用反馈，核对书面条件', done: this.state.applications.some(a => a.status === 'offer') },
          { title: '入职新岗', detail: '完成离职交接与实际入职后，才算到达终点', done: false }
        ];
      },
      get milestoneTitle() { return ['明确求职方向', '完成投递准备', '完成首批投递', '争取匹配的 Offer', '完成交接与入职'][this.currentMilestone]; },
      get milestoneDetail() { return ['填写基本信息，梳理自己的求职约束', '准备好简历和项目案例', '选择合适机会，记录实际投递', '跟进反馈，复盘每次面试', '核对录用条件与到岗安排，继续跟进入职'][this.currentMilestone]; },
      get nextTask() { return this.todayTasks.find(t => !t.done) || this.allTasks.find(t => !t.done) || null; },
      get currentApplications() { return this.state.applications.filter(a => a.jobId === this.activeJob?.id); },
      get panelTitle() {
        return { welcome: '开启下一程', profile: '我的求职信息', task: '添加待办', progress: '记录今日进展', job: '添加岗位', detail: this.activeJob?.title || '岗位详情', milestone: '我的求职目标', connections: '数据与记录', review: '记录面试复盘', install: '添加到主屏幕' }[this.panel] || '';
      },
      priorityName(p) { return ['最先完成', '优先', '常规'][Number(p) - 1] || '常规'; },
      jobName(jobId) { const job = this.state.jobs.find(j => j.id === jobId); return job ? job.company + ' · ' + job.title : '未关联岗位'; },
      statusName(key) { return this.statuses.find(s => s.key === key)?.label || key; },
      nextStep(job) {
        if (!job) return '';
        const app = this.state.applications.find(a => a.jobId === job.id);
        return app ? ({ applied: '安排后续跟进', screening: '确认下一轮沟通', interviewing: '准备面试与复盘', rejected: '整理反馈并复盘', offer: '核对书面录用条件' }[app.status]) : job.next || '核对岗位职责与要求';
      },
      _canMutate(allowResume = false) {
        if (this.loading || !this._loaded) { this.formError = '尚未读到浏览器记录，请先重试读取后再保存。'; return false; }
        if (this.saving || (this.savingResume && !allowResume)) { this.formError = '上一项内容正在保存，请稍候再操作。'; return false; }
        return true;
      },
      _validate(action) {
        try { return action(); } catch (error) { this.formError = error.message || '请检查输入。'; return null; }
      },
      async persist(next, allowResume = false) {
        if (!this._canMutate(allowResume)) return false;
        this.saving = true; this.formError = '';
        try {
          const saved = await S.write(next, this._revision);
          this.state = saved.state; this._revision = saved.revision; this.error = ''; this.formError = '';
          if (this.activeJob) this.activeJob = this.state.jobs.find(j => j.id === this.activeJob.id) || null;
          return true;
        } catch (error) {
          this.error = '保存失败：' + (error.message || '浏览器存储不可用或空间不足。') + ' 当前输入尚未保存，请保留后重试。';
          this.formError = this.error;
          return false;
        } finally { this.saving = false; }
      },
      event(next, title, detail, kind = 'note') {
        const now = new Date();
        next.events.push({ id: id('event'), date: S.dateAt(now), time: new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(now), title, detail, kind });
      },
      notify(text) { this.message = text; clearTimeout(this._messageTimer); this._messageTimer = setTimeout(() => { this.message = ''; }, 5000); },
      async toggleTask(taskId) {
        if (!this._canMutate()) return;
        const next = S.clone(this.state); const task = next.tasks.find(t => t.id === taskId); if (!task) return;
        task.done = !task.done;
        this.event(next, task.done ? '已完成一项准备任务' : '已重新打开一项任务', task.title, 'task');
        if (await this.persist(next)) {
          this.focusId = taskId; clearTimeout(this._focusTimer); this._focusTimer = setTimeout(() => { this.focusId = null; }, 1200);
          this.notify(task.done ? '已标记完成' : '任务已恢复为待办');
        }
      },
      async changePriority(taskId, value) {
        if (!this._canMutate()) return;
        if (![1, 2, 3].includes(Number(value))) { this.formError = '请选择有效的优先级。'; return; }
        const next = S.clone(this.state); const task = next.tasks.find(t => t.id === taskId); if (!task) return;
        task.priority = Number(value); await this.persist(next);
      },
      _focusSheet() {
        this.$nextTick(() => {
          const dialog = this.$refs?.dialog;
          if (!dialog || !this.panel) return;
          const target = [...dialog.querySelectorAll('input:not([type="file"]):not([type="hidden"]),textarea,select')].find(visible);
          (target || dialog).focus();
        });
      },
      open(kind, job = null) {
        if (!['welcome', 'profile', 'task', 'progress', 'job', 'detail', 'review', 'connections', 'milestone', 'install'].includes(kind)) return;
        if (!this.state.profile.initialized && this._loaded && !['welcome', 'connections', 'install'].includes(kind)) kind = 'welcome';
        if (!this.panel) this.modalReturn = document.activeElement;
        this.formError = ''; this.activeJob = job; this.panel = kind;
        if (kind === 'profile') this.profileForm = { ...this.state.profile, starter: false };
        if (job && this.state.jobs.some(j => j.id === job.id)) { this.newProgress.jobId = job.id; this.newReview.jobId = job.id; }
        this._focusSheet();
      },
      close() {
        if (this.saving || this.savingResume) { this.formError = '正在保存，请稍候。'; return; }
        if (this._loaded && !this.state.profile.initialized) {
          this.panel = 'welcome'; this.formError = '请先填写昵称并保存，建立自己的求职空间。'; this._focusSheet(); return;
        }
        this.panel = null; this.formError = '';
        this.$nextTick(() => { if (this.modalReturn?.isConnected) this.modalReturn.focus(); this.modalReturn = null; });
      },
      trapFocus(event) {
        if (!this.panel) return;
        if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
        if (event.key !== 'Tab') return;
        const dialog = this.$refs?.dialog; if (!dialog) return;
        const items = [...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(visible);
        if (!items.length) { event.preventDefault(); dialog.focus(); return; }
        const active = document.activeElement;
        if (!items.includes(active) || (event.shiftKey && active === items[0])) { event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0]).focus(); }
        else if (!event.shiftKey && active === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      },
      async saveProfile() {
        if (!this._canMutate()) return;
        const profile = this._validate(() => ({ owner: inputText(this.profileForm.owner, '昵称', 80, true), city: inputText(this.profileForm.city, '城市', 120), salary: inputText(this.profileForm.salary, '期望薪资', 240), goalWindow: inputText(this.profileForm.goalWindow, '目标时间', 240), initialized: true }));
        if (!profile) return;
        const first = !this.state.profile.initialized;
        const next = S.clone(this.state); next.profile = profile;
        if (first && this.profileForm.starter && next.tasks.length === 0) {
          [
            { title: '核对现有简历与任职信息', kind: 'resume' },
            { title: '整理代表项目案例', kind: 'case' },
            { title: '筛选第一批意向岗位', kind: 'job' }
          ].forEach((task, index) => next.tasks.push({ id: id('task'), ...task, detail: '', category: '求职准备', priority: index + 1, due: this.today, done: false }));
        }
        this.event(next, first ? '已建立个人求职空间' : '已更新求职信息', first ? '从自己的信息与行动开始。' : '求职偏好已保存。', 'profile');
        if (await this.persist(next)) { this.profileForm = { ...profile, starter: false }; this.close(); this.notify(first ? '求职空间已建立' : '求职信息已保存'); }
      },
      async saveTask() {
        if (!this._canMutate()) return;
        const form = this._validate(() => {
          const title = inputText(this.newTask.title, '待办内容', 500, true);
          const priority = Number(this.newTask.priority);
          if (![1, 2, 3].includes(priority)) throw new Error('请选择有效的优先级。');
          const due = this.newTask.due || this.today;
          if (!S.validDate(due)) throw new Error('请选择有效的截止日期。');
          return { title, priority, due };
        });
        if (!form) return;
        const next = S.clone(this.state);
        next.tasks.push({ id: id('task'), ...form, detail: '', category: '自主安排', kind: /案例/.test(form.title) ? 'case' : 'general', done: false });
        this.event(next, '新增一项准备任务', form.title, 'task');
        if (await this.persist(next)) { this.newTask = freshTask(); this.close(); this.notify('待办已添加'); }
      },
      async saveProgress() {
        if (!this._canMutate()) return;
        const form = this._validate(() => {
          if (!['note', 'application'].includes(this.newProgress.type)) throw new Error('请选择进展类型。');
          const note = inputText(this.newProgress.note, '进展内容', 10000, this.newProgress.type === 'note');
          if (this.newProgress.type === 'application') {
            if (!this.state.jobs.some(j => j.id === this.newProgress.jobId)) throw new Error('请先添加岗位，再选择对应岗位记录投递。');
            if (!S.STATUS_KEYS.includes(this.newProgress.status)) throw new Error('请选择有效的投递状态。');
          }
          return { ...this.newProgress, note };
        });
        if (!form) return;
        const next = S.clone(this.state);
        if (form.type === 'application') {
          const current = next.applications.find(a => a.jobId === form.jobId);
          const record = { id: current?.id || id('application'), jobId: form.jobId, status: form.status, date: current?.date || this.today, updated: this.today, note: form.note };
          if (current) Object.assign(current, record); else next.applications.push(record);
          this.event(next, current ? '投递反馈已更新' : '已记录一笔投递', this.jobName(record.jobId) + ' · ' + this.statusName(record.status) + (record.note ? '；' + record.note : ''), 'application');
        } else this.event(next, '新增求职进展', form.note, 'note');
        if (await this.persist(next)) { this.newProgress = freshProgress(); this.close(); this.notify('进展已保存'); }
      },
      async saveJob() {
        if (!this._canMutate()) return;
        const form = this._validate(() => ({ company: inputText(this.newJob.company, '公司名称', 200, true), title: inputText(this.newJob.title, '岗位名称', 200, true), location: inputText(this.newJob.location, '工作地点', 500), salary: inputText(this.newJob.salary, '岗位薪资', 500), source: inputText(this.newJob.source, '岗位来源', 1000) }));
        if (!form) return;
        const next = S.clone(this.state);
        next.jobs.push({ id: id('job'), ...form, location: form.location || '待确认', salary: form.salary || '待沟通', source: form.source || '手动记录', stage: '待评估', next: '核对岗位职责与要求', cue: '继续了解', assessment: '尚待评估' });
        this.event(next, '新增一条岗位机会', form.company + ' · ' + form.title, 'job');
        if (await this.persist(next)) { this.newJob = freshJob(); this.close(); this.notify('岗位已添加'); }
      },
      async saveReview() {
        if (!this._canMutate()) return;
        const form = this._validate(() => {
          if (!this.state.jobs.some(j => j.id === this.newReview.jobId)) throw new Error('请先添加岗位，再选择对应岗位记录复盘。');
          return { jobId: this.newReview.jobId, round: inputText(this.newReview.round, '面试轮次', 100) || '第一轮', content: inputText(this.newReview.content, '复盘内容', 10000, true) };
        });
        if (!form) return;
        const next = S.clone(this.state);
        next.reviews.push({ id: id('review'), ...form, date: this.today });
        this.event(next, '已记录面试复盘', this.jobName(form.jobId) + ' · ' + form.round, 'review');
        if (await this.persist(next)) { this.newReview = freshReview(); this.close(); this.notify('面试复盘已保存'); }
      },
      async uploadResume(event) {
        const input = event.target; const file = input.files?.[0]; if (!file || !this._canMutate()) return;
        if (file.size > S.MAX_RESUME_BYTES) { this.error = '单份简历不能超过 10 MB，请换一份文件。'; this.formError = this.error; return; }
        if (!file.size) { this.error = '这份文件为空，请重新选择。'; this.formError = this.error; return; }
        this.savingResume = true;
        try {
          const content = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error || new Error('文件读取失败。')); reader.onabort = () => reject(new Error('文件读取已取消。')); reader.readAsDataURL(file);
          });
          const next = S.clone(this.state);
          next.resumes.push({ id: id('resume'), name: file.name, size: file.size, type: file.type, content, date: this.today });
          this.event(next, '已添加一份简历', file.name, 'resume');
          if (await this.persist(next, true)) { input.value = ''; this.notify('简历与附件已保存到此浏览器'); }
        } catch (error) { this.error = error.message || '文件读取失败，请保留原文件后重试。'; this.formError = this.error; }
        finally { this.savingResume = false; }
      },
      downloadResume(resume) {
        try {
          if (!this.state.resumes.some(r => r.id === resume?.id)) throw new Error('未找到这份附件。');
          S.attachmentBytes(resume.content);
          const [header, encoded] = resume.content.split(',');
          const binary = atob(encoded); const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
          const type = header.slice(5).replace(/;base64$/, '') || 'application/octet-stream';
          this._download(new Blob([bytes], { type }), resume.name);
        } catch (error) { this.error = '附件下载失败：' + (error.message || '请重试。'); }
      },
      _download(blob, filename) {
        const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
        anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      },
      exportData() {
        if (!this._loaded || this.loading) { this.formError = '请先成功读取记录，再导出备份。'; return; }
        try { this._download(new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' }), '下一程-备份-' + this.today + '.json'); this.notify('已导出当前记录与简历附件'); }
        catch (error) { this.formError = '导出失败，请保留当前浏览器记录后重试。'; }
      },
      async importData(event) {
        const input = event.target; const file = input.files?.[0]; if (!file) return;
        if (this._readingImport || !this._canMutate()) return;
        this._readingImport = true; this.formError = ''; this.pendingImport = null; this.imported = false;
        try {
          if (file.size > S.MAX_IMPORT_BYTES) throw new Error('备份文件超过 100 MB，无法导入。');
          const incoming = S.normalize(JSON.parse(await file.text()));
          this.pendingImport = incoming; this.imported = true;
          input.value = '';
        } catch (error) { this.pendingImport = null; this.imported = false; this.formError = '无法读取此备份。' + (error instanceof SyntaxError ? '请选择有效的 JSON 备份文件。' : error.message || '请检查格式。'); }
        finally { this._readingImport = false; }
      },
      async confirmImport() {
        if (this._readingImport || !this.pendingImport || !this._canMutate()) return;
        if (await this.persist(this.pendingImport)) {
          this.pendingImport = null; this.imported = false;
          this.newTask = freshTask(); this.newProgress = freshProgress(); this.newJob = freshJob(); this.newReview = freshReview();
          this.profileForm = { ...this.state.profile, starter: !this.state.profile.initialized && this.state.tasks.length === 0 };
          if (!this.state.profile.initialized) this.open('welcome');
          this.notify('备份已替换此浏览器的记录');
        }
      }
    }));
  });
})();
