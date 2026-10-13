import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const run = promisify(execFile);

export async function outlineBrowserJavaScript(javascript) {
  const source = `tell application "Google Chrome"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with "https://outline.uwaterloo.ca/" then
          return execute t javascript ${JSON.stringify(javascript)}
        end if
      end repeat
    end repeat
    return "NO_OUTLINE_TAB"
  end tell`;
  let result;
  try { result = await run('osascript', ['-e', source], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 }); }
  catch (error) {
    if (!/Application isn.t running|\(-600\)/i.test(error.stderr || '')) throw error;
    // macOS may keep the exited disposable Chrome test process as the Apple Events target.
    await run('open', ['-a', 'Google Chrome']);
    await new Promise(resolve => setTimeout(resolve, 300));
    result = await run('osascript', ['-e', source], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  }
  const { stdout } = result;
  if (stdout.trim() === 'NO_OUTLINE_TAB') throw new Error('Open the signed-in Outline viewer in Chrome.');
  return JSON.parse(stdout.trim());
}

export async function requestOutline(path) {
  if (!/^\/viewer\/api\/search\/\?q=[^#]*$/.test(path) && !/^\/viewer\/view\/[a-z0-9_-]+\/?$/i.test(path)) throw new Error('Only observed read-only viewer routes are permitted.');
  const key = `__spotlightOutline_${randomUUID().replace(/-/g, '')}`;
  await outlineBrowserJavaScript(`(() => { const key=${JSON.stringify(key)}; const controller=new AbortController(); const state={done:false,controller}; window[key]=state; fetch(${JSON.stringify(path)},{credentials:'same-origin',signal:controller.signal}).then(async response=>{ if(new URL(response.url).origin!==location.origin){state.error='SESSION';return;} const text=await response.text(); if(text.length>2097152){state.error='SIZE';return;} state.response={status:response.status,type:response.headers.get('content-type'),text}; }).catch(()=>{state.error='NETWORK';}).finally(()=>{state.done=true;}); return JSON.stringify({started:true}); })()`);
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const state = await outlineBrowserJavaScript(`(() => { const state=window[${JSON.stringify(key)}]; return JSON.stringify(state?.done?{done:true,error:state.error,response:state.response}:{done:false}); })()`);
      if (state.done) {
        if (state.error) throw new Error(`Outline request ${state.error}.`);
        if (state.response.status === 401 || state.response.status === 403) throw new Error('Outline session/access unavailable.');
        if (state.response.status !== 200) throw new Error(`Outline request HTTP ${state.response.status}.`);
        return state.response;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Outline request timed out.');
  } finally {
    await outlineBrowserJavaScript(`(() => { window[${JSON.stringify(key)}]?.controller?.abort(); delete window[${JSON.stringify(key)}]; return JSON.stringify({cleared:true}); })()`).catch(() => {});
  }
}

// Batch the Apple Events transport, while limiting website traffic to three workers.
export async function requestOutlineBatch(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 12 || paths.some(path => !/^\/viewer\/view\/[a-z0-9_-]+\/?$/i.test(path))) throw new Error('Invalid outline batch.');
  const key = `__spotlightOutline_${randomUUID().replace(/-/g, '')}`;
  await outlineBrowserJavaScript(`(() => {
    const paths=${JSON.stringify(paths)}, key=${JSON.stringify(key)}, controller=new AbortController();
    const state={done:false,controller,results:[]}; window[key]=state; let cursor=0;
    async function worker(){ while(cursor<paths.length){ const i=cursor++;
      try { const response=await fetch(paths[i],{credentials:'same-origin',signal:controller.signal});
        if(new URL(response.url).origin!==location.origin) throw new Error('SESSION');
        if(response.status!==200) throw new Error('HTTP '+response.status);
        const text=await response.text(); if(text.length>2097152) throw new Error('SIZE');
        state.results[i]={status:response.status,text};
      } catch(error){ state.results[i]={error:error.message}; if(/SESSION|HTTP (401|403|429)/.test(error.message)){controller.abort();cursor=paths.length;} }
      await new Promise(resolve=>setTimeout(resolve,500));
    }}
    Promise.all(Array.from({length:Math.min(3,paths.length)},worker)).finally(()=>{state.done=true;});
    return JSON.stringify({started:true});
  })()`);
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const state = await outlineBrowserJavaScript(`(() => {const state=window[${JSON.stringify(key)}];return JSON.stringify(state?.done?{done:true,results:state.results}:{done:false});})()`);
      if (state.done) return paths.map((_, index) => state.results[index] || { error: 'Batch interrupted.' });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error('Outline batch timed out.');
  } finally {
    await outlineBrowserJavaScript(`(() => {window[${JSON.stringify(key)}]?.controller?.abort();delete window[${JSON.stringify(key)}];return JSON.stringify({cleared:true});})()`).catch(() => {});
  }
}
