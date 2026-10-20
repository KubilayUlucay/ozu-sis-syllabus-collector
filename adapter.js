/* Executed only in SIS's main JavaScript world. No login fields are inspected. */
async function sisOperation(op, args = {}) {
 try {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const fields = name => [...document.querySelectorAll(`input[name="${name}"]`)].filter(visible);
  const one = name => { const a = fields(name); if (a.length !== 1) throw Error(`Expected one ${name} field; found ${a.length}. Open only one Courses Offered window in this tab.`); return a[0]; };
  const widget = el => {const id=el?.getAttribute('$89') || el?.getAttribute('eventproxy'); return id ? window[id] : null;};
  const click = el => {
    if (!el) throw Error('Requested SIS control is absent.');
    const w=widget(el); if (typeof w?.click === 'function') { w.click(); return; }
    const b=el.getBoundingClientRect();
    for (const type of ['mousedown','mouseup','click']) el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,clientX:b.x+b.width/2,clientY:b.y+b.height/2,button:0}));
  };
  const set = (el,value) => {
    const w=widget(el);
    if (typeof w?.setValue === 'function') w.setValue(value);
    else {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value ?? '');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  };
  const wait = async (fn, label, ms=15000) => { const until=performance.now()+ms; while(performance.now()<until){const r=fn();if(r)return r;await sleep(150);}throw Error(`Timed out: ${label}`); };
  const coursePattern = code => {const m=code.match(/^([A-Z]+)(\d+[A-Z]*)$/);if(!m)throw Error('Invalid course code.');return new RegExp(`^${m[1]}\\s*${m[2]}\\.([A-Za-z0-9_-]+)$`);};
  const labels = code => {
    const re=coursePattern(code),rows=new Map();
    for(const el of document.querySelectorAll('td[width="100"]')){
      const match=clean(el.textContent).match(re);
      if(!match)continue;
      const row=el.closest('tr[role="listitem"]');
      // SmartClient can retain hidden grids and duplicate nested label cells.
      // Identity is the distinct visible result row, never the text node count.
      if(!row || !visible(row) || !visible(el))continue;
      const bounds=row.getBoundingClientRect();
      if(bounds.width<=0 || bounds.height<=0)continue;
      if(!rows.has(row))rows.set(row,{el,match,row});
    }
    return [...rows.values()];
  };
  const gridFor = el => {const node=el?.closest('[eventproxy$="_body"]');return node ? window[node.getAttribute('eventproxy')]?.grid : null;};
  if (op==='inspect') return {ready:fields('TERMCODE').length===1,term:fields('TERMCODE')[0]?.value || '',searchFields:fields('SEARCHSET').length,subjectFields:fields('COURSESUBJECT').length};
  if (op==='fetchPdf') {
    const u=new URL(args.url);
    if(u.origin!==location.origin || !u.pathname.startsWith('/OZU_GWT/images/plm/'))throw Error('Refusing document outside the SIS syllabus endpoint.');
    const response=await fetch(u.href,{credentials:'same-origin',signal:AbortSignal.timeout(30000)});
    const finalUrl=new URL(response.url || u.href);
    if(finalUrl.origin!==location.origin || [401,403].includes(response.status))throw Error('SESSION: SIS document access requires sign-in or permission.');
    if(!response.ok)throw Error(`SIS document HTTP ${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>30*1024*1024)throw Error('PDF exceeds the 30 MB transfer limit.');
    const head=new TextDecoder().decode(bytes.slice(0,1024)).trimStart();
    if(!head.startsWith('%PDF-'))throw Error(`SIS returned a non-PDF response; not saved (type=${response.headers?.get('content-type') || 'unknown'}, bytes=${bytes.length}).`);
    let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
    return {base64:btoa(binary),bytes:bytes.length};
  }
  const termField=one('TERMCODE');
  if(op==='armCapture') {
    const old=window.__ozuSyllabusCaptureV023;
    old?.restore?.();
    if(clean(termField.value)!==args.term)throw Error('Term changed before syllabus capture.');
    const original=window.open;
    const state={token:args.token,url:null,openCalls:0,pdfOpenCalls:0,otherOpenCalls:0};
    const hooked=function(...values){
      state.openCalls++;
      let url=null;try{url=new URL(String(values[0]),location.href);}catch{}
      if(url?.origin===location.origin && url.pathname.startsWith('/OZU_GWT/images/plm/')){
        state.url=url.href;state.pdfOpenCalls++;
        // The extension fetches this exact generated document through SIS.
        // No popup or browser popup-policy change is required for this path.
        return null;
      }
      state.otherOpenCalls++;
      return original.apply(this,values);
    };
    let timer;
    state.restore=()=>{if(window.open===hooked)window.open=original;clearTimeout(timer);};
    window.open=hooked;
    if(window.open!==hooked)throw Error('Could not arm document URL capture.');
    window.__ozuSyllabusCaptureV023=state;
    timer=setTimeout(state.restore,45000);
    return {armed:true};
  }
  if(op==='captureStatus' || op==='endCapture'){
    const state=window.__ozuSyllabusCaptureV023;
    if(!state || state.token!==args.token)throw Error('Syllabus capture state changed.');
    const result={url:state.url,openCalls:state.openCalls,pdfOpenCalls:state.pdfOpenCalls,otherOpenCalls:state.otherOpenCalls};
    if(op==='endCapture'){state.restore();delete window.__ozuSyllabusCaptureV023;}
    return result;
  }
  if(op==='search') {
    // Commit a real dropdown option; don't merely type its display text.
    if(clean(termField.value)!==args.term){
      const menuVisible=()=>[...document.querySelectorAll('.pickListMenuBody')].some(visible);
      const w=widget(termField);
      if(!menuVisible() && typeof w?.showPickList==='function')w.showPickList();
      await sleep(300);
      if(!menuVisible()){
        // A picker span is a FormItem control, not a normal widget button.
        // Do not call FormItem.click(), which may leave its dropdown closed.
        const picker=termField.closest('table')?.querySelector('span[role="button"]');
        if(!picker)throw Error('Term dropdown picker is not present.');
        const b=picker.getBoundingClientRect();
        termField.focus();
        for(const type of ['mousedown','mouseup','click'])picker.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,clientX:b.x+b.width/2,clientY:b.y+b.height/2,button:0}));
      }
      await wait(menuVisible,'term dropdown (30 seconds)',30000);
      const options=[...document.querySelectorAll('.pickListMenuBody')].filter(visible).flatMap(menu=>[...menu.querySelectorAll('nobr')]).filter(el=>clean(el.textContent)===args.term);
      if(options.length!==1)throw Error(`Term option ${args.term} has ${options.length} matches in visible dropdowns. No substitute selected.`);
      const option=options[0];
      // Use the exact displayed option's bound menu record. A DOM click can
      // target an offscreen SmartClient row without committing its form value.
      const menuBody=option.closest('.pickListMenuBody');
      const bodyWidget=window[menuBody?.getAttribute('eventproxy')];
      const menuElement=menuBody?.closest('[eventproxy^="isc_PickListMenu_"][role="list"]');
      const menu=window[menuElement?.getAttribute('eventproxy')] || bodyWidget?.grid;
      const optionRow=option.closest('tr[role="listitem"]');
      const optionRows=[...menuBody.querySelectorAll('tr[role="listitem"]')];
      const optionIndex=optionRows.indexOf(optionRow);
      const bodyIndex=typeof bodyWidget?.getElementRowNum==='function'?bodyWidget.getElementRowNum(optionRow):null;
      const recordIndex=Number.isInteger(bodyIndex)&&bodyIndex>=0?bodyIndex:optionIndex;
      const record=typeof menu?.getRecord==='function'?menu.getRecord(recordIndex):null;
      const recordMatches=record&&Object.values(record).some(value=>typeof value==='string'&&clean(value)===args.term);
      let method='DOM option event';
      if(recordMatches && typeof menu.recordClick==='function'){
        const field=typeof menu.getField==='function'?menu.getField(0):null;
        menu.recordClick(menu,record,recordIndex,field,0,args.term,args.term);
        method='bound dropdown record';
      } else {
        option.scrollIntoView({block:'center'});click(option.closest('td') || option);
      }
      await wait(()=>clean(termField.value)===args.term,`selected term ${args.term}; method=${method}; current=${clean(termField.value)}`);
    }
    for(const name of ['FACULTYCODE','COURSESUBJECT']) {const a=fields(name);if(a.length===1)set(a[0],null);}
    const search=one('SEARCHSET');set(search,args.course.replace(/([A-Z]+)(\d)/,'$1 $2'));
    const buttons=[...document.querySelectorAll('[role="button"]')].filter(el=>visible(el)&&clean(el.textContent)==='Search');
    if(buttons.length!==1)throw Error(`Expected one Search button; found ${buttons.length}.`);
    // Waiting is coordinated from the extension page, not SIS's JavaScript world.
    const prior=window.__ozuSyllabusSearchV021;
    prior?.observer?.disconnect();
    const resultText=()=>[...document.querySelectorAll('tr[role="listitem"][aria-posinset]')].map(el=>clean(el.textContent)).join('\n');
    const state={token:args.token,term:args.term,course:args.course,before:resultText(),refreshed:false};
    const isResultsNode=node=>{
      const el=node?.nodeType===1?node:node?.parentElement;
      return !!el && (el.matches?.('[eventproxy*="ListGridExtension"]') || el.closest?.('[eventproxy*="ListGridExtension"]') || el.querySelector?.('tr[role="listitem"][aria-posinset]'));
    };
    state.observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>isResultsNode(m.target) || [...m.addedNodes,...m.removedNodes].some(isResultsNode)))state.refreshed=true;
    });
    state.observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    window.__ozuSyllabusSearchV021=state;
    click(buttons[0]);
    return {started:true,term:termField.value,search:search.value};
  }
  if(op==='cancelSearch'){
    const state=window.__ozuSyllabusSearchV021;
    if(state?.token===args.token){state.observer?.disconnect();delete window.__ozuSyllabusSearchV021;}
    return {cancelled:true};
  }
  if(op==='resultStatus'){
    const state=window.__ozuSyllabusSearchV021;
    if(!state || state.token!==args.token || state.term!==args.term || state.course!==args.course)throw Error('Search state changed. Stop other collector panels before retrying.');
    if(clean(termField.value)!==args.term)throw Error('Term changed while searching.');
    const exact=labels(args.course);
    const sectionNames=[...new Set(exact.map(x=>x.match[1]))];
    const allRows=[...document.querySelectorAll('tr[role="listitem"][aria-posinset]')].filter(visible);
    const currentText=allRows.map(el=>clean(el.textContent)).join('\n');
    const row=exact[0]?.el.closest('tr[role="listitem"]');
    const total=Number(row?.getAttribute('aria-setsize')||sectionNames.length);
    const zero=/\(\s*0\s+Record Found\s*\)/i.test(document.body.textContent);
    const busy=[...document.querySelectorAll('[role="progressbar"], [aria-busy="true"], .loadingDataMessage, .loadingMessage')].some(visible);
    return {sections:sectionNames,renderedRows:allRows.length,totalRows:total,term:termField.value,
      possiblyPartial:allRows.length<total,zero,loading:busy,
      refreshed:state.refreshed || currentText!==state.before};
  }
  if(clean(termField.value)!==args.term)throw Error('Selected SIS term does not match this attempt.');
  if(op==='clickSyllabus') {
    const found=labels(args.course).filter(x=>x.match[1]===args.section);
    if(found.length!==1)throw Error(`Exact ${args.course}.${args.section} matched ${found.length} distinct visible course rows; expected one.`);
    let row=found[0].el.closest('tr[role="listitem"]');
    const grid=gridFor(row);
    const index=Number(row.getAttribute('aria-posinset'))-1;
    if(grid && typeof grid.scrollToRow==='function')grid.scrollToRow(index);
    else row.scrollIntoView({block:'center'});
    await sleep(300);
    row=labels(args.course).find(x=>x.match[1]===args.section)?.el.closest('tr[role="listitem"]');
    if(!row)throw Error('Course row disappeared after scrolling.');
    const cell=row.querySelector(':scope > td:nth-child(2)');
    if(!cell)throw Error('Course action cell not found.');
    const b=cell.getBoundingClientRect();
    const matches=[...document.querySelectorAll('img[src$="/pdf_with_attachments.png"]')].filter(el=>{
      if(!visible(el))return false;const r=el.getBoundingClientRect();
      return r.width>0&&r.x>=b.x-1&&r.right<=b.right+1&&r.y>=b.y-1&&r.bottom<=b.bottom+1;
    });
    if(!matches.length)return {missing:true};
    if(matches.length!==1)throw Error('Ambiguous syllabus buttons; refused to click.');
    const button=matches[0].closest('[role="button"]') || matches[0];
    const proxy=button.getAttribute('eventproxy') || '';
    try{click(button);}catch(error){
      if(!window.__ozuSyllabusCaptureV023?.url)throw error;
    }
    return {clicked:true,buttonProxy:proxy,rowIndex:index,iconCount:matches.length};
  }
  throw Error('Unknown SIS operation.');
 } catch(error) { return {__sisError: String(error.message || error)}; }
}
