const $ = id => document.getElementById(id);
const pause = ms => new Promise(r => setTimeout(r,ms));
const tabId = Number(new URLSearchParams(location.search).get('tab'));
let frameId = null, busy=false, stop=false, courses=[], records=[], messages=[], testPassed=false, sectionPreferences={};
const safe = value => String(value || '').replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,240);
const stamp = () => new Date().toISOString();
const key = r => `${r.term}|${r.course}|${r.section}`;
const filename = r => `OzU_Syllabi/${r.term.replace(/[^a-zA-Z0-9_-]/g,'_')}/${r.course}__section_${r.section}.pdf`;
function message(text){messages.push(`${stamp().slice(11,19)}  ${safe(text)}`);$('log').textContent=messages.slice(-250).join('\n');$('log').scrollTop=$('log').scrollHeight;}
async function record(row){records.push({at:stamp(),...row});await chrome.storage.local.set({collectionRecords:records});renderChecklist();}
function controls(){ $('test').disabled=busy||frameId===null;$('all').disabled=busy||frameId===null||!testPassed||!$('confirmed').checked;$('inspect').disabled=busy;$('stop').disabled=!busy;$('clear').disabled=busy;for(const input of document.querySelectorAll('[data-section]'))input.disabled=busy;}
const attemptKey = row => `${row.term}|${row.course}`;
function preferredSection(row){
  const k=attemptKey(row);
  return Object.prototype.hasOwnProperty.call(sectionPreferences,k)?sectionPreferences[k]:row.attended_section || '';
}
async function rememberSection(row,value){
  const section=value.trim();
  if(section && !/^[A-Za-z0-9_-]{1,20}$/.test(section))throw Error('Use a section name such as A, C or A1; leave blank if unknown.');
  sectionPreferences[attemptKey(row)]=section;
  await chrome.storage.local.set({sectionPreferences});
}
function renderChecklist(){
  const body=$('checklist');if(!body)return;
  body.replaceChildren();let covered=0;
  for(const attempt of courses){
    const related=records.filter(r=>r.term===attempt.term&&r.course===attempt.course);
    const last=related[related.length-1];
    const success=related.slice().reverse().find(r=>['downloaded','existing_pdf'].includes(r.result));
    if(success)covered++;
    const tr=document.createElement('tr');
    for(const text of [attempt.term,attempt.course,`${attempt.status} (${attempt.grade})`]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
    const cell=document.createElement('td'),input=document.createElement('input');
    input.value=preferredSection(attempt);input.placeholder='Unknown';input.maxLength=20;input.disabled=busy;
    input.setAttribute('aria-label',`${attempt.course} ${attempt.term} attended section`);input.setAttribute('data-section','');
    input.onchange=async()=>{try{await rememberSection(attempt,input.value);if(attemptKey(attempt)===attemptKey(courses[Number($('attempt').value)]))$('section').value=input.value;}catch(e){message(e.message);renderChecklist();}};
    cell.append(input);tr.append(cell);
    const result=document.createElement('td');result.textContent=success?`Saved section ${success.section}${last&&last!==success?' · latest: '+last.result:''}`:last?.result || 'Pending';tr.append(result);body.append(tr);
  }
  $('coverage').textContent=`${courses.length} transcript attempts · ${covered} with a saved/reused PDF in the log. Blank sections remain unknown.`;
}
async function invoke(op,args={}){
  if(frameId===null)throw Error('Check the SIS tab first.');
  const results=await chrome.scripting.executeScript({target:{tabId,frameIds:[frameId]},world:'MAIN',func:sisOperation,args:[op,args]});
  const result=results[0]?.result;
  if(!result)throw Error('SIS adapter returned no response. Export the log.');
  if(result.__sisError)throw Error(result.__sisError);
  return result;
}
async function inspect(){
  try {
    if(!tabId)throw Error('Open SIS, select its Courses Offered tab, and click the extension icon there.');
    const tab=await chrome.tabs.get(tabId);
    if(!tab.url?.startsWith('https://sis.ozyegin.edu.tr/'))throw Error('The chosen tab is not on SIS. Finish login and reopen the collector from the SIS tab.');
    const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',func:sisOperation,args:['inspect',{}]});
    const ready=results.filter(r=>r.result?.ready);
    if(ready.length!==1)throw Error(`Found ${ready.length} Courses Offered forms across ${results.length} accessible frames. Open Courses Offered once in the chosen tab.`);
    frameId=ready[0].frameId;
    $('connection').textContent=`Connected to Courses Offered · ${ready[0].result.term} · ${frameId===0?'main page':'embedded frame'}`;
    message('Connection verified. Ready for the one-course test.');
  }catch(e){frameId=null;$('connection').textContent=safe(e.message);message(`Connection: ${e.message}`);}
  controls();
}
function watchPdf(){
  let done=false,timer,resolvePromise,rejectPromise;
  const promise=new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
  // Prevent unhandled rejection if the click itself fails before the watcher is awaited.
  promise.catch(()=>{});
  const cleanup=()=>{clearTimeout(timer);chrome.webRequest.onCompleted.removeListener(listener);};
  const listener=async d=>{
    if(done||d.method!=='GET')return;
    let belongs=d.tabId===tabId;
    if(!belongs&&d.tabId>=0){try{belongs=(await chrome.tabs.get(d.tabId)).openerTabId===tabId;}catch{}}
    if(!belongs||done)return;
    done=true;cleanup();
    if(![200,206].includes(d.statusCode)){rejectPromise(Error(`SIS document HTTP ${d.statusCode}`));return;}
    resolvePromise({url:d.url,viewerTabId:d.tabId!==tabId?d.tabId:null});
  };
  chrome.webRequest.onCompleted.addListener(listener,{urls:['https://sis.ozyegin.edu.tr/OZU_GWT/images/plm/*']});
  timer=setTimeout(()=>{if(!done){done=true;cleanup();rejectPromise(Error('No syllabus PDF request completed within 35 seconds. Check whether Chrome blocked a popup, or SIS showed an error.'));}},35000);
  return {promise,cancel(){done=true;cleanup();resolvePromise(null);}};
}
async function saveBlob(blob,name){
  const url=URL.createObjectURL(blob);
  try{
    const id=await chrome.downloads.download({url,filename:name,saveAs:false,conflictAction:'uniquify'});
    const until=Date.now()+90000;
    while(Date.now()<until){
      const [item]=await chrome.downloads.search({id});
      if(item?.state==='complete')return id;
      if(!item||item.state==='interrupted')throw Error(`Download interrupted${item?.error?': '+item.error:''}.`);
      await pause(300);
    }
    throw Error('Download did not finish within 90 seconds. Check Chrome Downloads.');
  }finally{URL.revokeObjectURL(url);}
}
async function savePdf(data,row){
  const raw=atob(data.base64),bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const sha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const downloadId=await saveBlob(new Blob([bytes],{type:'application/pdf'}),filename(row));
  return {sha256,downloadId,bytes:bytes.length};
}
async function existing(row){
  const prior=records.slice().reverse().find(r=>key(r)===key(row)&&r.result==='downloaded');
  if(!prior?.downloadId)return false;
  const [item]=await chrome.downloads.search({id:prior.downloadId});
  return item?.state==='complete'&&item.exists;
}

async function waitForResults(attempt){
  const token=crypto.randomUUID();
  await invoke('search',{...attempt,token});
  const started=performance.now();
  let previous='',stableSince=0,lastNotice=-1,lastStatus=null;
  const minimumWait=12000,stableFor=2500,timeout=60000;
  message(`${attempt.course}: Search clicked; waiting up to 60 seconds for SIS.`);
  try{
    while(performance.now()-started<timeout){
      if(stop)throw Error('Stopped by user while waiting for SIS results.');
      const status=await invoke('resultStatus',{...attempt,token});
      lastStatus=status;
      const elapsed=performance.now()-started;
      const signature=JSON.stringify([status.sections,status.renderedRows,status.totalRows,status.zero,status.loading,status.refreshed]);
      if(signature!==previous){previous=signature;stableSince=performance.now();}
      const ready=status.refreshed&&!status.loading&&(status.sections.length>0||status.zero);
      if(ready&&elapsed>=minimumWait&&performance.now()-stableSince>=stableFor)return status;
      const notice=Math.floor(elapsed/5000);
      if(notice>lastNotice){lastNotice=notice;message(`${attempt.course}: ${Math.floor(elapsed/1000)}s · sections ${status.sections.length} · refresh ${status.refreshed?'seen':'not yet'} · loading ${status.loading?'yes':'no'}`);}
      await pause(750);
    }
    const detail=lastStatus?`sections=${lastStatus.sections.length}, refresh=${lastStatus.refreshed}, loading=${lastStatus.loading}, zeroRecords=${lastStatus.zero}`:'no status response';
    throw Error(`No confirmed SIS result after 60 seconds (${detail}). The search may not have refreshed, or SIS is still loading.`);
  }finally{await invoke('cancelSearch',{token}).catch(()=>{});}
}

async function collect(attempt,attended=''){
  const base={term:attempt.term,course:attempt.course,grade:attempt.grade,courseStatus:attempt.status,attendedSection:attended,sectionEvidence:attended?'user-provided':'not available in transcript'};
  const previous=records.slice().reverse().filter(r=>r.term===base.term&&r.course===base.course&&r.result==='downloaded'&&(!attended||r.section===attended));
  for(const item of previous){
    if(await existing(item)){
      await record({...base,section:item.section,sectionMatch:attended?'attended_section':'attended_section_unknown',result:'existing_pdf',file:item.file,detail:'Reused completed download before searching.'});
      message(`${base.term} · ${base.course}.${item.section}: existing PDF reused.`);return 1;
    }
  }
  message(`${base.term} · ${base.course}: searching`);
  const result=await waitForResults(base);
  message(`${base.course}: found sections ${result.sections.join(', ') || '(none)'}`);
  if(!result.sections.length){await record({...base,result:'no_exact_course_result',detail:'SIS reported zero records for this exact-term search; review search syntax and offering status.'});return 0;}
  if(result.possiblyPartial)throw Error('Result grid may be partly loaded. Stopped rather than claiming all sections were checked. Narrow the course search or export this log.');
  const ordered=[...new Set([...(result.sections.includes(attended)?[attended]:[]),...result.sections])];
  let downloaded=0;
  if(!attended){
    for(const section of ordered){
      const row={...base,section,sectionMatch:'attended_section_unknown'};
      if(await existing(row)){
        await record({...row,result:'existing_pdf',detail:'Reused a confirmed existing same-term section; attended section remains unknown.'});
        message(`${base.course}.${section}: already downloaded; one syllabus is sufficient.`);
        return 1;
      }
    }
  }
  for(const section of ordered){
    if(stop)break;
    const row={...base,section,sectionMatch:attended?(section===attended?'attended_section':'other_section_same_term'):'attended_section_unknown'};
    if(await existing(row)){message(`${base.course}.${section}: already downloaded`);downloaded++;break;}
    const token=crypto.randomUUID();
    const watcher=watchPdf();
    try{
      await invoke('armCapture',{...base,token});
      let clickError=null;
      let clicked;
      try{clicked=await invoke('clickSyllabus',{...base,section});}catch(error){clickError=error;}
      if(clicked?.missing){watcher.cancel();await record({...row,result:'no_syllabus_icon'});message(`${base.course}.${section}: no syllabus icon`);continue;}
      if(clicked)message(`${base.course}.${section}: button ${clicked.buttonProxy}, row ${clicked.rowIndex+1}, icons ${clicked.iconCount}; action invoked.`);
      // Prefer an exact generated PDF URL. Existing network capture remains a
      // fallback for SIS handlers that do not call window.open directly.
      let observed=null,networkError=null,networkResult=null;
      watcher.promise.then(value=>{networkResult=value;},error=>{networkError=error;});
      const started=performance.now();
      let diagnostic=null;
      while(performance.now()-started<35000){
        diagnostic=await invoke('captureStatus',{token});
        if(diagnostic.url){observed={url:diagnostic.url};message(`${base.course}.${section}: generated PDF URL captured; no popup needed.`);break;}
        if(networkResult){observed=networkResult;message(`${base.course}.${section}: PDF request observed.`);break;}
        if(clickError)throw clickError;
        if(networkError)throw Error(`${networkError.message} URL-capture diagnostics: openCalls=${diagnostic.openCalls}, PDF opens=${diagnostic.pdfOpenCalls}, other opens=${diagnostic.otherOpenCalls}.`);
        await pause(400);
      }
      if(!observed)throw Error(`No generated PDF URL or completed PDF request. openCalls=${diagnostic?.openCalls??0}, PDF opens=${diagnostic?.pdfOpenCalls??0}, other opens=${diagnostic?.otherOpenCalls??0}.`);
      watcher.cancel();
      // Restore page behavior before making the normal authenticated PDF fetch.
      await invoke('endCapture',{token});
      const pdf=await invoke('fetchPdf',{url:observed.url});
      const saved=await savePdf(pdf,row);
      await record({...row,result:'downloaded',file:filename(row),...saved,contentReview:'pending: verify PDF course and term'});
      downloaded++;message(`${base.course}.${section}: downloaded (${Math.round(saved.bytes/1024)} KB)`);
      break;
    }catch(e){
      watcher.cancel();
      const unavailable=/non-PDF response|SIS document HTTP (404|410)\b/.test(e.message);
      await record({...row,result:unavailable?'section_unavailable':'needs_review',detail:safe(e.message)});
      message(`${base.course}.${section}: ${e.message}`);
      if(unavailable){message(`${base.course}: trying another same-term section.`);continue;}
      throw e;
    }finally{
      watcher.cancel();await invoke('endCapture',{token}).catch(()=>{});
    }
  }
  if(!downloaded&&!stop)await record({...base,result:'no_usable_syllabus',detail:'No usable PDF found in the available same-term sections. Review this course; the full run continues.'});
  return downloaded;
}
async function run(all){
  if(!all){try{await rememberSection(courses[Number($('attempt').value)],$('section').value);}catch(e){message(e.message);return;}}
  busy=true;stop=false;controls();$('status').textContent='Collecting — leave SIS and this panel open.';
  const attempt=courses[Number($('attempt').value)];
  const chosen=all?courses:[attempt];
  $('progress').max=chosen.length;$('progress').value=0;
  if(!all){testPassed=false;$('confirmed').checked=false;}
  try{
    for(let i=0;i<chosen.length;i++){
      if(stop)break;
      const row=chosen[i];
      try{
        const count=await collect(row,preferredSection(row));
        if(!all)testPassed=count>0;
      }catch(e){
        await record({term:row.term,course:row.course,grade:row.grade,courseStatus:row.status,result:'attempt_stopped',detail:safe(e.message)});
        throw e;
      }
      $('progress').value=i+1;
    }
    $('status').textContent=stop?'Stopped. Existing files and saved log are kept.':all?'Collection run finished. Export the log to check coverage.':testPassed?'Test PDF(s) downloaded. Open them and check course and term before enabling the full run.':'No test PDF saved. Check the log.';
  }catch(e){$('status').textContent=`Stopped: ${safe(e.message)}`;message(`STOPPED: ${e.message}. Export log for troubleshooting.`);}
  finally{busy=false;renderChecklist();controls();}
}
$('inspect').onclick=inspect;$('test').onclick=()=>run(false);$('all').onclick=()=>run(true);
$('stop').onclick=()=>{stop=true;message('Stop requested; waiting for current operation.');};
$('confirmed').onchange=controls;
$('attempt').onchange=()=>{$('section').value=preferredSection(courses[Number($('attempt').value)]);testPassed=false;$('confirmed').checked=false;controls();};
$('section').oninput=()=>{testPassed=false;$('confirmed').checked=false;controls();};
$('section').onchange=async()=>{try{await rememberSection(courses[Number($('attempt').value)],$('section').value);renderChecklist();}catch(e){message(e.message);}};
$('export').onclick=async()=>{
  const output={version:'0.3.0',exportedAt:stamp(),notes:'User-configured course attempts. No other-term substitutes. Downloaded PDFs need content review.',records,messages,sectionPreferences};
  await saveBlob(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),'OzU_Syllabi/collection_log.json');
};
$('clear').onclick=async()=>{if(!confirm('Clear this extension’s saved log? Downloaded PDFs will remain.'))return;records=[];messages=[];await chrome.storage.local.remove('collectionRecords');message('Saved collection log cleared.');};
(async()=>{
  courses=await (await fetch('courses.json')).json();
  const saved=await chrome.storage.local.get(['collectionRecords','sectionPreferences','confirmedSectionsRevision']);
  records=saved.collectionRecords||[];sectionPreferences=saved.sectionPreferences||{};
  for(const r of records){if(r.attendedSection && r.sectionEvidence==='user-provided' && !Object.prototype.hasOwnProperty.call(sectionPreferences,attemptKey(r)))sectionPreferences[attemptKey(r)]=r.attendedSection;}
  for(let i=0;i<courses.length;i++){const a=courses[i];const option=new Option(`${a.term} · ${a.course} · ${a.status}`,String(i));$('attempt').add(option);}
  $('attempt').value='0';
  $('section').value=preferredSection(courses[Number($('attempt').value)]);
  $('all').textContent=`Collect all ${courses.length} attempts`;
  $('progress').max=courses.length;
  renderChecklist();
  if(records.length)message(`${records.length} saved log entries loaded.`);
  await inspect();
})();
