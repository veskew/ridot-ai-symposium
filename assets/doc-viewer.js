/* ===== Document viewer =====
   Shared by proceedings.html and executive-summary.html. Each .doc-viewer renders its PDF with PDF.js;
   pages render lazily as they scroll into view, and if PDF.js can't load, open/download links remain. */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
let pdfjsReady;
function loadPdfjs(){
  return pdfjsReady ||= import(PDFJS + 'pdf.min.mjs').then(lib => {
    lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    return lib;
  });
}

function setupDocViewer(el){
  const {src, title, size} = el.dataset;
  const file = src.split('/').pop();
  el.innerHTML = `
    <div class="doc-bar">
      <div class="doc-meta"><span class="doc-icon" aria-hidden="true">PDF</span>
        <div><strong>${title}</strong><small class="doc-info">PDF · ${size}</small></div></div>
      <div class="doc-controls">
        <div class="doc-pager">
          <button type="button" class="doc-btn prev" aria-label="Previous page" disabled>‹</button>
          <span class="doc-pos" aria-live="polite">–</span>
          <button type="button" class="doc-btn next" aria-label="Next page" disabled>›</button>
        </div>
        ${document.fullscreenEnabled ? '<button type="button" class="doc-btn ghost fs" aria-label="Full screen">⤢ Full screen</button>' : ''}
        <a class="doc-btn ghost" href="${src}" target="_blank" rel="noopener" aria-label="Open in new tab"><span class="doc-lbl">Open</span>↗</a>
        <a class="doc-btn download" href="${src}" download="${file}">Download ↓</a>
      </div>
    </div>
    <div class="doc-scroll" tabindex="0" aria-label="${title} pages"><div class="doc-page"></div></div>`;
  const scroller = el.querySelector('.doc-scroll');
  const pos = el.querySelector('.doc-pos');
  const prev = el.querySelector('.prev'), next = el.querySelector('.next');
  let doc, pages = [], current = 1;

  const fallback = () => {
    scroller.innerHTML = `<p class="doc-fallback">The preview couldn't load here. <a href="${src}" target="_blank" rel="noopener">Open the PDF</a> or <a href="${src}" download="${file}">download it</a>.</p>`;
  };

  async function renderPage(box){
    const n = +box.dataset.page;
    const page = await doc.getPage(n);
    const scale = box.clientWidth / page.getViewport({scale:1}).width * Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({scale});
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise;
    box.replaceChildren(canvas);
    box.classList.add('rendered');
  }

  // Render pages as they approach the visible area of the viewer.
  const pageObserver = new IntersectionObserver(entries => {
    for(const e of entries){
      if(!e.isIntersecting) continue;
      pageObserver.unobserve(e.target);
      renderPage(e.target).catch(() => {});
    }
  }, {root:scroller, rootMargin:'150% 0px'});

  function showPos(){
    pos.innerHTML = `<b>${current}</b> / ${pages.length}`;
    prev.disabled = current <= 1;
    next.disabled = current >= pages.length;
  }
  // While a prev/next jump is scrolling, keep its target page so repeated clicks stack up.
  let jumpTimer = 0;
  function updatePos(){
    if(jumpTimer) return;
    const mid = scroller.scrollTop + scroller.clientHeight / 3;
    current = Math.max(1, pages.findLastIndex(p => p.offsetTop <= mid) + 1);
    showPos();
  }
  function goTo(n){
    current = Math.min(Math.max(n, 1), pages.length);
    showPos();
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => { jumpTimer = 0; updatePos(); }, 700);
    scroller.scrollTo({top:pages[current - 1].offsetTop - 24, behavior:'smooth'});
  }

  async function start(){
    try{
      const lib = await loadPdfjs();
      doc = await lib.getDocument({url:src, isEvalSupported:false}).promise;
      const first = (await doc.getPage(1)).getViewport({scale:1});
      el.style.setProperty('--page-ratio', `${first.width}/${first.height}`);
      el.querySelector('.doc-info').textContent = `${doc.numPages} pages · PDF · ${size}`;
      for(let n = 1; n <= doc.numPages; n++){
        const box = document.createElement('div');
        box.className = 'doc-page';
        box.dataset.page = n;
        box.setAttribute('aria-label', `Page ${n}`);
        pages.push(box);
      }
      scroller.replaceChildren(...pages);
      pages.forEach(p => pageObserver.observe(p));
      updatePos();
    }catch(err){
      fallback();
    }
  }

  scroller.addEventListener('scroll', () => { if(pages.length) updatePos(); }, {passive:true});
  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  el.querySelector('.fs')?.addEventListener('click', () => {
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen();
  });

  // Re-render at the new width when the viewer resizes (window resize, entering full screen).
  let lastWidth = 0, resizeTimer;
  new ResizeObserver(() => {
    const w = scroller.clientWidth;
    if(!pages.length || Math.abs(w - lastWidth) < 40){ lastWidth ||= w; return; }
    lastWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => pages.forEach(p => {
      pageObserver.unobserve(p);
      pageObserver.observe(p);
    }), 200);
  }).observe(scroller);

  start();
}
document.querySelectorAll('.doc-viewer').forEach(setupDocViewer);
