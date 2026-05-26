/**
 * Helpers for rendering AI-generated HTML inside a sandboxed `<iframe>`:
 * - {@link injectKaTeX} ensures the page can render `$...$` / `$$...$$`
 *   even if the model didn't include KaTeX itself.
 * - {@link injectFrameAutosize} lets book-embedded HTML expand to its full
 *   document height instead of creating a separate iframe scrollbar.
 * - {@link sanitizeIframeHtml} strips unsafe `javascript:` URLs and parent
 *   frame navigation targets.
 *
 * These were originally written for the (now-deprecated) Guided Learning
 * page; the visualize capability now reuses them for `render_mode=html`.
 */

const KATEX_CSS =
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">'

const KATEX_SCRIPT =
  '<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" crossorigin="anonymous"><' +
  '/script>'

const KATEX_AUTO_RENDER_SCRIPT =
  '<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" crossorigin="anonymous"><' +
  '/script>'

const KATEX_INIT_SCRIPT =
  '<script data-katex-init>' +
  'document.addEventListener("DOMContentLoaded",function(){var t=0,i=setInterval(function(){if(typeof renderMathInElement==="function"){clearInterval(i);try{renderMathInElement(document.body,{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false},{left:"\\\\(",right:"\\\\)",display:false},{left:"\\\\[",right:"\\\\]",display:true}],throwOnError:false})}catch(e){console.error("[KaTeX] Error:",e)}}else if(++t>50){clearInterval(i);console.warn("[KaTeX] Timeout")}},100)});' +
  '<' +
  '/script>'

const FRAME_AUTOSIZE_SCRIPT =
  '<script data-socartes-iframe-fit>' +
  "(()=>{let f=0;function e(){document.querySelectorAll('details').forEach((d)=>{d.open=true})}function h(){const b=document.body,d=document.documentElement;return Math.max(b?b.scrollHeight:0,b?b.offsetHeight:0,d?d.scrollHeight:0,d?d.offsetHeight:0)}function s(){f=0;parent.postMessage({source:'socartes-html-iframe',type:'resize',height:Math.ceil(h())},'*')}function q(){if(f)return;f=requestAnimationFrame(s)}function boot(){e();document.documentElement.style.overflow='visible';if(document.body)document.body.style.overflow='visible';if('ResizeObserver'in window&&document.body)new ResizeObserver(q).observe(document.body);if('MutationObserver'in window&&document.body)new MutationObserver(q).observe(document.body,{attributes:true,childList:true,characterData:true,subtree:true});window.addEventListener('resize',q);q();setTimeout(q,250);setTimeout(q,1000)}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot,{once:true})}else{boot()}window.addEventListener('load',q)})();" +
  '<' +
  '/script>'

const FRAME_TOUCH_DRAG_SCRIPT =
  '<script data-socartes-touch-drag>' +
  "(()=>{let a=null,d=null,g=false;function f(){const s={};return{dropEffect:'move',effectAllowed:'all',files:[],items:[],types:[],setData(t,v){s[t]=String(v);this.types=Object.keys(s)},getData(t){return s[t]||''},clearData(t){if(t)delete s[t];else Object.keys(s).forEach((k)=>delete s[k]);this.types=Object.keys(s)},setDragImage(){}}}function v(n,t,e){if(!t)return false;const r=new Event(n,{bubbles:true,cancelable:true});try{Object.defineProperty(r,'dataTransfer',{value:d})}catch{}try{Object.defineProperty(r,'clientX',{value:e.clientX});Object.defineProperty(r,'clientY',{value:e.clientY})}catch{}return t.dispatchEvent(r)}document.addEventListener('pointerdown',(e)=>{const t=e.target instanceof Element?e.target.closest('[draggable=\"true\"]'):null;if(!t)return;a={el:t,id:e.pointerId,x:e.clientX,y:e.clientY};d=f();g=false},true);document.addEventListener('pointermove',(e)=>{if(!a||e.pointerId!==a.id)return;const m=Math.abs(e.clientX-a.x)+Math.abs(e.clientY-a.y);if(!g&&m>6){g=true;try{a.el.setPointerCapture(e.pointerId)}catch{}v('dragstart',a.el,e)}if(g){e.preventDefault();const t=document.elementFromPoint(e.clientX,e.clientY);v('dragover',t,e)}},{capture:true,passive:false});document.addEventListener('pointerup',(e)=>{if(!a||e.pointerId!==a.id)return;if(g){e.preventDefault();const t=document.elementFromPoint(e.clientX,e.clientY);v('drop',t,e);v('dragend',a.el,e)}a=null;d=null;g=false},{capture:true,passive:false});document.addEventListener('pointercancel',(e)=>{if(a&&e.pointerId===a.id){v('dragend',a.el,e);a=null;d=null;g=false}},{capture:true,passive:true})})();" +
  '<' +
  '/script>'

const FRAME_SCROLL_PROXY_SCRIPT =
  '<script data-socartes-scroll-proxy>' +
  "(()=>{function n(v,m){return v*(m===1?16:m===2?(window.innerHeight||800):1)}function o(v){return/(auto|scroll|overlay)/.test(v)}function c(e,dx,dy){let x=e instanceof Element?e:null;for(;x&&x!==document.documentElement;x=x.parentElement){const s=getComputedStyle(x),sy=o(s.overflowY)&&x.scrollHeight>x.clientHeight+1,sx=o(s.overflowX)&&x.scrollWidth>x.clientWidth+1;if(sy&&dy&&((dy<0&&x.scrollTop>0)||(dy>0&&x.scrollTop+x.clientHeight<x.scrollHeight-1)))return true;if(sx&&dx&&((dx<0&&x.scrollLeft>0)||(dx>0&&x.scrollLeft+x.clientWidth<x.scrollWidth-1)))return true}return false}window.addEventListener('wheel',(e)=>{if(e.ctrlKey||e.defaultPrevented)return;const dx=n(e.deltaX,e.deltaMode),dy=n(e.deltaY,e.deltaMode);if(!dx&&!dy)return;if(c(e.target,dx,dy))return;e.preventDefault();parent.postMessage({source:'socartes-html-iframe',type:'scroll',deltaX:dx,deltaY:dy},'*')},{passive:false})})();" +
  '<' +
  '/script>'

const FRAME_INTERACTION_STYLE =
  '<style data-socartes-iframe-interactions>' +
  'html,body{overscroll-behavior:auto;}' +
  '[draggable="true"],[data-draggable],[data-drag],[data-drag-handle],.draggable,.drag-handle,input[type="range"],[role="slider"],canvas{touch-action:none;-webkit-user-select:none;user-select:none;}' +
  'button,a,input,select,textarea,label,[role="button"],[role="option"],[role="radio"],[role="checkbox"],[role="tab"],[tabindex]{touch-action:manipulation;}' +
  '</style>'

export interface PrepareIframeHtmlOptions {
  fitFrame?: boolean
}

/**
 * Inject KaTeX (CSS + JS + auto-render init) into the document's `<head>`.
 * No-op if the document already references KaTeX.
 */
export function injectKaTeX(html: string): string {
  const lower = html.toLowerCase()
  const hasKaTeXCss =
    lower.includes('katex.min.css') || lower.includes('/katex.css')
  const hasKaTeXScript =
    lower.includes('katex.min.js') ||
    /<script[^>]+src=(['"])[^'"]*katex(?:@[\d.]+)?\/dist\/katex(?:\.min)?\.js[^'"]*\1/i.test(html)
  const hasAutoRender =
    lower.includes('auto-render.min.js') ||
    lower.includes('contrib/auto-render') ||
    lower.includes('rendermathinelement')
  const hasInitScript = lower.includes('data-katex-init')

  const additions = [
    hasKaTeXCss ? '' : KATEX_CSS,
    hasKaTeXScript ? '' : KATEX_SCRIPT,
    hasAutoRender ? '' : KATEX_AUTO_RENDER_SCRIPT,
    hasInitScript ? '' : KATEX_INIT_SCRIPT,
  ]
    .filter(Boolean)
    .join('\n  ')

  if (!additions) return html

  if (html.includes('</head>')) {
    return html.replace('</head>', additions + '\n</head>')
  }
  if (html.includes('<head>')) {
    return html.replace(/<head([^>]*)>/i, '<head$1>\n' + additions)
  }
  if (html.includes('<html')) {
    return html.replace(
      /(<html[^>]*>)/i,
      '$1\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        additions +
        '\n</head>'
    )
  }

  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    additions +
    '\n</head>\n<body>\n' +
    html +
    '\n</body>\n</html>'
  )
}

/**
 * Inject a small sandbox-safe script that reports content height to the parent
 * iframe. It also opens native `<details>` blocks so book HTML starts expanded.
 */
export function injectFrameAutosize(html: string): string {
  let next = html
  if (!next.includes('data-socartes-iframe-interactions')) {
    if (/<\/head>/i.test(next)) {
      next = next.replace(/<\/head>/i, FRAME_INTERACTION_STYLE + '\n</head>')
    } else if (/<head([^>]*)>/i.test(next)) {
      next = next.replace(/<head([^>]*)>/i, '<head$1>\n' + FRAME_INTERACTION_STYLE)
    } else if (/<html[^>]*>/i.test(next)) {
      next = next.replace(/(<html[^>]*>)/i, '$1\n<head>\n' + FRAME_INTERACTION_STYLE + '\n</head>')
    } else {
      next = FRAME_INTERACTION_STYLE + '\n' + next
    }
  }

  const hasFitScript = next.includes('data-socartes-iframe-fit')
  const hasTouchDragScript = next.includes('data-socartes-touch-drag')
  const hasScrollProxyScript = next.includes('data-socartes-scroll-proxy')

  const scripts = [
    hasTouchDragScript ? '' : FRAME_TOUCH_DRAG_SCRIPT,
    hasScrollProxyScript ? '' : FRAME_SCROLL_PROXY_SCRIPT,
    hasFitScript ? '' : FRAME_AUTOSIZE_SCRIPT,
  ]
    .filter(Boolean)
    .join('\n')

  if (!scripts) return next

  if (/<\/body>/i.test(next)) {
    return next.replace(/<\/body>/i, scripts + '\n</body>')
  }
  if (/<\/html>/i.test(next)) {
    return next.replace(/<\/html>/i, scripts + '\n</html>')
  }

  return next + '\n' + scripts
}

/**
 * Light defense-in-depth on top of `sandbox="allow-scripts"` (without
 * `allow-same-origin`): strip `javascript:` URLs and (best-effort) any
 * `<a target="_top">` / `target="_parent"` so a misbehaving model cannot
 * navigate the parent frame. We deliberately keep `<script>` tags and
 * inline `on*=` handlers because the model is *expected* to ship
 * interactive JS — and the sandbox already isolates it in a null origin
 * with no access to the host page.
 */
export function sanitizeIframeHtml(html: string): string {
  return html
    .replace(/\s(href|src|formaction)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '')
    .replace(/\starget\s*=\s*(['"])_(top|parent)\1/gi, ' target="_self"')
}

/**
 * Convenience: inject KaTeX, then sanitize. Suitable for a one-shot iframe
 * `srcdoc` write.
 */
export function prepareIframeHtml(html: string, options: PrepareIframeHtmlOptions = {}): string {
  const withMath = injectKaTeX(html)
  const withFrameFit = options.fitFrame ? injectFrameAutosize(withMath) : withMath
  return sanitizeIframeHtml(withFrameFit)
}
