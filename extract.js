/* 印章提取：纯浏览器实现，无外部依赖。
 * 输入 ImageData，输出透明底与白底两张 canvas，外加诊断信息。
 */
(function (global) {
  'use strict';

  const MAX_SIDE = 1800;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function workSize(w, h) {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  }

  function sampleStep(w, h) {
    return Math.max(1, Math.floor(Math.sqrt((w * h) / 160000)));
  }

  function percentile(hist, total, p) {
    const target = total * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return 255;
  }

  /* 自动增强 + 红色主导度，一遍过。
   * 增强只做白平衡：按高光像素把纸面拉回中性。不做色阶拉伸，也不把饱和度
   * 直接乘进掩膜：两者都会把深红压黑或把细笔画糊粗。分数对曝光不敏感：
   * 白纸接近 0，红墨明显为正。
   */
  function analyze(data, w, h, doEnhance) {
    const n = w * h;
    let gainR = 1, gainG = 1, gainB = 1;

    if (doEnhance) {
      const step = sampleStep(w, h);
      const hist = new Uint32Array(256);
      let sampled = 0;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
          hist[l]++;
          sampled++;
        }
      }
      if (sampled) {
        const p80 = percentile(hist, sampled, 0.8);
        let sr = 0, sg = 0, sb = 0, sl = 0, cnt = 0;
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (l >= p80) { sr += r; sg += g; sb += b; sl += l; cnt++; }
          }
        }
        if (cnt && sr && sg && sb) {
          gainR = clamp(sl / sr, 0.75, 1.35);
          gainG = clamp(sl / sg, 0.75, 1.35);
          gainB = clamp(sl / sb, 0.75, 1.35);
        }
      }
    }

    const score = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const r = data[i] * gainR;
      const g = data[i + 1] * gainG;
      const b = data[i + 2] * gainB;
      score[p] = (r - (g + b) * 0.5) / (r + g + b + 1);
    }
    return score;
  }

  function thresholdFor(sensitivity) {
    const s = clamp(sensitivity == null ? 50 : sensitivity, 0, 100);
    // 50 → 0.105；0 → 0.20；100 → 0.054
    return 0.105 * Math.pow(0.72, (s - 50) / 25);
  }

  /* 连通块标记，4 邻接。返回 labels 与面积达到 minArea 的块。 */
  function label(src, w, h, minArea) {
    const n = w * h;
    const labels = new Int32Array(n);
    const queue = new Int32Array(n);
    const comps = [];
    let next = 0;
    for (let start = 0; start < n; start++) {
      if (!src[start] || labels[start]) continue;
      next++;
      let head = 0, tail = 0;
      queue[tail++] = start;
      labels[start] = next;
      let area = 0, minX = w, minY = h, maxX = 0, maxY = 0;
      while (head < tail) {
        const p = queue[head++];
        const y = (p / w) | 0;
        const x = p - y * w;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0) { const q = p - 1; if (src[q] && !labels[q]) { labels[q] = next; queue[tail++] = q; } }
        if (x < w - 1) { const q = p + 1; if (src[q] && !labels[q]) { labels[q] = next; queue[tail++] = q; } }
        if (y > 0) { const q = p - w; if (src[q] && !labels[q]) { labels[q] = next; queue[tail++] = q; } }
        if (y < h - 1) { const q = p + w; if (src[q] && !labels[q]) { labels[q] = next; queue[tail++] = q; } }
      }
      if (area >= minArea) comps.push({ id: next, area, minX, minY, maxX, maxY });
    }
    return { labels, comps };
  }

  /* 选主色块：以最大连通块为种子，按包围盒邻近合并断弧和其他部件。
   * 章是细线条，黑字压断时常裂成几段；用 4% 边长的间距把同一枚章重新归组，
   * 又能和画面里远处的红色文字、logo 分开。返回要保留的块 id 集合。
   */
  function clusterBox(comps, w, h) {
    if (!comps.length) return null;
    const margin = Math.max(4, Math.round(0.04 * Math.min(w, h)));
    const sorted = comps.slice().sort(function (a, b) { return b.area - a.area; });
    const keep = {};
    keep[sorted[0].id] = true;
    const box = {
      minX: sorted[0].minX, minY: sorted[0].minY,
      maxX: sorted[0].maxX, maxY: sorted[0].maxY
    };
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of sorted) {
        if (keep[c.id]) continue;
        if (c.minX <= box.maxX + margin && c.maxX >= box.minX - margin &&
            c.minY <= box.maxY + margin && c.maxY >= box.minY - margin) {
          keep[c.id] = true;
          if (c.minX < box.minX) box.minX = c.minX;
          if (c.minY < box.minY) box.minY = c.minY;
          if (c.maxX > box.maxX) box.maxX = c.maxX;
          if (c.maxY > box.maxY) box.maxY = c.maxY;
          changed = true;
        }
      }
    }
    return keep;
  }

  /* 主入口。src 是工作尺寸的 ImageData。 */
  function processImageData(src, options) {
    const t0 = performance.now();
    const opts = options || {};
    const w = src.width, h = src.height, n = w * h;
    const data = src.data;

    const score = analyze(data, w, h, opts.enhance !== false);
    const t = thresholdFor(opts.sensitivity) * (opts.enhance !== false ? 0.92 : 1);

    const mask = new Uint8Array(n);
    let count = 0;
    for (let p = 0; p < n; p++) {
      if (score[p] > t) { mask[p] = 1; count++; }
    }
    const minArea = Math.max(4, Math.round(n * 0.00001));
    if (count < Math.max(12, minArea)) return { ok: false };

    // 只保留主章附近的连通块，远处红色文字和 logo 丢掉
    const lab = label(mask, w, h, minArea);
    const keep = clusterBox(lab.comps, w, h);
    if (!keep) return { ok: false };

    // 剪掉其余块，同时取章体边界
    let minX = w, minY = h, maxX = -1, maxY = -1;
    count = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const p = row + x;
        if (!mask[p]) continue;
        if (!keep[lab.labels[p]]) { mask[p] = 0; continue; }
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (count < 12) return { ok: false };

    // 贴边导出：按章体实际像素裁，只留 1px 给抗锯齿，不强制方形，也不留白
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX = Math.min(w - 1, maxX + 1);
    maxY = Math.min(h - 1, maxY + 1);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;

    const hex = (opts.color || 'ff0000').replace('#', '');
    const color = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];

    const outData = new ImageData(cw, ch);
    const buf = outData.data;
    for (let y = 0; y < ch; y++) {
      const srcRow = (y + minY) * w + minX;
      const dstRow = y * cw;
      for (let x = 0; x < cw; x++) {
        if (!mask[srcRow + x]) continue;
        const i = (dstRow + x) * 4;
        buf[i] = color[0];
        buf[i + 1] = color[1];
        buf[i + 2] = color[2];
        buf[i + 3] = 255;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext('2d').putImageData(outData, 0, 0);

    const white = document.createElement('canvas');
    white.width = cw;
    white.height = ch;
    const wctx = white.getContext('2d');
    wctx.fillStyle = '#ffffff';
    wctx.fillRect(0, 0, cw, ch);
    wctx.drawImage(canvas, 0, 0);

    return {
      ok: true,
      canvas: canvas,
      whiteCanvas: white,
      stats: {
        ms: Math.round(performance.now() - t0),
        width: cw,
        height: ch,
        coverage: count / (bw * bh)
      }
    };
  }

  global.SealExtract = {
    workSize: workSize,
    processImageData: processImageData
  };
})(window);
