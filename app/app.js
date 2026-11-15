/* NextStep desktop. Local records, explicit outcomes, revision-checked writes. */
(() => {
  'use strict';
  const S = window.NextStepStore;
  const uid = prefix => prefix + '-' + crypto.randomUUID();
  const text = (v, label, max=10000, required=false) => {
    if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw Error('请填写' + label + (v?.length > max ? '（最多 '+max+' 字）' : '') + '。');
    return v.trim();
  };
  const today = () => S.dateAt();
  const taskDraft = jobId => ({ id:'',title:'',priority:2,due:today(),detail:'',category:'求职准备',jobId:jobId||'',stepsText:'' });
  const jobDraft = () => ({id:'',company:'',title:'',location:'',salary:'',source:'',url:'',verifiedOn:'',contact:'',next:'',jd:'',assessment:''});
  const reviewDraft = jobId => ({id:'',jobId:jobId||'',interviewId:'',round:'第一轮',date:today(),questions:'',answers:'',reflection:'',improvement:'',content:''});
  const focusable = el => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const safeURL = value => { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch{return '';} };
  document.addEventListener('pointerdown',()=>{document.documentElement.dataset.inputMode='pointer';},{passive:true});
  document.addEventListener('keydown',e=>{if(e.key==='Tab')document.documentElement.dataset.inputMode='keyboard';});
  document.addEventListener('alpine:init', () => Alpine.data('desktopApp', () => ({
    demoMode:window.NEXTSTEP_DEMO===true, state:S.initial(), view:'overview', loading:true, saving:false, fileReading:false, loaded:false, revision:0,
    remotePending:false,error:'', formError:'', message:'', undo:null, panel:'', activeId:'', returnFocus:null, dirtySnapshot:'', discard:false,
    taskFilter:'pending', taskQuery:'', taskPeriod:'all', planSearchOpen:false, jobFilter:'active', jobIncludeArchived:false, jobQuery:'', resumeQuery:'', reviewQuery:'', reviewJob:'', detailTab:'overview', activityQuery:'',
    homeList:'today', feedbackOpen:false, searchOpen:{jobs:false,reviews:false,resumes:false}, choice:null, choiceQuery:'', choiceReturnFocus:null, jobFilterDraft:'active', jobArchivedDraft:false,
    taskContext:null, resumeContextId:'', form:{}, file:null, importData:null, importFileName:'', importConfirmed:false, confirmChecked:false, confirmation:null, focusId:'', timeNow:Date.now(),
    navs:[{key:'overview',label:'求职总览',icon:'grid'},{key:'jobs',label:'岗位机会',icon:'briefcase'},{key:'tasks',label:'行动计划',icon:'plan'},{key:'resumes',label:'我的简历',icon:'file'},{key:'reviews',label:'面试复盘',icon:'chat'}],
    statuses:[{key:'applied',label:'等待反馈'},{key:'screening',label:'筛选沟通'},{key:'interviewing',label:'面试中'},{key:'rejected',label:'未通过'},{key:'offer',label:'收到 Offer'}],
    async init(){
      window.addEventListener('nextstep:space-changed',()=>{const c=window.NextStepCloud;if(!c.canUse){this.panel='';this.choice=null;this.form={};this.file=null;this.importData=null;this.importFileName='';this.undo=null;this.message='';this.error='';this.formError='';this.confirmation=null;this.dirtySnapshot='';this.remotePending=false;this.activeId='';this.taskQuery='';this.jobQuery='';this.resumeQuery='';this.reviewQuery='';this.activityQuery='';this.loaded=false;this.loading=false;this.state=S.initial();return;}this.load();});
      window.addEventListener('nextstep:cloud-status',()=>this.readCloudUpdate());
      this.$watch('panel',value=>{if(!value&&this.remotePending)this.readCloudUpdate();});
      await window.NextStepCloud.ready;

      this.route(); window.addEventListener('hashchange',()=>this.route());
      window.addEventListener('beforeunload',e=>{if(this.isDirty||this.saving||this.fileReading){e.preventDefault();e.returnValue='';}});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.timeNow=Date.now();});
      this.viewportHandler=()=>{const v=window.visualViewport;document.documentElement.style.setProperty('--visual-height',(v?.height||window.innerHeight)+'px');document.documentElement.style.setProperty('--visual-top',(v?.offsetTop||0)+'px');};this.viewportHandler();window.visualViewport?.addEventListener('resize',this.viewportHandler);window.visualViewport?.addEventListener('scroll',this.viewportHandler);window.addEventListener('resize',this.viewportHandler);
      this.timer=setInterval(()=>{this.timeNow=Date.now();},60000);
      if(window.NextStepCloud.canUse)await this.load();else this.loading=false;
    },
    readCloudUpdate(){const c=window.NextStepCloud;if(c.mode!=='cloud')return;const r=c.readCloud();if(!r)return;if(!c.pending && this.message.endsWith(' · 待同步'))this.message=this.message.slice(0,-6);if(r.revision===this.revision)return;if(!c.canApplyIncoming(this,r.state)){this.remotePending=true;return;}this.state=r.state;this.revision=r.revision;this.loaded=true;this.error='';this.remotePending=false;},
    destroy(){window.visualViewport?.removeEventListener('resize',this.viewportHandler);window.visualViewport?.removeEventListener('scroll',this.viewportHandler);window.removeEventListener('resize',this.viewportHandler);clearInterval(this.timer);clearTimeout(this.messageTimer);},
    route(){const key=location.hash.slice(1);this.view=[...this.navs.map(n=>n.key),'settings'].includes(key)?key:'overview';},
    go(view){if(this.panel){this.close();return;} this.view=view;if(view==='overview')this.taskFilter='pending';location.hash=view;window.scrollTo(0,0);this.$nextTick(()=>this.$refs.pageTitle?.focus({preventScroll:true}));},
    async load(){
      if(this.saving||this.fileReading)return;
      this.loading=true;
      try{const r=await S.read();this.state=r.state;this.revision=r.revision;this.loaded=true;this.error='';if(!this.state.profile.initialized)this.open('welcome');}
      catch(e){this.loaded=false;this.error='未能读取浏览器记录，原数据未被覆盖。'+e.message;}
      finally{this.loading=false;}
    },
    get today(){this.timeNow;return today();},
    get dateText(){this.timeNow;return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date());},
    get salaryLabel(){return (this.state.profile.salary||'待补充').replace(/\s*\/\s*年\s*$/,'');},
    get shortDate(){return this.today.slice(5).replace('-','.');},
    get heading(){return this.navs.find(n=>n.key===this.view)?.label||'数据与设置';},
    get spaceName(){return this.state.profile.owner?this.state.profile.owner+'的求职空间':'我的求职空间';},
    get completed(){return this.state.tasks.filter(t=>t.done).length;},
    get remaining(){return this.state.tasks.length-this.completed;},
    get percent(){return this.state.tasks.length?Math.round(this.completed/this.state.tasks.length*100):0;},
    get taskProgressText(){return this.state.tasks.length?`${this.completed} / ${this.state.tasks.length} 项已完成`:'还没有准备任务';},
    showPreparation(){this.taskFilter='all';this.taskPeriod='all';this.taskQuery='';this.planSearchOpen=false;this.go('tasks');},
    get dueTasks(){return this.state.tasks.filter(t=>t.due<=this.today).sort((a,b)=>Number(a.done)-Number(b.done)||a.priority-b.priority||a.due.localeCompare(b.due));},
    get todayTasks(){return this.dueTasks.filter(t=>this.taskFilter==='all'||!t.done).slice(0,4);},
    get dueRemaining(){return this.dueTasks.filter(t=>!t.done).length;},
    openPlanSearch(){this.planSearchOpen=true;this.$nextTick(()=>this.$refs.planSearch?.focus());},
    cancelPlanSearch(){this.taskQuery='';this.planSearchOpen=false;},
    openSearch(kind){this.searchOpen[kind]=true;this.$nextTick(()=>this.$refs[kind+'Search']?.focus());},
    cancelSearch(kind){this[kind==='jobs'?'jobQuery':kind==='reviews'?'reviewQuery':'resumeQuery']='';this.searchOpen[kind]=false;},
    categoryLabel(value){return {'我的简历':'简历','项目案例':'案例','面试准备':'面试','岗位沟通':'沟通','求职准备':'准备'}[value]||value;},
    get homeTasks(){return this.dueTasks.filter(t=>!t.done);},
    get homePlanCount(){return this.homeTasks.length+this.homeInterviews.length;},
    get filteredTasks(){const q=this.taskQuery.trim().toLowerCase();return this.state.tasks.filter(t=>(this.taskFilter==='all'||(this.taskFilter==='done'?t.done:!t.done))&&(this.taskPeriod==='all'||(this.taskPeriod==='overdue'?t.due<this.today:this.taskPeriod==='today'?t.due===this.today:t.due>this.today))&&(!q||[t.title,t.detail,this.jobName(t.jobId)].join(' ').toLowerCase().includes(q))).sort((a,b)=>Number(a.done)-Number(b.done)||a.priority-b.priority||a.due.localeCompare(b.due));},
    get taskGroups(){return [1,2,3].map(priority=>({priority,label:this.priorityName(priority),tasks:this.filteredTasks.filter(t=>t.priority===priority)})).filter(g=>g.tasks.length);},
    get activeJobs(){return this.state.jobs.filter(j=>!j.archived);},
    get isApplicationFilter(){return this.jobFilter==='submitted'||this.jobFilter==='feedback'||this.statuses.some(s=>s.key===this.jobFilter);},
    jobsMatching(filter,includeArchived=false,query=''){const q=query.trim().toLowerCase();return this.state.jobs.filter(j=>{const a=this.application(j.id);return (filter==='archived'?j.archived:(includeArchived||!j.archived))&&(filter==='pending'?!a:filter==='submitted'?!!a:filter==='feedback'?!!a&&a.status!=='applied':this.statuses.some(s=>s.key===filter)?a?.status===filter:true)&&(!q||[j.company,j.title,j.location,j.source].join(' ').toLowerCase().includes(q));}).slice().reverse();},
    get filteredJobs(){return this.jobsMatching(this.jobFilter,this.jobIncludeArchived,this.jobQuery);},
    jobScopeCount(key){return this.jobsMatching(key).length;},
    get jobFilterLabel(){return this.statuses.find(s=>s.key===this.jobFilter)?.label||(this.jobFilter==='feedback'?'有反馈':'');},
    get draftJobCount(){return this.jobsMatching(this.jobFilterDraft,this.jobArchivedDraft,this.jobQuery).length;},
    beginJobFilters(){this.jobFilterDraft=this.jobFilter;this.jobArchivedDraft=this.jobIncludeArchived;this.open('job-filters');},
    applyJobFilters(){this.jobFilter=this.jobFilterDraft;this.jobIncludeArchived=this.jobArchivedDraft;this.close();},
    setJobScope(key){this.jobFilter=key;this.jobIncludeArchived=false;},
    showApplicationStage(key){this.jobQuery='';this.jobFilter=key;this.jobIncludeArchived=true;this.go('jobs');},
    get homeOpportunityJobs(){return this.activeJobs.filter(j=>!['rejected','offer'].includes(this.application(j.id)?.status)).slice().reverse();},
    get recommendedJobs(){return this.activeJobs.filter(j=>!['rejected','offer'].includes(this.application(j.id)?.status)).slice().reverse().slice(0,4);},
    get interviewCount(){return new Set([...this.state.applications.filter(a=>a.status==='interviewing').map(a=>a.jobId),...this.state.interviews.filter(i=>i.status==='scheduled').map(i=>i.jobId)]).size;},
    get feedbackCount(){return this.state.applications.filter(a=>a.status!=='applied').length;},
    get applicationStages(){
      const total=this.state.applications.length;
      return [
        {key:'submitted',label:'已记录投递',count:total,detail:'所有实际投递记录，包含已归档岗位。'},
        {key:'feedback',label:'其中有反馈',count:this.feedbackCount,detail:'最新状态为筛选沟通、面试中、未通过或收到 Offer。'},
        {key:'interviewing',label:'其中面试中',count:this.state.applications.filter(a=>a.status==='interviewing').length,detail:'已记录投递中，最新状态为面试中的岗位。'}
      ].map(s=>({...s,height:total?s.count/total*100:0}));
    },
    pipelineConnector(index){const stages=this.applicationStages,a=stages[index].height,b=stages[index+1]?.height??a;return `0,${100-a} 100,${100-b} 100,100 0,100`;},
    get feedback(){return this.statuses.map(s=>({...s,count:this.state.applications.filter(a=>a.status===s.key).length}));},
    get todayEvents(){return this.state.events.filter(e=>e.date===this.today).slice().reverse();},
    get filteredEvents(){const q=this.activityQuery.trim().toLowerCase();return this.state.events.slice().reverse().filter(e=>!q||(e.title+' '+e.detail).toLowerCase().includes(q));},
    get readiness(){return this.state.resumes.length>0&&this.state.tasks.some(t=>t.done&&(t.kind==='case'||/案例/.test(t.title)));},
    get stage(){if(this.state.profile.joinedOn&&this.state.profile.joinedOn<=this.today)return 5;if(this.state.applications.some(a=>a.status==='offer'))return 4;if(this.interviewCount||this.state.interviews.some(i=>i.status==='completed'))return 3;if(this.state.applications.length)return 2;return 1;},
    get milestoneTitle(){return ['','准备好第一轮投递','跟进投递，获得反馈','准备下一次面试','核对条件，安排入职','已入职，开启下一程'][this.stage];},
    get milestoneDetail(){return ['','完善简历和案例，筛选第一轮意向岗位。','核实团队与职责，及时跟进沟通。','准备相关案例，把面试复盘转成行动。','确认书面录用条件，完成离职交接与入职。','入职日期已由你确认，求职记录继续保留。'][this.stage];},
    get stageLabel(){return ['','投递准备','定向投递','面试推进','录用与交接','已入职'][this.stage];},
    get nextStageLabel(){return ['','开始定向投递','进入面试','收到 Offer','实际入职','开启新阶段'][this.stage];},
    get planInterviews(){const q=this.taskQuery.trim().toLowerCase();return this.interviews.filter(i=>(this.taskFilter==='all'||(this.taskFilter==='done'?i.status==='completed':i.status==='scheduled'))&&(this.taskPeriod==='all'||(this.taskPeriod==='overdue'?i.date<this.today:this.taskPeriod==='today'?i.date===this.today:i.date>this.today))&&(!q||[this.jobName(i.jobId),i.round,i.method,i.note].join(' ').toLowerCase().includes(q)));},
    get homeInterviews(){return this.nextInterview?[this.nextInterview]:[];},
    jobCompany(id){return this.state.jobs.find(j=>j.id===id)?.company||'公司待补充';},
    jobTitle(id){return this.state.jobs.find(j=>j.id===id)?.title||'岗位待补充';},
    scheduleDate(i){const d=new Date(i.date+'T12:00:00+08:00');return (i.date===this.today?'今天':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'short',...(i.date.slice(0,4)!==this.today.slice(0,4)?{year:'numeric'}:{})}).format(d))+' '+i.time;},
    get nextInterview(){return this.state.interviews.filter(i=>i.status==='scheduled'&&i.date>=this.today).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];},
    get interviews(){return this.state.interviews.slice().sort((a,b)=>Number(a.status!=='scheduled')-Number(b.status!=='scheduled')||(a.date+a.time).localeCompare(b.date+b.time));},
    get filteredReviews(){const q=this.reviewQuery.trim().toLowerCase();return this.state.reviews.filter(r=>(!this.reviewJob||r.jobId===this.reviewJob)&&(!q||[this.jobName(r.jobId),r.round,r.content,r.questions,r.reflection].join(' ').toLowerCase().includes(q))).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));},
    choicesFor(target){
      if(target==='taskPeriod')return [{value:'all',label:'全部日期'},{value:'overdue',label:'今天前'},{value:'today',label:'今天'},{value:'upcoming',label:'明天起'}];
      if(target==='reviewJob')return [{value:'',label:'全部岗位'},...this.state.jobs.filter(j=>this.state.reviews.some(r=>r.jobId===j.id)).map(j=>({value:j.id,label:j.company,detail:j.title}))];
      if(target==='field:priority')return [1,2,3].map(value=>({value:String(value),label:this.priorityName(value)}));
      if(target==='field:jobId')return [{value:'',label:['interview','review'].includes(this.panel)?'选择关联岗位':'不关联岗位'},...this.state.jobs.map(j=>({value:j.id,label:j.company,detail:j.title}))];
      if(target==='field:status')return this.panel==='interview'?[{value:'scheduled',label:'已安排 / 待跟进'},{value:'completed',label:'已结束'},{value:'cancelled',label:'已取消'}]:this.statuses.map(s=>({value:s.key,label:s.label}));
      if(target==='field:resumeId')return [{value:'',label:'不关联简历'},...this.state.resumes.map(r=>({value:r.id,label:r.label||r.name,detail:(r.versionLabel||'原始版本')+' · '+r.name}))];
      return [];
    },
    choiceValue(target){return String(target.startsWith('field:')?this.form[target.slice(6)]??'':this[target]??'');},
    choiceLabel(target){const row=this.choicesFor(target).find(o=>o.value===this.choiceValue(target));return row?row.label+(row.detail?' · '+row.detail:''):'请选择';},
    openChoice(target,title){if(!this.choicesFor(target).length)return;this.choiceReturnFocus=document.activeElement;this.choiceQuery='';this.choice={target,title};this.$nextTick(()=>{const d=this.$refs.choiceDialog;const items=[...(d?.querySelectorAll('[role=radio]')||[])];(items.find(e=>e.getAttribute('aria-checked')==='true')||items[0]||d)?.focus({preventScroll:true});});},
    get visibleChoices(){const q=this.choiceQuery.trim().toLowerCase();return this.choice?this.choicesFor(this.choice.target).filter(o=>!q||(o.label+' '+(o.detail||'')).toLowerCase().includes(q)):[];},
    chooseValue(value){if(!this.choice||!this.choicesFor(this.choice.target).some(o=>o.value===value))return;const target=this.choice.target;if(target.startsWith('field:'))this.form[target.slice(6)]=value;else this[target]=value;this.closeChoice();},
    closeChoice(){this.choice=null;this.choiceQuery='';this.$nextTick(()=>{if(this.choiceReturnFocus?.isConnected)this.choiceReturnFocus.focus({preventScroll:true});});},
    moveChoiceFocus(e,delta){e.preventDefault();const items=[...this.$refs.choiceDialog.querySelectorAll('[role=radio]')].filter(focusable);const i=items.indexOf(document.activeElement);items[(i+delta+items.length)%items.length]?.focus();},
    get resumeGroups(){
      const q=this.resumeQuery.trim().toLowerCase(),groups=new Map();
      this.state.resumes.forEach(r=>{const k=r.groupId||r.id;groups.set(k,[...(groups.get(k)||[]),r]);});
      return [...groups.entries()].map(([id,all])=>({id,latest:all.at(-1),total:all.length,versions:all.filter(r=>!q||[r.name,r.label,r.note,r.versionLabel].join(' ').toLowerCase().includes(q)).reverse()})).filter(g=>g.versions.length).reverse();
    },
    get resumeSummary(){return this.resumeQuery.trim()?'找到 '+this.resumeGroups.reduce((n,g)=>n+g.versions.length,0)+' 个版本':new Set(this.state.resumes.map(r=>r.groupId||r.id)).size+' 份简历 · '+this.state.resumes.length+' 个版本';},
    nextResumeVersion(groupId){const rows=this.state.resumes.filter(r=>(r.groupId||r.id)===groupId);return 'V'+(Math.max(rows.length,...rows.map(r=>Number(/^V(\d+)(?=\D|$)/i.exec(r.versionLabel||'')?.[1]||0)))+1);},
    get selectedResume(){return this.state.resumes.find(r=>r.id===this.activeId);},
    get selectedJob(){return this.state.jobs.find(j=>j.id===this.activeId);},
    get selectedInterview(){return this.state.interviews.find(i=>i.id===this.activeId);},
    get selectedTask(){return this.state.tasks.find(t=>t.id===this.activeId);},
    get jobTasks(){return this.state.tasks.filter(t=>t.jobId===this.activeId);},
    get jobReviews(){return this.state.reviews.filter(r=>r.jobId===this.activeId).slice().reverse();},
    get jobInterviews(){return this.state.interviews.filter(i=>i.jobId===this.activeId).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));},
    get jobEvents(){return this.state.events.filter(e=>e.jobId===this.activeId).slice().reverse();},
    get activeApp(){return this.application(this.activeId);},
    get isDirty(){return !!this.dirtySnapshot&&JSON.stringify(this.form)!==this.dirtySnapshot;},
    get panelTitle(){return {welcome:'开启下一程',profile:'求职目标',task:this.form.id?'编辑行动':'添加行动','interview-detail':'面试日程','task-detail':'行动详情','resume-detail':'简历版本',job:this.form.id?'编辑岗位':'添加岗位','job-detail':'岗位详情',application:this.activeApp?'更新投递反馈':'记录实际投递',interview:this.form.id?'编辑面试安排':'安排面试',review:this.form.id?'编辑面试复盘':'记录面试复盘',resume:this.form.id?'编辑简历信息':this.form.groupId?'添加新版本':'新增简历',progress:this.form.id?'编辑进展':'记录进展',activity:'全部进展',import:'恢复备份',confirm:this.confirmation?.title||'确认操作',goal:'求职里程碑','job-filters':'筛选岗位','today-activity':'今日进展'}[this.panel]||'';},
    priorityName(p){return ['最先完成','优先','常规'][Number(p)-1]||'常规';},
    application(jobId){return this.state.applications.find(a=>a.jobId===jobId);},
    jobName(jobId){const j=this.state.jobs.find(j=>j.id===jobId);return j?j.company+' · '+j.title:'未关联岗位';},
    statusName(key){return this.statuses.find(s=>s.key===key)?.label||'待推进';},
    nextStep(j){const a=this.application(j.id);return j.next||({applied:'跟进投递反馈',screening:'确认后续沟通',interviewing:'准备面试与复盘',rejected:'整理反馈',offer:'核对书面录用条件'}[a?.status])||'核对岗位要求';},
    safeURL, size(bytes){return bytes<1024*1024?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1024/1024).toFixed(1)+' MB';},
    resumeUses(r){return this.state.applications.filter(a=>a.resumeId===r.id).length;},
    interviewStatus(i){return {scheduled:i.date<this.today?'待确认结果':'已安排',completed:'已结束',cancelled:'已取消'}[i.status];},
    async commit(next){
      if(!this.loaded||this.loading){this.formError='尚未读取记录，请先重试。';return false;}
      if(this.saving){return false;}this.saving=true;this.formError='';
      try{const result=await S.write(next,this.revision);this.state=result.state;this.revision=result.revision;this.error='';return true;}
      catch(e){this.error=e.code==='CONFLICT'?'暂未保存：记录有新版本，当前输入已保留。':'保存失败：'+e.message+' 输入已保留。';this.formError=this.error;return false;}
      finally{this.saving=false;}
    },
    validate(fn){try{this.formError='';return fn();}catch(e){this.formError=e.message;this.$nextTick(()=>this.$refs.formError?.focus());return null;}},
    event(next,title,detail='',kind='note',jobId='',date=this.today){next.events.push({id:uid('event'),date,time:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()),title,detail,kind,jobId});},
    notify(message,undo=null){if(window.NextStepCloud.mode==='cloud'&&window.NextStepCloud.pending)message+=' · 待同步';this.message=message;this.undo=undo;clearTimeout(this.messageTimer);this.messageTimer=setTimeout(()=>{this.message='';this.undo=null;},undo?10000:5000);},
    async undoAction(){if(!this.undo)return;const next=S.clone(this.state);const {collection,item,index}=this.undo;if(!next[collection].some(x=>x.id===item.id))next[collection].splice(Math.min(index,next[collection].length),0,item);this.event(next,'已撤销删除',item.title||item.label||item.name||this.jobName(item.jobId),'manage',item.jobId||'');if(await this.commit(next)){this.notify('已撤销删除');}},
    open(kind,id='',preset={}){
      if(this.saving||this.fileReading)return;
      const previousPanel=this.panel,previousId=this.activeId;
      if(!this.panel)this.returnFocus=document.activeElement;
      this.activeId=id;this.formError='';this.discard=false;this.file=null;this.panel=kind;
      if(kind==='resume')this.resumeContextId=previousPanel==='resume-detail'?previousId:'';
      if(kind==='task')this.taskContext=['job-detail','interview-detail'].includes(previousPanel)?{panel:previousPanel,id:previousId}:null;
      if(kind==='welcome'||kind==='profile')this.form={...this.state.profile,starter:!this.state.profile.initialized};
      else if(kind==='task'){const t=this.state.tasks.find(t=>t.id===id);this.form=t?{...S.clone(t),stepsText:(t.steps||[]).map(s=>s.title).join('\n')}:{...taskDraft(preset.jobId),...preset};}
      else if(kind==='job'){const j=this.state.jobs.find(j=>j.id===id);this.form=j?{...jobDraft(),...S.clone(j)}:jobDraft();}
      else if(kind==='application'){const a=this.application(id);this.form=a?{date:this.today,updated:this.today,...S.clone(a),resumeId:a.resumeId||''}:{jobId:id,status:'applied',date:this.today,updated:this.today,resumeId:'',note:''};this.form.nextStep=this.state.jobs.find(j=>j.id===id)?.next||'';}
      else if(kind==='interview'){const i=this.state.interviews.find(i=>i.id===id);this.form=i?S.clone(i):{id:'',jobId:preset.jobId||'',date:this.today,time:'10:00',round:'第一轮',method:'视频面试',note:'',status:'scheduled'};}
      else if(kind==='review'){const r=this.state.reviews.find(r=>r.id===id);this.form=r?{...reviewDraft(),...S.clone(r)}:{...reviewDraft(preset.jobId),...preset};}
      else if(kind==='resume'){const r=this.state.resumes.find(r=>r.id===id);this.form=r?S.clone(r):{id:'',name:'',label:preset.label||'',versionLabel:preset.versionLabel||(preset.groupId?this.nextResumeVersion(preset.groupId):'V1'),groupId:preset.groupId||'',note:'',...preset};}
      else if(kind==='progress'){const e=this.state.events.find(e=>e.id===id&&e.kind==='note');this.form=e?S.clone(e):{id:'',title:'',detail:'',date:this.today,jobId:preset.jobId||''};}
      else this.form={};
      if(kind==='job-detail')this.detailTab='overview';
      this.dirtySnapshot=['welcome','profile','task','job','application','interview','review','resume','progress'].includes(kind)?JSON.stringify(this.form):'';
      this.$nextTick(()=>{const d=this.$refs.dialog;([...(d?.querySelectorAll('input:not([type=file]),textarea,select')||[])].find(focusable)||d)?.focus();});
    },
    close(force=false){if(this.saving||this.fileReading)return;if(!force&&this.isDirty){this.discard=true;return;}if(this.panel==='resume'&&this.resumeContextId&&this.state.resumes.some(r=>r.id===this.resumeContextId)){const id=this.resumeContextId;this.resumeContextId='';this.open('resume-detail',id);return;}this.resumeContextId='';this.panel='';this.dirtySnapshot='';this.formError='';this.discard=false;this.$nextTick(()=>{if(this.returnFocus?.isConnected)this.returnFocus.focus();});},
    trap(e){if(!this.panel&&!this.choice)return;if(e.key==='Escape'){e.preventDefault();this.choice?this.closeChoice():this.close();return;}if(e.key!=='Tab')return;const d=this.choice?this.$refs.choiceDialog:this.$refs.dialog;const items=[...d.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(focusable);if(!items.length){e.preventDefault();d.focus();return;}const first=items[0],last=items.at(-1);if(!items.includes(document.activeElement)||(e.shiftKey&&document.activeElement===first)){e.preventDefault();(e.shiftKey?last:first).focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}},
    async saveProfile(){const p=this.validate(()=>({owner:text(this.form.owner,'称呼',80,true),city:text(this.form.city,'意向地点',120),salary:text(this.form.salary,'期望年包',240),goalWindow:text(this.form.goalWindow,'目标 Offer 时间',240),joinedOn:this.form.joinedOn||'',initialized:true}));if(!p)return;if(p.joinedOn&&(!S.validDate(p.joinedOn)||p.joinedOn>this.today)){this.formError='实际入职日期应为今天或过去的日期。';return;}const next=S.clone(this.state);const first=!next.profile.initialized;next.profile=p;if(first&&this.form.starter&&!next.tasks.length){[['核对现有简历与任职信息','resume'],['整理代表项目案例','case'],['筛选第一批意向岗位','job']].forEach(([title,kind],i)=>next.tasks.push({id:uid('task'),title,kind,priority:i+1,due:this.today,done:false,detail:'',category:'求职准备',jobId:'',steps:[]}));}this.event(next,first?'已建立求职空间':'已更新求职目标',p.owner,'profile');if(await this.commit(next)){this.close(true);this.notify('求职信息已保存');}},
    async saveTask(){const row=this.validate(()=>{const priority=Number(this.form.priority);if(![1,2,3].includes(priority)||!S.validDate(this.form.due))throw Error('请填写有效的优先级与截止日期。');if(this.form.jobId&&!this.state.jobs.some(j=>j.id===this.form.jobId))throw Error('关联岗位不存在。');const old=this.state.tasks.find(t=>t.id===this.form.id);const lines=this.form.stepsText.split('\n').map(l=>l.trim()).filter(Boolean);if(lines.length>40)throw Error('最多添加 40 个子步骤。');return {id:this.form.id||uid('task'),title:text(this.form.title,'行动标题',500,true),priority,due:this.form.due,detail:text(this.form.detail||'','补充说明'),category:text(this.form.category||'求职准备','行动分类',100),jobId:this.form.jobId||'',kind:old?.kind||(/案例/.test(this.form.title)?'case':'general'),done:old?.done||false,steps:lines.map(title=>({title,done:old?.steps?.find(s=>s.title===title)?.done||false}))};});if(!row)return;const next=S.clone(this.state),i=next.tasks.findIndex(t=>t.id===row.id);if(i<0)next.tasks.push(row);else next.tasks[i]=row;this.event(next,i<0?'新增行动计划':'更新行动计划',row.title,'task',row.jobId);if(await this.commit(next)){const context=this.taskContext;if(context){this.open(context.panel,context.id);if(context.panel==='job-detail')this.detailTab='related';}else this.close(true);this.taskContext=null;this.focusId=row.id;this.notify('行动已保存');}},
    async toggleTask(id){if(this.saving)return;const next=S.clone(this.state),t=next.tasks.find(t=>t.id===id);if(!t)return;t.done=!t.done;this.event(next,t.done?'完成准备任务':'重新打开任务',t.title,'task',t.jobId||'');if(await this.commit(next))this.notify(t.done?'任务已完成':'已恢复为待办');},
    async toggleStep(index){const next=S.clone(this.state),t=next.tasks.find(t=>t.id===this.activeId);if(t?.steps?.[index]){t.steps[index].done=!t.steps[index].done;await this.commit(next);}},
    async remove(collection,id){if(this.saving)return;const next=S.clone(this.state),index=next[collection].findIndex(t=>t.id===id);if(index<0)return;const [item]=next[collection].splice(index,1);this.event(next,'删除'+({tasks:'行动',resumes:'简历文件',reviews:'复盘',interviews:'面试安排',events:'进展',applications:'投递记录'}[collection]||'记录'),item.title||item.label||item.name||item.round||'','manage',item.jobId||'');if(await this.commit(next)){this.close(true);this.notify('记录已删除',{collection,item,index});}},
    async saveJob(){const j=this.validate(()=>{const url=text(this.form.url||'','来源链接',2000);if(url&&!safeURL(url))throw Error('来源链接请使用完整的 http 或 https 网址。');if(this.form.verifiedOn&&!S.validDate(this.form.verifiedOn))throw Error('请填写有效的核验日期。');return {...this.form,id:this.form.id||uid('job'),company:text(this.form.company,'公司名称',200,true),title:text(this.form.title,'岗位名称',200,true),location:text(this.form.location||'','工作地点',500),salary:text(this.form.salary||'','薪资',500),source:text(this.form.source||'','岗位来源',1000),url,contact:text(this.form.contact||'','联系人',1000),next:text(this.form.next||'','下一步',500),jd:text(this.form.jd||'','岗位说明',30000),assessment:text(this.form.assessment||'','匹配判断',10000),archived:this.form.archived||false};});if(!j)return;const next=S.clone(this.state),i=next.jobs.findIndex(x=>x.id===j.id);if(i<0)next.jobs.push(j);else next.jobs[i]=j;this.event(next,i<0?'保存岗位机会':'更新岗位信息',j.company+' · '+j.title,'job',j.id);if(await this.commit(next)){this.open('job-detail',j.id);this.notify('岗位已保存');}},
    async archiveJob(){const next=S.clone(this.state),j=next.jobs.find(j=>j.id===this.activeId);if(!j)return;j.archived=!j.archived;this.event(next,j.archived?'归档岗位':'恢复岗位',j.company+' · '+j.title,'job',j.id);if(await this.commit(next)){this.close(true);this.notify(j.archived?'岗位已归档，历史记录保留':'已恢复到岗位列表');}},
    async saveApplication(){const f=this.validate(()=>{if(!this.state.jobs.some(j=>j.id===this.form.jobId))throw Error('请选择岗位。');if(!S.STATUS_KEYS.includes(this.form.status)||!S.validDate(this.form.date)||!S.validDate(this.form.updated))throw Error('请填写有效的日期与反馈状态。');if(this.form.date>this.today||this.form.updated>this.today)throw Error('实际投递和反馈日期不能晚于今天。');if(this.form.updated<this.form.date)throw Error('反馈日期不能早于投递日期。');return {...this.form,note:text(this.form.note||'','反馈说明'),nextStep:text(this.form.nextStep===undefined?(this.state.jobs.find(j=>j.id===this.form.jobId)?.next||''):this.form.nextStep,'岗位下一步')};});if(!f)return;const next=S.clone(this.state),old=next.applications.find(a=>a.jobId===f.jobId);const resume=next.resumes.find(r=>r.id===f.resumeId);const {nextStep,...applicationFields}=f;next.jobs.find(j=>j.id===f.jobId).next=nextStep;const record={...old,...applicationFields,id:old?.id||uid('application')};if(resume&&(!old||old.resumeId!==resume.id)){record.resumeSnapshot=S.clone(resume);record.resumeHistory=[...(old?.resumeHistory||[]),...(old?.resumeSnapshot?[{...old.resumeSnapshot,recordedOn:old.updated||old.date}]:[])];}else if(old&&f.resumeId===old.resumeId)record.resumeSnapshot=old.resumeSnapshot;else if(!f.resumeId){if(old?.resumeSnapshot){this.formError='历史投递材料已留存，请选择其他版本更换，不能移除历史快照。';return;}}if(old)Object.assign(old,record);else next.applications.push(record);this.event(next,old?'更新投递反馈':'记录实际投递',this.jobName(f.jobId)+' · '+this.statusName(f.status)+(f.note?'；'+f.note:''),'application',f.jobId,f.updated);if(await this.commit(next)){this.open('job-detail',f.jobId);this.detailTab='history';this.notify('投递记录已保存');}},
    async saveInterview(){const f=this.validate(()=>{if(!this.state.jobs.some(j=>j.id===this.form.jobId))throw Error('请先保存岗位，再安排面试。');if(!S.validDate(this.form.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.form.time||''))throw Error('请填写有效的面试日期与时间。');if(!['scheduled','completed','cancelled'].includes(this.form.status))throw Error('请选择面试状态。');if(this.form.status==='completed'&&this.form.date>this.today)throw Error('已结束的面试日期不能晚于今天。');return {...this.form,id:this.form.id||uid('interview'),round:text(this.form.round,'轮次',100,true),method:text(this.form.method||'','面试方式',500),note:text(this.form.note||'','面试准备')};});if(!f)return;const next=S.clone(this.state),i=next.interviews.findIndex(x=>x.id===f.id);if(i<0)next.interviews.push(f);else next.interviews[i]=f;this.event(next,i<0?'安排面试':'更新面试安排',this.jobName(f.jobId)+' · '+f.round+' · '+f.date+' '+f.time,'interview',f.jobId);if(await this.commit(next)){this.close(true);this.notify('面试安排已保存');}},
    async saveReview(){const f=this.validate(()=>{if(!this.state.jobs.some(j=>j.id===this.form.jobId))throw Error('请先保存岗位，再选择关联岗位。');if(!S.validDate(this.form.date)||this.form.date>this.today)throw Error('复盘日期应为今天或过去的日期。');const linked=this.state.interviews.find(i=>i.id===this.form.interviewId);if(linked&&linked.jobId===this.form.jobId&&linked.date>this.today)throw Error('这场面试还未发生，请先记录准备任务。');const fields=['questions','answers','reflection','improvement','content'];const row={...this.form,id:this.form.id||uid('review'),round:text(this.form.round,'面试轮次',100,true)};fields.forEach(k=>row[k]=text(row[k]||'','复盘内容',10000));if(!fields.some(k=>row[k]))throw Error('请至少填写一项复盘内容。');if(!row.content)row.content=row.reflection||row.questions||row.improvement||row.answers;return row;});if(!f)return;const next=S.clone(this.state),i=next.reviews.findIndex(r=>r.id===f.id);if(i<0)next.reviews.push(f);else next.reviews[i]=f;if(f.interviewId){const interview=next.interviews.find(x=>x.id===f.interviewId);if(interview&&interview.jobId===f.jobId)interview.status='completed';else f.interviewId='';}this.event(next,i<0?'完成面试复盘':'更新面试复盘',this.jobName(f.jobId)+' · '+f.round,'review',f.jobId);if(await this.commit(next)){this.close(true);this.notify('复盘已保存');}},
    prepareInterview(i){this.open('task','',{title:('准备'+i.round+' · '+this.jobName(i.jobId)).slice(0,500),jobId:i.jobId,due:i.date,priority:1,category:'面试准备',detail:i.note||'梳理自我介绍、代表案例与需要确认的问题。'});},
    reviewInterview(i){const r=this.state.reviews.find(r=>r.interviewId===i.id);if(r)this.open('review',r.id);else if(i.date>this.today)this.open('task','',{title:('准备'+i.round+'：'+this.jobName(i.jobId)).slice(0,500),jobId:i.jobId,due:i.date,category:'面试准备',detail:i.note||''});else this.open('review','',{jobId:i.jobId,interviewId:i.id,date:i.date,round:i.round});},
    improveTask(r){this.open('task','',{title:r.improvement.split('\n')[0].slice(0,500),detail:r.improvement,jobId:r.jobId,category:'面试提升'});},
    async readResume(event){const file=event.target.files?.[0];if(!file)return;this.formError='';if(file.size>S.MAX_RESUME_BYTES){this.formError='文件超过 10 MB，请选择较小的文件。';event.target.value='';return;}if(!/\.(pdf|doc|docx|txt)$/i.test(file.name)){this.formError='请选择 PDF、Word 或 TXT 简历文件。';event.target.value='';return;}this.fileReading=true;try{const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('文件读取失败，请重选。'));reader.readAsDataURL(file);});this.file={name:file.name,size:file.size,type:file.type,content};if(!this.form.label)this.form.label=file.name.replace(/\.[^.]+$/,'');this.form.name=file.name;}
      catch(e){this.formError=e.message;}finally{this.fileReading=false;}},
    async saveResume(){if(this.fileReading)return;const f=this.validate(()=>{if(!this.form.id&&!this.file)throw Error('请选择要保存的简历文件。');return {label:text(this.form.label,'简历名称',200,true),versionLabel:text(this.form.versionLabel||'V1','版本标记',100,true),note:text(this.form.note||'','版本说明')};});if(!f)return;const next=S.clone(this.state),old=next.resumes.find(r=>r.id===this.form.id);if(old)Object.assign(old,f);else next.resumes.push({...this.file,...f,id:uid('resume'),groupId:this.form.groupId||uid('resume-group'),date:this.today});this.event(next,old?'更新简历信息':'保存简历新版本',f.label+' · '+f.versionLabel,'resume');if(await this.commit(next)){this.file=null;this.close(true);this.notify(old?'简历信息已保存':'简历版本已保存');}},
    download(resume){try{const [,base64]=resume.content.split(',');const binary=atob(base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);this.downloadBlob(new Blob([bytes],{type:'application/octet-stream'}),resume.name);}catch{this.error='未能下载文件，请先导出备份并重新打开。';}},
    downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);},
    async saveProgress(){const f=this.validate(()=>{if(!S.validDate(this.form.date)||this.form.date>this.today)throw Error('请选择今天或过去的日期。');return {title:text(this.form.title,'进展标题',500,true),detail:text(this.form.detail||'','补充说明')};});if(!f)return;const next=S.clone(this.state);const current=next.events.find(e=>e.id===this.form.id&&e.kind==='note');if(current)Object.assign(current,f,{date:this.form.date,jobId:this.form.jobId||''});else this.event(next,f.title,f.detail,'note',this.form.jobId||'',this.form.date);if(await this.commit(next)){this.close(true);this.notify('进展已保存');}},
    exportBackup(){if(!this.loaded){this.error='请先读取记录，再导出备份。';return;}this.downloadBlob(new Blob([JSON.stringify(this.state,null,2)],{type:'application/json'}),'下一程-求职备份-'+this.today+'.json');this.notify('备份已生成，包含简历文件');},
    async readImport(event){const file=event.target.files?.[0];if(!file)return;event.target.value='';if(file.size>S.MAX_IMPORT_BYTES){this.error='备份超过 100 MB，无法恢复。';return;}this.fileReading=true;try{const parsed=JSON.parse(await file.text());const normalized=S.normalize(parsed);this.importData=normalized;this.importFileName=file.name;this.importConfirmed=false;this.openImport();}catch(e){this.error='备份未导入，现有记录未变更。'+e.message;}finally{this.fileReading=false;}},
    openImport(){this.returnFocus=document.activeElement;this.panel='import';this.dirtySnapshot='';this.formError='';this.$nextTick(()=>this.$refs.dialog.focus());},
    async restore(){if(!this.importConfirmed||!this.importData)return;const next=S.clone(this.importData);if(await this.commit(next)){this.importData=null;this.close(true);this.notify('备份已恢复');if(!this.state.profile.initialized)this.open('welcome');}},
    confirmDeleteJob(){const j=this.selectedJob;this.confirmation={kind:'job',id:j.id,title:'永久删除这个岗位？',description:'同时删除该岗位的投递、面试安排和复盘；关联任务保留并解除关联。此操作不可撤销。'};this.confirmChecked=false;this.panel='confirm';this.dirtySnapshot='';},
    confirmReset(){this.confirmation={kind:'reset',title:'清空这个空间？',description:'将删除当前本机空间中的全部记录。请先导出备份。此操作不可撤销。'};this.confirmChecked=false;this.open('confirm');},
    async confirmAction(){if(!this.confirmChecked)return;let next;if(this.confirmation.kind==='reset')next=S.initial();else{next=S.clone(this.state);const id=this.confirmation.id;next.jobs=next.jobs.filter(j=>j.id!==id);['applications','reviews','interviews'].forEach(k=>next[k]=next[k].filter(x=>x.jobId!==id));next.tasks.forEach(t=>{if(t.jobId===id)t.jobId='';});next.events.forEach(e=>{if(e.jobId===id)e.jobId='';});}if(await this.commit(next)){this.close(true);this.notify('数据已删除');if(!next.profile.initialized)this.open('welcome');}},
    async refreshRecords(){if(this.isDirty){this.formError='请先复制或保存当前输入，再重新读取记录。';return;}this.close(true);await this.load();},

  })));
})();
