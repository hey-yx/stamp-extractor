/* 页面逻辑：上传、预览、下载。算法在 extract.js。 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const els = {
    file: $('file'),
    pick: $('pick'),
    options: $('options'),
    enhance: $('enhance'),
    sensitivity: $('sensitivity'),
    sensitivityOut: $('sensitivityOut'),
    color: $('color'),
    downloadPng: $('downloadPng'),
    downloadWhite: $('downloadWhite'),
    status: $('status'),
    error: $('error'),
    stage: $('stage'),
    drop: $('drop'),
    preview: $('preview'),
    views: $('views'),
    busy: $('busy'),
    sample: $('sample'),
    caseGrid: $('caseGrid')
  };

  const SAMPLE = { src: './cases/02-contract-official/input.png', name: '合同专用章示例.png' };

  const state = {
    fileName: '',
    sourceData: null,
    originalUrl: '',
    result: null,
    view: 'transparent',
    runToken: 0
  };

  function setError(msg) {
    els.error.textContent = msg || '';
    els.error.hidden = !msg;
  }

  function setBusy(on) {
    els.busy.hidden = !on;
  }

  function describe() {
    if (!state.result || !state.result.ok) {
      els.status.textContent = '还没有图片。';
      return;
    }
    const s = state.result.stats;
    const parts = [
      s.width + '×' + s.height + ' px',
      '红色 ' + (s.coverage * 100).toFixed(1) + '%',
      s.ms + ' ms'
    ];
    els.status.textContent = '';
    parts.forEach(function (text) {
      const span = document.createElement('span');
      span.textContent = text;
      els.status.appendChild(span);
    });
  }

  function applyView() {
    els.stage.dataset.view = state.view;
    const buttons = els.views.querySelectorAll('button');
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    });
    if (!state.result || !state.result.ok) return;
    if (state.view === 'original') {
      els.preview.src = state.originalUrl;
    } else if (state.view === 'white') {
      els.preview.src = state.result.whiteUrl;
    } else {
      els.preview.src = state.result.pngUrl;
    }
  }

  function refreshPreview() {
    if (!state.result || !state.result.ok) return;
    state.result.pngUrl = state.result.canvas.toDataURL('image/png');
    state.result.whiteUrl = state.result.whiteCanvas.toDataURL('image/png');
    els.preview.hidden = false;
    els.drop.hidden = true;
    els.views.hidden = false;
    applyView();
    els.downloadPng.disabled = false;
    els.downloadWhite.disabled = false;
  }

  function clearResult() {
    state.result = null;
    els.preview.hidden = true;
    els.preview.removeAttribute('src');
    els.drop.hidden = false;
    els.views.hidden = true;
    els.downloadPng.disabled = true;
    els.downloadWhite.disabled = true;
  }

  function run() {
    if (!state.sourceData) return;
    const token = ++state.runToken;
    setError('');
    setBusy(true);

    setTimeout(function () {
      if (token !== state.runToken) return;
      try {
        const result = SealExtract.processImageData(state.sourceData, {
          enhance: els.enhance.checked,
          sensitivity: Number(els.sensitivity.value),
          color: els.color.value
        });
        if (token !== state.runToken) return;
        if (!result.ok) {
          clearResult();
          els.status.textContent = '没有找到红色印章。';
          setError('这张图里没有识别出成片的红色章体。换一张图，或把灵敏度调高再试。');
        } else {
          state.result = result;
          refreshPreview();
          describe();
        }
      } catch (err) {
        console.error(err);
        clearResult();
        setError('处理失败：' + (err && err.message ? err.message : '未知错误'));
      } finally {
        if (token === state.runToken) setBusy(false);
      }
    }, 20);
  }

  let debounceTimer = 0;
  function runSoon() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 90);
  }

  function loadFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|bmp|gif|heic|heif)$/i.test(file.name)) {
      setError('这不是图片文件。');
      return;
    }
    setError('');
    setBusy(true);
    state.fileName = file.name || '';

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      const size = SealExtract.workSize(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = size[0];
      canvas.height = size[1];
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size[0], size[1]);
      state.sourceData = ctx.getImageData(0, 0, size[0], size[1]);
      state.originalUrl = canvas.toDataURL('image/png');
      els.options.disabled = false;
      setBusy(false);
      run();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setBusy(false);
      setError('图片打不开。HEIC 等格式如果浏览器不支持，请先转成 JPG 或 PNG。');
    };
    img.src = url;
  }

  function loadFromUrl(src, name) {
    setError('');
    setBusy(true);
    fetch(src)
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then(function (blob) {
        const file = new File([blob], name || '示例.png', { type: blob.type || 'image/png' });
        loadFile(file);
        document.querySelector('.shell').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function () {
        setBusy(false);
        setError('示例图加载失败，刷新页面再试。');
      });
  }

  function download(kind) {
    if (!state.result || !state.result.ok) return;
    const canvas = kind === 'white' ? state.result.whiteCanvas : state.result.canvas;
    const suffix = kind === 'white' ? '-白底.png' : '-透明.png';
    const base = (state.fileName || '印章').replace(/\.[^.]+$/, '');
    canvas.toBlob(function (blob) {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = base + suffix;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }, 'image/png');
  }

  els.pick.addEventListener('click', function () { els.file.click(); });
  els.stage.addEventListener('click', function (e) {
    if (e.target.closest('#views')) return;
    if (!state.result) els.file.click();
  });
  els.file.addEventListener('change', function () {
    loadFile(els.file.files && els.file.files[0]);
    els.file.value = '';
  });

  els.sample.addEventListener('click', function (e) {
    e.stopPropagation();
    loadFromUrl(SAMPLE.src, SAMPLE.name);
  });
  els.caseGrid.addEventListener('click', function (e) {
    const fig = e.target.closest('.case');
    if (!fig) return;
    loadFromUrl(fig.dataset.src, fig.dataset.name);
  });

  els.enhance.addEventListener('change', runSoon);
  els.color.addEventListener('change', runSoon);
  els.sensitivity.addEventListener('input', function () {
    els.sensitivityOut.textContent = els.sensitivity.value;
    runSoon();
  });

  els.views.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    state.view = btn.dataset.view;
    applyView();
  });

  els.downloadPng.addEventListener('click', function () { download('png'); });
  els.downloadWhite.addEventListener('click', function () { download('white'); });

  ['dragenter', 'dragover'].forEach(function (t) {
    els.stage.addEventListener(t, function (e) {
      e.preventDefault();
      els.stage.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    els.stage.addEventListener(t, function (e) {
      e.preventDefault();
      if (t === 'dragleave' && els.stage.contains(e.relatedTarget)) return;
      els.stage.classList.remove('dragover');
    });
  });
  els.stage.addEventListener('drop', function (e) {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  window.addEventListener('paste', function (e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        const f = items[i].getAsFile();
        if (f) { loadFile(f); break; }
      }
    }
  });

  els.sensitivityOut.textContent = els.sensitivity.value;
})();
