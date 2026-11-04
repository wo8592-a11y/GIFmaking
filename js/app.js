(() => {
  const FPS = 30;
  const MAX_SPAN = 20;
  const MAX_BYTES = 5 * 1024 * 1024 * 1024;
  const ENGINE_LIMIT = Math.floor(1.5 * 1024 * 1024 * 1024);
  const MAX_LANES = 6;
  const RATIOS = [
    { id: "source", label: "원본" },
    { id: "1:1", label: "1:1", w: 1, h: 1 },
    { id: "4:3", label: "4:3", w: 4, h: 3 },
    { id: "3:2", label: "3:2", w: 3, h: 2 },
    { id: "16:9", label: "16:9", w: 16, h: 9 },
    { id: "21:9", label: "21:9", w: 21, h: 9 },
    { id: "4:5", label: "4:5", w: 4, h: 5 },
    { id: "3:4", label: "3:4", w: 3, h: 4 },
    { id: "9:16", label: "9:16", w: 9, h: 16 },
  ];

  const FORMATS = [
    ["mp4", true], ["mov", true], ["webm", true], ["m4v", true], ["ogv", true], ["3gp", true],
    ["avi", false], ["mkv", false], ["wmv", false], ["flv", false], ["mpeg", false],
    ["ts", false], ["m2ts", false], ["vob", false], ["asf", false],
  ];
  const VIDEO_EXT = new Set([
    "mp4", "m4v", "mov", "qt", "webm", "ogv", "ogg", "avi", "mkv", "wmv", "asf", "flv", "f4v",
    "mpeg", "mpg", "mpe", "mp2", "m1v", "m2v", "3gp", "3g2", "ts", "m2ts", "mts", "m2t", "vob",
    "divx", "dat", "dv", "mxf", "hevc", "h265", "h264",
  ]);
  const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "bmp", "avif", "tif", "tiff", "heic", "heif", "jfif", "apng", "ico"]);
  const VIDEO_ACCEPT = ".mp4,.m4v,.mov,.qt,.webm,.ogv,.ogg,.avi,.mkv,.wmv,.asf,.flv,.f4v,.mpeg,.mpg,.m2v,.3gp,.3g2,.ts,.m2ts,.mts,.vob,.mxf,video/*";
  const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.bmp,.avif,.tif,.tiff,.heic,.heif,.jfif,image/jpeg,image/png,image/webp,image/bmp,image/avif";

  const outputs = [];
  let modalTimers = [];

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function el(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }

  function yieldUi() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function even(n) {
    const v = Math.max(2, Math.round(Number(n) || 2));
    return v % 2 === 0 ? v : v - 1;
  }

  function snapWidth(n) {
    const v = Math.max(160, Math.min(1280, Number(n) || 480));
    return Math.round(v / 16) * 16;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function extOf(file) {
    const m = /\.([a-z0-9]+)$/i.exec(file.name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function safeExt(file) {
    const ext = extOf(file);
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "dat";
  }

  function baseName(name) {
    const leaf = String(name || "gif").split(/[/\\]/).pop();
    return leaf.replace(/\.[^.]+$/, "") || "gif";
  }

  function cleanBase(raw, ext) {
    let name = String(raw || "").replace(/[\\/:*?"<>|]/g, "").trim().replace(/\.+$/g, "").trim();
    if (name.toLowerCase().endsWith("." + String(ext).toLowerCase())) name = name.slice(0, -(ext.length + 1)).trim();
    return name;
  }

  function formatBytes(n) {
    if (!Number.isFinite(n)) return "-";
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + " " + units[i];
  }

  function formatClock(sec) {
    if (!Number.isFinite(sec)) return "--:--";
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return String(m).padStart(2, "0") + ":" + r.toFixed(1).padStart(4, "0");
  }

  function isVideoFile(file) {
    const ext = extOf(file);
    if (ext === "gif") return false;
    if (VIDEO_EXT.has(ext)) return true;
    return (file.type || "").startsWith("video/");
  }

  function isRaster(file) {
    const ext = extOf(file);
    if (ext === "gif") return false;
    if (IMAGE_EXT.has(ext)) return true;
    return (file.type || "").startsWith("image/") && file.type !== "image/gif";
  }

  function isGifFile(file) {
    return extOf(file) === "gif" || file.type === "image/gif";
  }

  function speedOptions() {
    let html = "";
    for (let v = 0.25; v <= 3.001; v += 0.25) {
      const value = String(Math.round(v * 100) / 100);
      html += `<option value="${value}"${value === "1" ? " selected" : ""}>${value}배</option>`;
    }
    return html;
  }

  function readSpeed(select) {
    const stepped = Math.round(Number(select.value) * 4) / 4;
    if (!Number.isFinite(stepped)) return 1;
    return Math.min(3, Math.max(0.25, stepped));
  }

  function formatIconsHtml() {
    return FORMATS.map(([ext]) => `<li class="fmt" data-ext="${ext}"><span>${ext.toUpperCase()}</span></li>`).join("");
  }

  function markFormat(ext) {
    document.querySelectorAll(".fmt").forEach((node) => node.classList.toggle("is-current", node.dataset.ext === ext));
  }

  function pulseFormats() {
    document.querySelectorAll(".formats").forEach((list) => {
      list.classList.remove("is-pulse");
      void list.offsetWidth;
      list.classList.add("is-pulse");
    });
  }

  function setWave(bar, ratio) {
    const pct = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 100)));
    $(".wave-bar__fill", bar).style.width = pct + "%";
    $(".wave-bar__label", bar).textContent = pct + "%";
    bar.setAttribute("aria-valuenow", String(pct));
  }

  function setReady(btn, ready) {
    btn.disabled = !ready;
    btn.classList.toggle("is-ready", ready);
  }

  function saveBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const day = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((file) => {
      const name = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, time, true);
      view.setUint16(12, day, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true);
      view.setUint16(28, 0, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      locals.push(local);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, day, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(32, 0, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length;
    });
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const all = locals.concat(centrals, [end]);
    const size = all.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let cursor = 0;
    all.forEach((part) => {
      out.set(part, cursor);
      cursor += part.length;
    });
    return out;
  }

  function uniqueNames(items) {
    const used = new Set();
    return items.map((item) => {
      let filename = item.base + "." + item.ext;
      let n = 2;
      while (used.has(filename.toLowerCase())) {
        filename = item.base + " (" + n + ")." + item.ext;
        n += 1;
      }
      used.add(filename.toLowerCase());
      return { ...item, filename };
    });
  }

  function seekTo(video, time) {
    return new Promise((resolve) => {
      const dur = Number.isFinite(video.duration) ? video.duration : time;
      const target = Math.min(Math.max(time, 0), Math.max(0, dur - 0.001));
      if (Math.abs((video.currentTime || 0) - target) < 0.0008) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener("seeked", finish);
        resolve();
      };
      video.addEventListener("seeked", finish);
      try { video.currentTime = target; } catch (err) { finish(); }
      setTimeout(finish, 1500);
    });
  }

  function loadVideo(video, url) {
    return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => cleanup(new Error("timeout")), 25000);
    const meta = () => { if (video.videoWidth) cleanup(null); };
    const data = () => cleanup(video.videoWidth ? null : new Error("novideo"));
    const bad = () => cleanup(new Error("decode"));
    function cleanup(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", meta);
      video.removeEventListener("loadeddata", data);
      video.removeEventListener("error", bad);
      if (err) reject(err);
      else resolve();
    }
      video.addEventListener("loadedmetadata", meta);
      video.addEventListener("loadeddata", data);
      video.addEventListener("error", bad);
      video.src = url;
      video.load();
    });
  }

  async function finiteDuration(video) {
    if (Number.isFinite(video.duration) && video.duration > 0 && video.duration !== Infinity) return video.duration;
    await seekTo(video, 1e7);
    const duration = video.duration;
    await seekTo(video, 0);
    return duration;
  }

  function drawSubtitles(ctx, cues, localTime, width, height, scale) {
    const active = cues.filter((cue) => localTime >= cue.start && localTime < cue.end && cue.text.trim());
    if (!active.length) return;
    const size = Math.max(12, Math.round(Math.max(16, width / 18) * (Number(scale) || 1)));
    ctx.font = `700 ${size}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = [];
    active.forEach((cue) => wrapLines(ctx, cue.text.trim(), width * 0.86).forEach((line) => lines.push(line)));
    const lineH = size * 1.35;
    let y = height - 12 - lines.length * lineH;
    lines.forEach((line) => {
      const tw = ctx.measureText(line).width;
      const x = width / 2;
      ctx.beginPath();
      const boxX = x - tw / 2 - 8;
      if (ctx.roundRect) ctx.roundRect(boxX, y, tw + 16, lineH, 8);
      else ctx.rect(boxX, y, tw + 16, lineH);
      ctx.fillStyle = "rgba(4, 40, 70, 0.78)";
      ctx.fill();
      ctx.lineWidth = Math.max(2, size / 12);
      ctx.strokeStyle = "#08304d";
      ctx.strokeText(line, x, y + lineH / 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(line, x, y + lineH / 2);
      y += lineH;
    });
  }

  function wrapLines(ctx, text, maxW) {
    const lines = [];
    let cur = "";
    [...text].forEach((ch) => {
      const next = cur + ch;
      if (ctx.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
      } else cur = next;
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }

  function drawContain(ctx, source, width, height) {
    const sw = source.videoWidth || source.displayWidth || source.width || 0;
    const sh = source.videoHeight || source.displayHeight || source.height || 0;
    ctx.fillStyle = "#dff4ff";
    ctx.fillRect(0, 0, width, height);
    if (!sw || !sh) return;
    const scale = Math.min(width / sw, height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }

  function aspectOf(ratioId, srcW, srcH) {
    const ratio = RATIOS.find((item) => item.id === ratioId);
    if (ratio && ratio.w) return ratio.h / ratio.w;
    if (srcW > 0 && srcH > 0) return srcH / srcW;
    return 9 / 16;
  }

  function outputSize(srcW, srcH, frames, requested, ratioId) {
    const aspect = aspectOf(ratioId, srcW, srcH);
    let width = even(requested);
    let height = even(Math.max(2, width * aspect));
    let reduced = false;
    while (width > 160 && width * height * frames > 90000000) {
      width = even(width * 0.85);
      height = even(Math.max(2, width * aspect));
      reduced = true;
    }
    return { width, height, reduced };
  }

  async function encodeGif({ canvas, width, height, frameCount, delayMs, loop, draw, onFrame, cancelled }) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const gif = exports.GIFEncoder();
    const format = frameCount > 400 ? "rgb444" : "rgb565";
    const maxColors = frameCount > 800 ? 48 : frameCount > 300 ? 96 : 128;
    let nextThumb = 0;
    const step = Math.max(1, Math.floor(frameCount / 18));
    const thumbs = [];
    for (let i = 0; i < frameCount; i += 1) {
      if (cancelled()) return null;
      await draw(ctx, i);
      if (cancelled()) return null;
      const image = ctx.getImageData(0, 0, width, height);
      const palette = exports.quantize(image.data, maxColors, { format });
      const index = exports.applyPalette(image.data, palette, format);
      gif.writeFrame(index, width, height, {
        palette,
        delay: delayMs,
        repeat: i === 0 ? (loop ? 0 : -1) : 0,
      });
      if (i === frameCount - 1 || i >= nextThumb) {
        nextThumb = i + step;
        thumbs.push(makeThumb(canvas, i + 1));
      }
      onFrame(i, frameCount, thumbs[thumbs.length - 1]);
      await yieldUi();
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: "image/gif" });
  }

  function makeThumb(canvas, n) {
    const thumb = document.createElement("canvas");
    thumb.width = 120;
    thumb.height = Math.max(1, Math.round(canvas.height * (120 / canvas.width)));
    thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const img = document.createElement("img");
    img.src = thumb.toDataURL("image/jpeg", 0.72);
    img.alt = "생성된 프레임 " + n;
    return img;
  }

  let ffmpegApi = null;
  let loadPromise = null;
  let ffmpegQueue = Promise.resolve();

  function withFfmpeg(task) {
    const run = ffmpegQueue.then(async () => task(await ensureFfmpeg()));
    ffmpegQueue = run.then(() => {}, () => {});
    return run;
  }

  async function ensureFfmpeg() {
    if (ffmpegApi && ffmpegApi.isLoaded()) return ffmpegApi;
    if (!window.FFmpeg || typeof FFmpeg.createFFmpeg !== "function") throw new Error("엔진 없음");
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const ffmpeg = FFmpeg.createFFmpeg({
            log: false,
            corePath: new URL("vendor/ffmpeg-core.js", document.baseURI).href,
          });
          await ffmpeg.load();
          ffmpegApi = ffmpeg;
          return ffmpeg;
        } catch (err) {
          loadPromise = null;
          ffmpegApi = null;
          throw err;
        }
      })();
    }
    return loadPromise;
  }

  async function runCommand(ffmpeg, args, ms) {
    let timer;
    try {
      await Promise.race([
        ffmpeg.run(...args),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms || 180000); }),
      ]);
    } catch (err) {
      if (err && err.message === "timeout") {
        try { ffmpeg.exit(); } catch (e) { /* 코어를 다시 띄웁니다. */ }
        ffmpegApi = null;
        loadPromise = null;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function toBlob(data, type) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy], { type });
  }

  function parseProbe(logs) {
    const text = logs.join("\n");
    const dur = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!dur) return null;
    const duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);
    const stream = logs.find((line) => line.includes("Video:"));
    if (!stream || !duration) return null;
    const wh = stream.match(/(\d{2,5})x(\d{2,5})/);
    if (!wh) return null;
    const fps = stream.match(/([\d.]+)\s*fps/);
    return { duration, width: Number(wh[1]), height: Number(wh[2]), fps: fps ? Number(fps[1]) : 0 };
  }

  async function probeFile(file) {
    const inputName = "in." + safeExt(file);
    return withFfmpeg(async (ffmpeg) => {
      const logs = [];
      ffmpeg.setLogger(({ message }) => logs.push(String(message)));
      ffmpeg.setProgress(() => {});
      const bytes = new Uint8Array(await file.arrayBuffer());
      ffmpeg.FS("writeFile", inputName, bytes);
      try {
        await runCommand(ffmpeg, ["-i", inputName], 90000);
      } catch (err) { /* 정보만 읽을 때도 종료 코드가 납니다. */ }
      try { ffmpeg.FS("unlink", inputName); } catch (err) { /* 이미 없으면 넘어갑니다. */ }
      return parseProbe(logs);
    });
  }

  async function transcodeClip(file, start, span, width, onRatio) {
    const inputName = "in." + safeExt(file);
    return withFfmpeg(async (ffmpeg) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      ffmpeg.FS("writeFile", inputName, bytes);
      ffmpeg.setLogger(() => {});
      ffmpeg.setProgress(({ ratio }) => {
        if (onRatio && Number.isFinite(ratio)) onRatio(Math.max(0, Math.min(1, ratio)));
      });
      try {
        await runCommand(ffmpeg, [
          "-i", inputName,
          "-ss", start.toFixed(3),
          "-t", Math.max(span, 1 / FPS).toFixed(3),
          "-an",
          "-vf", `scale=${width}:-2:flags=lanczos`,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "26",
          "-pix_fmt", "yuv420p",
          "out.mp4",
        ]);
        const data = ffmpeg.FS("readFile", "out.mp4");
        return toBlob(data, "video/mp4");
      } finally {
        try { ffmpeg.FS("unlink", inputName); } catch (err) { /* 정리 */ }
        try { ffmpeg.FS("unlink", "out.mp4"); } catch (err) { /* 정리 */ }
      }
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function pickRecorderMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const types = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function frameHoldMs(image) {
    const us = Number(image && image.duration) || 0;
    if (us >= 20000 && us < 600000000) return us / 1000;
    return 100;
  }

  async function gifToVideoCanvas(file, targetWidth, ratioId, canvas, onRatio) {
    const mime = pickRecorderMime();
    if (!mime || typeof ImageDecoder !== "function") throw new Error("no-canvas");
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: "image/gif" });
    let stream = null;
    let rec = null;
    try {
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (!track) throw new Error("no-track");
      const first = await decoder.decode({ frameIndex: 0 });
      const srcW = first.image.displayWidth || first.image.codedWidth || 2;
      const srcH = first.image.displayHeight || first.image.codedHeight || 2;
      const count = track.frameCount || 1;
      const size = outputSize(srcW, srcH, count, targetWidth, ratioId);
      const width = size.width;
      const height = size.height;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      stream = canvas.captureStream(30);
      const videoTrack = stream.getVideoTracks()[0];
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      const chunks = [];
      rec.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      const stopped = new Promise((resolve, reject) => {
        rec.onstop = resolve;
        rec.onerror = () => reject(new Error("record"));
      });
      const paintHold = async (image) => {
        const hold = frameHoldMs(image);
        const ticks = Math.max(1, Math.round(hold / 40));
        for (let tick = 0; tick < ticks; tick += 1) {
          drawContain(ctx, image, width, height);
          if (videoTrack && videoTrack.requestFrame) videoTrack.requestFrame();
          await sleep(hold / ticks);
        }
      };
      rec.start(200);
      await paintHold(first.image);
      first.image.close();
      if (onRatio) onRatio(1 / count);
      for (let i = 1; i < count; i += 1) {
        const decoded = await decoder.decode({ frameIndex: i });
        await paintHold(decoded.image);
        decoded.image.close();
        if (onRatio) onRatio((i + 1) / count);
      }
      if (rec.state === "recording") rec.stop();
      await stopped;
      const blob = new Blob(chunks, { type: "video/webm" });
      if (blob.size < 300) throw new Error("empty-video");
      return { blob, ext: "webm" };
    } finally {
      if (rec && rec.state === "recording") {
        try { rec.stop(); } catch (err) { /* 녹화가 이미 끝난 경우 */ }
      }
      if (stream) stream.getTracks().forEach((item) => item.stop());
      try { decoder.close(); } catch (err) { /* 디코더가 이미 닫힘 */ }
    }
  }

  async function gifToVideo(file, width, ratioId, canvas, onRatio) {
    try {
      return await gifToVideoCanvas(file, width, ratioId, canvas, onRatio);
    } catch (err) {
      console.warn(err);
      let srcW = width;
      let srcH = width;
      try {
        const info = await inspectGif(file);
        if (info && info.width) {
          srcW = info.width;
          srcH = info.height || width;
        }
      } catch (probeErr) { /* 비율은 선택한 값으로 맞춥니다. */ }
      const size = outputSize(srcW, srcH, 30, width, ratioId);
      const blob = await gifToMp4(file, size.width, size.height, onRatio);
      if (!blob || blob.size < 300) throw new Error("empty-video");
      return { blob, ext: "mp4" };
    }
  }

  async function gifToMp4(file, width, height, onRatio) {
    return withFfmpeg(async (ffmpeg) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      ffmpeg.FS("writeFile", "in.gif", bytes);
      ffmpeg.setLogger(() => {});
      ffmpeg.setProgress(({ ratio }) => {
        if (onRatio && Number.isFinite(ratio)) onRatio(Math.max(0, Math.min(1, ratio)));
      });
      try {
        await runCommand(ffmpeg, [
          "-i", "in.gif",
          "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0xdff4ff`,
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-an",
          "out.mp4",
        ]);
        return toBlob(ffmpeg.FS("readFile", "out.mp4"), "video/mp4");
      } finally {
        try { ffmpeg.FS("unlink", "in.gif"); } catch (err) { /* 정리 */ }
        try { ffmpeg.FS("unlink", "out.mp4"); } catch (err) { /* 정리 */ }
      }
    });
  }

  function parseGif(bytes) {
    if (!bytes || bytes.length < 13) return null;
    const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (sig !== "GIF87a" && sig !== "GIF89a") return null;
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    let p = 13;
    if (bytes[10] & 0x80) p += 3 * (1 << ((bytes[10] & 7) + 1));
    let frames = 0;
    let delayCs = 0;
    while (p < bytes.length) {
      const sep = bytes[p++];
      if (sep === 0x3b) break;
      if (sep === 0x21) {
        if (p >= bytes.length) break;
        const label = bytes[p++];
        if (label === 0xf9 && p < bytes.length) {
          const block = bytes[p++];
          if (p + 2 < bytes.length) delayCs += bytes[p + 1] | (bytes[p + 2] << 8);
          p += block;
          if (bytes[p] === 0) p += 1;
          continue;
        }
        while (p < bytes.length) {
          const size = bytes[p++];
          if (!size) break;
          p += size;
        }
        continue;
      }
      if (sep === 0x2c) {
        if (p + 9 > bytes.length) break;
        frames += 1;
        p += 8;
        const packed = bytes[p++];
        if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
        p += 1;
        while (p < bytes.length) {
          const size = bytes[p++];
          if (!size) break;
          p += size;
        }
        continue;
      }
      break;
    }
    return { width, height, frames, duration: delayCs / 100 };
  }

  async function inspectGif(file) {
    if (file.size > 80 * 1024 * 1024) {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const info = parseGif(head);
      return info ? { ...info, frames: 0, duration: 0, partial: true } : null;
    }
    return parseGif(new Uint8Array(await file.arrayBuffer()));
  }

  function upsertOutput(rec) {
    const prev = outputs.find((item) => item.id === rec.id);
    if (prev) {
      if (prev.url !== rec.url) URL.revokeObjectURL(prev.url);
      rec.checked = prev.checked;
      Object.assign(prev, rec);
    } else {
      rec.checked = true;
      outputs.push(rec);
    }
    renderDock();
  }

  function outputHost(id) {
    const safe = window.CSS && CSS.escape ? CSS.escape(id) : id;
    return document.querySelector(`[data-output="${safe}"]`);
  }

  function detachPreview(rec) {
    const host = outputHost(rec.id);
    if (!host) return;
    const img = host.querySelector("[data-role=result-img]");
    const box = host.querySelector("[data-role=result]");
    if (img) img.removeAttribute("src");
    if (box) box.hidden = true;
    const download = host.querySelector("[data-action=download]");
    if (download) setReady(download, false);
  }

  function removeOutputs(ids) {
    const set = new Set(ids);
    for (let i = outputs.length - 1; i >= 0; i -= 1) {
      if (!set.has(outputs[i].id)) continue;
      detachPreview(outputs[i]);
      URL.revokeObjectURL(outputs[i].url);
      outputs.splice(i, 1);
    }
    renderDock();
  }

  function removeOutput(id) {
    removeOutputs([id]);
  }

  function renderDock() {
    const list = $("#dock-list");
    const all = $("#check-all");
    if (!outputs.length) {
      list.innerHTML = '<p class="dock__empty">아직 완료된 파일이 없습니다.</p>';
      all.checked = false;
      all.indeterminate = false;
      return;
    }
    list.innerHTML = "";
    outputs.forEach((rec) => {
      const row = el(`<article class="dock__item" style="--tone:#046ea3"></article>`);
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = rec.checked !== false;
      check.addEventListener("change", () => {
        rec.checked = check.checked;
        syncCheckAll();
      });
      const preview = rec.ext === "gif" ? document.createElement("img") : document.createElement("video");
      preview.src = rec.url;
      if (preview.tagName === "VIDEO") {
        preview.muted = true;
        preview.loop = true;
        preview.playsInline = true;
        preview.autoplay = true;
      }
      preview.alt = rec.name;
      const text = document.createElement("div");
      text.innerHTML = `<strong>${esc(rec.name)}.${esc(rec.ext)}</strong><br><span>${esc(rec.kind)} · ${formatBytes(rec.blob.size)}</span>`;
      const actions = document.createElement("div");
      actions.className = "dock__actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn--download";
      button.textContent = "다운로드";
      button.addEventListener("click", () => openDownload([rec]));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost";
      remove.textContent = "빼기";
      remove.addEventListener("click", () => removeOutput(rec.id));
      actions.append(button, remove);
      row.append(check, preview, text, actions);
      list.appendChild(row);
    });
    syncCheckAll();
  }

  function syncCheckAll() {
    const all = $("#check-all");
    const checked = outputs.filter((item) => item.checked).length;
    all.checked = outputs.length > 0 && checked === outputs.length;
    all.indeterminate = checked > 0 && checked < outputs.length;
  }

  function openDownload(records) {
    if (!records.length) return;
    closeModal();
    const modal = $("#download-modal");
    const box = $("#modal-previews");
    const gifCount = records.filter((rec) => rec.ext === "gif").length;
    $("#modal-title").textContent = "다운로드";
    $("#modal-lead").textContent = records.length > 1
      ? "선택한 파일을 다운로드할까요?"
      : (gifCount ? "완성된 GIF를 다운로드할까요?" : "완성된 동영상을 다운로드할까요?");
    box.innerHTML = "";
    records.forEach((rec) => {
      const item = el(`<div class="modal__item" data-id="${esc(rec.id)}" data-ext="${esc(rec.ext)}"></div>`);
      if (rec.ext === "gif") {
        const img = document.createElement("img");
        img.src = rec.url;
        img.alt = "완성된 GIF 미리보기";
        item.appendChild(img);
        if (!rec.loops) {
          const ms = Math.max(400, Math.round((rec.duration || 1) * 1000));
          modalTimers.push(setInterval(() => {
            img.removeAttribute("src");
            requestAnimationFrame(() => { img.src = rec.url; });
          }, ms));
        }
      } else {
        const video = document.createElement("video");
        video.src = rec.url;
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        item.appendChild(video);
      }
      const nameRow = el(`<div class="name-row"><input type="text" spellcheck="false" aria-label="파일 이름"><span class="ext-lock">.${esc(rec.ext)}</span></div>`);
      nameRow.querySelector("input").value = rec.name;
      item.appendChild(nameRow);
      box.appendChild(item);
    });
    modal.hidden = false;
    const first = box.querySelector("input");
    if (first) {
      first.focus();
      first.select();
    }
  }

  function closeModal() {
    modalTimers.forEach((timer) => clearInterval(timer));
    modalTimers = [];
    const modal = $("#download-modal");
    modal.hidden = true;
    $("#modal-previews").innerHTML = "";
  }

  async function confirmDownload() {
    const blocks = [...$("#modal-previews").querySelectorAll(".modal__item")];
    const picked = [];
    let bad = false;
    blocks.forEach((block) => {
      const rec = outputs.find((item) => item.id === block.dataset.id);
      const input = $("input", block);
      const ext = block.dataset.ext;
      const base = cleanBase(input.value, ext);
      if (!rec || !base) {
        bad = true;
        input.classList.add("is-bad");
        return;
      }
      input.classList.remove("is-bad");
      rec.name = base;
      picked.push({ base, ext, blob: rec.blob });
    });
    if (bad || !picked.length) return;
    const named = uniqueNames(picked);
    if (named.length === 1) saveBlob(named[0].blob, named[0].filename);
    else {
      const packed = [];
      for (const item of named) packed.push({ name: item.filename, data: new Uint8Array(await item.blob.arrayBuffer()) });
      saveBlob(new Blob([zipStore(packed)], { type: "application/zip" }), "GIF생성기_완료파일.zip");
    }
    renderDock();
    closeModal();
  }

  function ratioHtml() {
    return `<div class="ratios" role="group" aria-label="화면 비율">${RATIOS.map((item, index) =>
      `<button type="button" class="ratio${index === 0 ? " is-on" : ""}" data-ratio="${item.id}" aria-pressed="${index === 0 ? "true" : "false"}">${item.label}</button>`
    ).join("")}</div>`;
  }

  function readRatio(root) {
    const on = root.querySelector(".ratio.is-on");
    return on ? on.dataset.ratio : "source";
  }

  function bindRatios(root, onChange) {
    root.querySelectorAll(".ratio").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".ratio").forEach((item) => {
          const on = item === btn;
          item.classList.toggle("is-on", on);
          item.setAttribute("aria-pressed", on ? "true" : "false");
        });
        if (onChange) onChange();
      });
    });
  }

  function sizeFieldsHtml() {
    return `<div class="size-box">
      <p class="hint">화면 비율</p>
      ${ratioHtml()}
      <label class="field">가로 크기
        <span class="size-line">
          <input data-role="width" type="range" min="160" max="1280" step="16" value="480">
          <input data-role="width-num" type="number" min="160" max="1280" step="16" value="480">
        </span>
      </label>
    </div>`;
  }

  function waveHtml() {
    return `<div class="progress-row">
      <div class="wave-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="변환 진행도">
        <div class="wave-bar__fill" style="width:0%"><span class="wave wave-a"></span><span class="wave wave-b"></span><span class="bubbles"></span></div>
        <span class="wave-bar__label">0%</span>
      </div>
      <button type="button" class="btn btn--download btn--download-side" data-action="download" disabled>다운로드</button>
    </div>`;
  }

  function createLane(index) {
    const tones = ["#046ea3", "#0b8f86", "#1a74c9", "#0e7c66", "#2a6f97", "#127a9b"];
    const tone = tones[(index - 1) % tones.length];
    const root = el(`<article class="lane" data-output="lane-${index}" style="--tone:${tone}">
      <div class="lane__head">
        <span class="lane__badge">작업 영역 ${index}</span>
        <h3>동영상 GIF</h3>
        <div class="lane__actions">
          <button type="button" class="btn btn--ghost btn--small" data-action="eject" hidden>영상 빼기</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="remove-lane">영역 지우기</button>
        </div>
      </div>
      <div class="lane__grid">
        <div class="lane__main">
          <div class="drop" data-role="drop" tabindex="0">
            <strong>동영상 파일을 끌어다 놓으세요</strong>
            <p data-role="drop-text">폴더에서 고르거나 여기에 놓으세요.</p>
            <div class="btn-row">
              <button type="button" class="btn" data-action="browse">동영상 파일 선택</button>
            </div>
            <p>한 번에 1개 · 최대 5GB</p>
            <input class="file-input" data-role="file" type="file" accept="${VIDEO_ACCEPT}">
          </div>
          <div class="info" data-role="info" hidden></div>
          <div class="unsupported" data-role="bad" hidden>
            <strong data-role="bad-title"></strong>
            <p data-role="bad-copy"></p>
            <ul class="formats">${formatIconsHtml()}</ul>
          </div>
          <div class="stage" data-role="stage">
            <div class="stage__empty" data-role="empty">동영상을 올리면 여기에 미리보기가 나옵니다</div>
            <video data-role="video" playsinline muted></video>
            <canvas class="live-canvas" data-role="canvas"></canvas>
            <div class="subtitle-overlay" data-role="overlay"></div>
          </div>
          <div class="result" data-role="result" hidden>
            <p>완성된 GIF</p>
            <img data-role="result-img" alt="완성된 GIF">
          </div>
        </div>
        <div class="lane__tools">
          <div class="trim-box">
            <h3>GIF로 만들 구간</h3>
            <p class="hint">시작과 끝을 잡으세요. 최대 20초입니다.</p>
            <div class="trim__rail" data-role="trim">
              <div class="trim__range" data-role="range"></div>
              <button type="button" class="trim__handle trim__handle--in" data-handle="in" aria-label="시작 지점"></button>
              <button type="button" class="trim__handle trim__handle--out" data-handle="out" aria-label="끝 지점"></button>
            </div>
            <div class="subs__form">
              <label>시작(초) <input data-role="in" type="number" min="0" step="0.1" value="0"></label>
              <label>끝(초) <input data-role="out" type="number" min="0" step="0.1" value="0"></label>
            </div>
            <p class="limit-note" data-role="limit">GIF로 만들 수 있는 최대 시간은 20초입니다.</p>
          </div>
          <div class="subs">
            <h3>자막</h3>
            <p class="hint">자막 시간선은 구간 막대와 따로입니다. 시간은 선택한 구간 기준입니다.</p>
            <div class="subs__rail" data-role="subrail"></div>
            <div class="subs__form">
              <input data-role="subtext" type="text" maxlength="80" placeholder="자막 내용">
              <button type="button" class="btn" data-action="add-sub">자막 추가</button>
            </div>
            <label class="field">자막 크기
              <span class="size-line">
                <input data-role="subsize" type="range" min="0.6" max="2.2" step="0.2" value="1" aria-label="자막 크기">
                <output data-role="subsize-label">100%</output>
              </span>
            </label>
            <ul class="subs__list" data-role="sublist"></ul>
          </div>
          <fieldset class="playback">
            <legend>재생</legend>
            <button type="button" class="btn btn--ghost" data-action="play" disabled>선택 구간 재생</button>
            <label class="check"><input data-role="loop" type="checkbox" checked> 반복 재생</label>
            <label class="check"><input data-role="reverse" type="checkbox"> 역재생</label>
            <label class="field">배속
              <select data-role="speed">${speedOptions()}</select>
            </label>
          </fieldset>
          ${sizeFieldsHtml()}
          <p class="estimate" data-role="estimate">구간을 정하면 30FPS 프레임 수가 여기에 표시됩니다.</p>
          <button type="button" class="btn btn--convert" data-action="convert" disabled>30FPS GIF로 변환</button>
          ${waveHtml()}
          <p class="status" data-role="status" aria-live="polite"></p>
          <div class="live">
            <p>생성되는 GIF 프레임</p>
            <div class="thumbs" data-role="thumbs"></div>
          </div>
        </div>
      </div>
    </article>`);
    $("#lanes").appendChild(root);

    const video = $("[data-role=video]", root);
    const canvas = $("[data-role=canvas]", root);
    const stage = $("[data-role=stage]", root);
    const drop = $("[data-role=drop]", root);
    const fileInput = $("[data-role=file]", root);
    const info = $("[data-role=info]", root);
    const bad = $("[data-role=bad]", root);
    const trim = $("[data-role=trim]", root);
    const subRail = $("[data-role=subrail]", root);
    const overlay = $("[data-role=overlay]", root);
    const status = $("[data-role=status]", root);
    const estimate = $("[data-role=estimate]", root);
    const thumbs = $("[data-role=thumbs]", root);
    const result = $("[data-role=result]", root);
    const resultImg = $("[data-role=result-img]", root);
    const bar = $(".wave-bar", root);
    const downloadBtn = $("[data-action=download]", root);
    const convertBtn = $("[data-action=convert]", root);
    const playBtn = $("[data-action=play]", root);
    const widthRange = $("[data-role=width]", root);
    const widthNum = $("[data-role=width-num]", root);
    const speedSelect = $("[data-role=speed]", root);
    const loopBox = $("[data-role=loop]", root);
    const reverseBox = $("[data-role=reverse]", root);
    const inInput = $("[data-role=in]", root);
    const outInput = $("[data-role=out]", root);
    const limitNote = $("[data-role=limit]", root);
    const outputId = "lane-" + index;
    const state = {
      file: null, url: "", ready: false, native: false, proxy: false, proxyKey: "",
      duration: 0, start: 0, end: 0, srcWidth: 0, srcHeight: 0, srcFps: 0,
      cues: [], cueId: 0, cueSeq: 0, job: 0, previewGen: 0, converting: false, playing: false,
      onTime: null, timer: null,
    };

    function setStatus(text, badState) {
      status.textContent = text || "";
      status.classList.toggle("is-bad", Boolean(badState));
    }

    function requestedWidth() {
      return snapWidth(widthNum.value || widthRange.value);
    }

    function renderInfo() {
      const file = state.file;
      const rows = [
        ["파일 이름", file ? file.name : "-"],
        ["형식", file ? (extOf(file).toUpperCase() || file.type || "-") : "-"],
        ["용량", file ? formatBytes(file.size) : "-"],
        ["영상 길이", state.duration ? formatClock(state.duration) : "-"],
        ["해상도", state.srcWidth ? state.srcWidth + " × " + state.srcHeight : "-"],
        ["원본 FPS", state.srcFps ? String(Math.round(state.srcFps * 100) / 100) : "-"],
        ["변환 FPS", "30 FPS"],
        ["수정 시각", file ? new Date(file.lastModified).toLocaleString("ko-KR") : "-"],
      ];
      info.hidden = !file;
      info.innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    }

    const subSize = $("[data-role=subsize]", root);
    const subLabel = $("[data-role=subsize-label]", root);
    function subScale() {
      const n = Number(subSize.value);
      return n >= 0.6 ? n : 1;
    }
    function applySubPreview() {
      subLabel.textContent = Math.round(subScale() * 100) + "%";
      overlay.style.fontSize = Math.round(20 * subScale()) + "px";
    }

    function updateEstimate() {
      if (!state.duration) {
        estimate.textContent = "구간을 정하면 30FPS 프레임 수가 여기에 표시됩니다.";
        return;
      }
      const span = Math.max(0, state.end - state.start);
      const speed = readSpeed(speedSelect);
      const frames = Math.max(1, Math.round((span / speed) * FPS));
      const outDur = span / speed;
      estimate.textContent = `선택 ${span.toFixed(1)}초 · ${speed}배${reverseBox.checked ? " · 역재생" : ""} · GIF ${outDur.toFixed(1)}초 · ${frames}프레임 · 30FPS`;
    }

    function flashLimit() {
      limitNote.classList.add("is-hit");
      clearTimeout(flashLimit.timer);
      flashLimit.timer = setTimeout(() => limitNote.classList.remove("is-hit"), 700);
    }

    function setSelection(start, end, mode) {
      const dur = state.duration;
      if (!dur) return;
      const maxSpan = Math.min(MAX_SPAN, dur);
      const minSpan = Math.min(1 / FPS, maxSpan);
      if (mode === "move") {
        const span = Math.min(Math.max(end - start, minSpan), maxSpan);
        let s = start;
        if (s < 0) s = 0;
        if (s + span > dur) s = Math.max(0, dur - span);
        state.start = s;
        state.end = s + span;
        renderTrim();
        return;
      }
      let s = Math.max(0, Math.min(start, dur));
      let e = Math.max(0, Math.min(end, dur));
      if (e < s) { const swap = s; s = e; e = swap; }
      if (e - s < minSpan) e = Math.min(dur, s + minSpan);
      if (e - s < minSpan) s = Math.max(0, e - minSpan);
      let hit = false;
      if (e - s > maxSpan + 0.0001) {
        hit = true;
        if (mode === "in") s = Math.max(0, e - maxSpan);
        else e = Math.min(dur, s + maxSpan);
        if (e - s > maxSpan) s = Math.max(0, e - maxSpan);
      }
      state.start = s;
      state.end = e;
      renderTrim();
      if (hit) flashLimit();
    }

    function renderTrim() {
      const dur = state.duration || 1;
      const left = (state.start / dur) * 100;
      const width = ((state.end - state.start) / dur) * 100;
      $("[data-role=range]", root).style.left = left + "%";
      $("[data-role=range]", root).style.width = Math.max(width, 0) + "%";
      $("[data-handle=in]", root).style.left = left + "%";
      $("[data-handle=out]", root).style.left = (left + width) + "%";
      if (document.activeElement !== inInput) inInput.value = round2(state.start);
      if (document.activeElement !== outInput) outInput.value = round2(state.end);
      inInput.max = state.duration || 0;
      outInput.max = state.duration || 0;
      updateEstimate();
      renderCues();
    }

    function renderCues() {
      const span = Math.max(state.end - state.start, 0.001);
      subRail.innerHTML = "";
      state.cues.forEach((cue) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "subs__block" + (cue.id === state.cueId ? " is-selected" : "");
        btn.style.left = Math.max(0, (cue.start / span) * 100) + "%";
        btn.style.width = Math.max(2, ((cue.end - cue.start) / span) * 100) + "%";
        btn.textContent = cue.text || "자막";
        btn.addEventListener("click", () => { state.cueId = cue.id; renderCues(); });
        subRail.appendChild(btn);
      });
      const selected = state.cues.find((cue) => cue.id === state.cueId);
      if (selected) {
        ["in", "out"].forEach((which) => {
          const handle = document.createElement("button");
          handle.type = "button";
          handle.className = "subs__handle";
          handle.dataset.sub = which;
          handle.style.left = ((which === "in" ? selected.start : selected.end) / span) * 100 + "%";
          handle.setAttribute("aria-label", which === "in" ? "자막 시작" : "자막 끝");
          subRail.appendChild(handle);
        });
      }
      const list = $("[data-role=sublist]", root);
      list.innerHTML = "";
      state.cues.forEach((cue) => {
        const item = document.createElement("li");
        item.className = "subs__item";
        const text = document.createElement("input");
        text.type = "text";
        text.value = cue.text;
        text.maxLength = 80;
        text.addEventListener("input", () => {
          cue.text = text.value;
          const blocks = [...subRail.querySelectorAll(".subs__block")];
          const idx = state.cues.indexOf(cue);
          if (blocks[idx]) blocks[idx].textContent = cue.text || "자막";
        });
        const start = document.createElement("input");
        start.type = "number";
        start.min = "0";
        start.step = "0.1";
        start.value = round2(cue.start);
        start.addEventListener("change", () => {
          cue.start = Math.max(0, Math.min(Number(start.value) || 0, cue.end - 0.1));
          renderCues();
        });
        const end = document.createElement("input");
        end.type = "number";
        end.min = "0";
        end.step = "0.1";
        end.value = round2(cue.end);
        end.addEventListener("change", () => {
          cue.end = Math.max(cue.start + 0.1, Number(end.value) || 0);
          renderCues();
        });
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn--ghost";
        del.textContent = "삭제";
        del.addEventListener("click", () => {
          state.cues = state.cues.filter((itemCue) => itemCue.id !== cue.id);
          renderCues();
        });
        item.append("자막 ", text, " 시작 ", start, " 끝 ", end, del);
        list.appendChild(item);
      });
    }

    function showOverlay(local) {
      const texts = state.cues.filter((cue) => local >= cue.start && local < cue.end).map((cue) => cue.text.trim()).filter(Boolean);
      overlay.textContent = texts.join("\n");
      overlay.style.whiteSpace = "pre-line";
    }

    function enableReady(on) {
      state.ready = on;
      convertBtn.disabled = !on || state.converting;
      playBtn.disabled = !on || state.converting;
    }

    function showUnsupported(file, kind) {
      const ext = (extOf(file) || "알 수 없음").toUpperCase();
      bad.hidden = false;
      $("[data-role=bad-title]", root).textContent = kind === "large"
        ? ext + " 파일은 이 크기에서 바로 변환할 수 없습니다."
        : ext + " 파일은 이 환경에서 GIF로 변환할 수 없습니다.";
      $("[data-role=bad-copy]", root).textContent = kind === "large"
        ? "브라우저가 직접 열지 못하고, 변환 엔진에 올리기에는 파일이 큽니다. MP4, MOV, WEBM, M4V, OGV, 3GP는 5GB까지 바로 다룰 수 있습니다. 아래 형식의 파일로 다시 선택해 주세요."
        : "아래 변환 가능한 동영상 형식을 보고, 그 형식의 파일을 다시 선택해 주세요. 파일이 손상된 경우에도 변환되지 않습니다.";
      enableReady(false);
      markFormat("");
      pulseFormats();
      bad.scrollIntoView({ block: "nearest" });
    }

    function stopPlay() {
      state.previewGen += 1;
      state.playing = false;
      video.pause();
      if (state.onTime) {
        video.removeEventListener("timeupdate", state.onTime);
        state.onTime = null;
      }
      video.onended = null;
      clearInterval(state.timer);
      state.timer = null;
      playBtn.textContent = "선택 구간 재생";
    }

    function clearVideo() {
      state.job += 1;
      stopPlay();
      state.converting = false;
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = "";
      state.file = null;
      state.ready = false;
      state.native = false;
      state.proxy = false;
      state.proxyKey = "";
      state.duration = 0;
      state.start = 0;
      state.end = 0;
      state.srcWidth = 0;
      state.srcHeight = 0;
      state.srcFps = 0;
      state.cues = [];
      video.removeAttribute("src");
      video.load();
      stage.classList.remove("has-video", "is-converting");
      bad.hidden = true;
      result.hidden = true;
      resultImg.removeAttribute("src");
      thumbs.innerHTML = "";
      overlay.textContent = "";
      setWave(bar, 0);
      setReady(downloadBtn, false);
      removeOutput(outputId);
      $("[data-role=drop-text]", root).textContent = "폴더에서 고르거나 여기에 놓으세요.";
      enableReady(false);
      renderInfo();
      renderTrim();
      setStatus("");
      convertBtn.textContent = "30FPS GIF로 변환";
      syncEject();
    }

    function syncEject() {
      root.querySelectorAll("[data-action=eject]").forEach((btn) => { btn.hidden = !state.file; });
    }

    async function ensureMedia(width, onRatio, cancelled) {
      if (state.native) return video.videoWidth > 0;
      const key = round2(state.start) + "|" + round2(state.end) + "|" + width;
      if (state.proxy && state.proxyKey === key && video.videoWidth > 0) return true;
      setStatus("선택한 구간을 변환 엔진으로 준비하는 중입니다.");
      const blob = await transcodeClip(state.file, state.start, state.end - state.start, width, onRatio);
      if (!blob || cancelled()) return false;
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = URL.createObjectURL(blob);
      await loadVideo(video, state.url);
      state.proxy = true;
      state.proxyKey = key;
      stage.classList.add("has-video");
      return video.videoWidth > 0;
    }

    async function startPlay() {
      stopPlay();
      if (!state.ready || state.converting) return;
      const gen = state.previewGen;
      state.playing = true;
      playBtn.textContent = "재생 멈춤";
      const ok = await ensureMedia(requestedWidth(), null, () => state.previewGen !== gen);
      if (!ok || state.previewGen !== gen) {
        if (state.previewGen === gen) stopPlay();
        return;
      }
      const speed = readSpeed(speedSelect);
      const loop = loopBox.checked;
      const reverse = reverseBox.checked;
      const origin = state.proxy ? 0 : state.start;
      const end = state.proxy ? (state.end - state.start) : state.end;
      if (!reverse) {
        video.playbackRate = speed;
        video.currentTime = origin;
        state.onTime = () => {
          const local = state.proxy ? video.currentTime : video.currentTime - state.start;
          showOverlay(local);
          if (video.currentTime >= end - 0.03) {
            if (loop) video.currentTime = origin;
            else stopPlay();
          }
        };
        video.addEventListener("timeupdate", state.onTime);
        video.onended = () => {
          if (!state.playing) return;
          if (loop) { video.currentTime = origin; video.play(); }
          else stopPlay();
        };
        try { await video.play(); } catch (err) { stopPlay(); }
      } else {
        let local = state.end - state.start;
        state.timer = setInterval(() => {
          local -= 0.08 * speed;
          if (local <= 0) {
            if (loop) local = state.end - state.start;
            else { stopPlay(); return; }
          }
          video.currentTime = origin + local;
          showOverlay(local);
        }, 80);
      }
    }

    async function loadFile(file) {
      clearVideo();
      state.file = file;
      syncEject();
      state.job += 1;
      const job = state.job;
      $("[data-role=drop-text]", root).textContent = "선택됨: " + file.name;
      markFormat(extOf(file));
      renderInfo();
      setStatus("영상 정보를 읽고 있습니다.");
      const url = URL.createObjectURL(file);
      state.url = url;
      let native = false;
      try {
        await loadVideo(video, url);
        const duration = await finiteDuration(video);
        if (state.job !== job) return;
        if (duration > 0 && video.videoWidth) {
          native = true;
          state.native = true;
          state.proxy = false;
          state.duration = duration;
          state.srcWidth = video.videoWidth;
          state.srcHeight = video.videoHeight;
          stage.classList.add("has-video");
        }
      } catch (err) { native = false; }
      if (state.job !== job) return;
      if (!native) {
        try { URL.revokeObjectURL(state.url); } catch (err) { /* 주소 정리 */ }
        state.url = "";
        video.removeAttribute("src");
        video.load();
        stage.classList.remove("has-video");
        if (file.size > ENGINE_LIMIT) {
          showUnsupported(file, "large");
          setStatus("이 형식은 표시된 변환 가능 형식으로 바꾼 뒤 다시 올려 주세요.", true);
          return;
        }
        setStatus("브라우저가 바로 열지 못하는 형식입니다. 변환 엔진으로 확인하는 중입니다.");
        try {
          const meta = await probeFile(file);
          if (state.job !== job) return;
          if (!meta) {
            showUnsupported(file, "fail");
            setStatus("변환할 수 있는 형식의 파일을 다시 선택해 주세요.", true);
            return;
          }
          state.native = false;
          state.duration = meta.duration;
          state.srcWidth = meta.width;
          state.srcHeight = meta.height;
          state.srcFps = meta.fps;
        } catch (err) {
          if (state.job !== job) return;
          showUnsupported(file, "fail");
          setStatus("변환 엔진을 쓰지 못했습니다. 아래 형식의 파일을 선택해 주세요.", true);
          return;
        }
      }
      bad.hidden = true;
      state.start = 0;
      state.end = Math.min(MAX_SPAN, state.duration);
      enableReady(true);
      renderInfo();
      renderTrim();
      setStatus("30FPS로 자를 준비가 되었습니다. 구간은 최대 20초입니다.");
    }

    function takeVideo(files) {
      if (!files.length) return;
      if (files.length > 1) {
        alert("동영상은 한 번에 한 파일만 선택할 수 있습니다.");
        return;
      }
      const file = files[0];
      if (!isVideoFile(file)) {
        alert("형식에 맞지 않은 파일입니다.");
        return;
      }
      if (file.size > MAX_BYTES) {
        alert("5GB를 넘는 파일은 올릴 수 없습니다.");
        setStatus("5GB를 넘는 파일은 올릴 수 없습니다.", true);
        return;
      }
      if (!file.size) {
        setStatus("빈 파일입니다.", true);
        return;
      }
      loadFile(file);
    }

    async function convert() {
      if (!state.ready || state.converting || !state.file) return;
      stopPlay();
      const job = ++state.job;
      state.converting = true;
      convertBtn.disabled = true;
      playBtn.disabled = true;
      convertBtn.textContent = "변환 중";
      setReady(downloadBtn, false);
      removeOutput(outputId);
      result.hidden = true;
      thumbs.innerHTML = "";
      setWave(bar, 0);
      stage.classList.add("is-converting");
      const cancelled = () => state.job !== job;
      try {
        const span = state.end - state.start;
        const speed = readSpeed(speedSelect);
        const frameCount = Math.max(1, Math.round((span / speed) * FPS));
        const size = outputSize(state.srcWidth, state.srcHeight, frameCount, requestedWidth(), readRatio(root));
        const prep = state.native ? null : (ratio) => { if (!cancelled()) setWave(bar, 0.05 + ratio * 0.3); };
        setStatus((size.reduced ? "프레임이 많아 가로 " + size.width + "px로 맞춰 변환합니다. " : "") + "30FPS로 프레임을 자를 준비를 하고 있습니다.");
        const ok = await ensureMedia(size.width, prep, cancelled);
        if (!ok || cancelled()) return;
        const width = size.width;
        const height = size.height;
        video.muted = true;
        try { await video.play(); video.pause(); } catch (err) { /* 자동 재생이 막혀도 프레임 추출은 계속합니다. */ }
        const reverse = reverseBox.checked;
        const offset = state.proxy ? 0 : state.start;
        setStatus(`30FPS로 프레임을 자르는 중 · 0 / ${frameCount}`);
        const blob = await encodeGif({
          canvas, width, height, frameCount,
          delayMs: Math.round(1000 / FPS),
          loop: loopBox.checked,
          cancelled,
          async draw(ctx, i) {
            const localRaw = reverse ? span - (i / FPS) * speed : (i / FPS) * speed;
            const local = Math.min(Math.max(localRaw, 0), Math.max(span - 0.001, 0));
            await seekTo(video, offset + local);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            drawContain(ctx, video, width, height);
            drawSubtitles(ctx, state.cues, local, width, height, subScale());
          },
          onFrame(i, total, thumb) {
            if (cancelled()) return;
            const ratio = (i + 1) / total;
            setWave(bar, state.native ? ratio : 0.35 + ratio * 0.65);
            setStatus(`30FPS로 프레임을 자르는 중 · ${i + 1} / ${total}`);
            if (thumb && thumb.parentNode !== thumbs) thumbs.appendChild(thumb);
          },
        });
        if (!blob || cancelled()) return;
        const url = URL.createObjectURL(blob);
        const rec = {
          id: outputId, blob, url, name: baseName(state.file.name), ext: "gif",
          loops: loopBox.checked, duration: span / speed, kind: "동영상 GIF", checked: true,
        };
        upsertOutput(rec);
        result.hidden = false;
        resultImg.src = url;
        setWave(bar, 1);
        setReady(downloadBtn, true);
        setStatus("변환이 끝났습니다. 오른쪽 다운로드 버튼으로 받을 수 있습니다.");
      } catch (err) {
        console.error(err);
        if (!cancelled()) setStatus("변환 중 문제가 생겼습니다. 구간을 짧게 하거나 가로 크기를 줄여 다시 시도해 주세요.", true);
      } finally {
        state.converting = false;
        stage.classList.remove("is-converting");
        convertBtn.textContent = "30FPS GIF로 변환";
        enableReady(state.ready && !!state.file);
      }
    }

    $("[data-action=browse]", root).addEventListener("click", (event) => {
      event.stopPropagation();
      fileInput.click();
    });
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", () => {
      const files = [...fileInput.files];
      fileInput.value = "";
      takeVideo(files);
    });
    ["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add("is-over");
    }));
    ["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove("is-over");
    }));
    drop.addEventListener("drop", (event) => takeVideo([...event.dataTransfer.files]));

    trim.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest("[data-handle]");
      const range = event.target.closest("[data-role=range]");
      if ((!handle && !range) || !state.duration) return;
      event.preventDefault();
      stopPlay();
      const mode = handle ? handle.dataset.handle : "move";
      const origin = { start: state.start, end: state.end, ratio: pointRatio(trim, event) };
      function move(ev) {
        const ratio = pointRatio(trim, ev);
        const time = ratio * state.duration;
        if (mode === "in") setSelection(time, state.end, "in");
        else if (mode === "out") setSelection(state.start, time, "out");
        else {
          const span = origin.end - origin.start;
          const start = origin.start + (ratio - origin.ratio) * state.duration;
          setSelection(start, start + span, "move");
        }
      }
      function up() {
        trim.removeEventListener("pointermove", move);
        trim.removeEventListener("pointerup", up);
      }
      trim.addEventListener("pointermove", move);
      trim.addEventListener("pointerup", up);
    });
    [inInput, outInput].forEach((input) => input.addEventListener("change", () => {
      setSelection(Number(inInput.value) || 0, Number(outInput.value) || 0, "out");
    }));
    subRail.addEventListener("pointerdown", (event) => {
      const which = event.target.dataset ? event.target.dataset.sub : "";
      if (!which) return;
      const cue = state.cues.find((item) => item.id === state.cueId);
      if (!cue) return;
      event.preventDefault();
      function move(ev) {
        const span = Math.max(state.end - state.start, 0.001);
        let time = pointRatio(subRail, ev) * span;
        time = Math.max(0, Math.min(span, time));
        if (which === "in") cue.start = Math.min(time, cue.end - 0.1);
        else cue.end = Math.max(time, cue.start + 0.1);
        renderCues();
      }
      function up() {
        subRail.removeEventListener("pointermove", move);
        subRail.removeEventListener("pointerup", up);
      }
      subRail.addEventListener("pointermove", move);
      subRail.addEventListener("pointerup", up);
    });
    $("[data-action=add-sub]", root).addEventListener("click", () => {
      const span = state.end - state.start;
      if (!state.ready || span <= 0) {
        setStatus("영상을 올리고 구간을 정한 다음 자막을 넣을 수 있습니다.", true);
        return;
      }
      const text = $("[data-role=subtext]", root).value.trim() || "자막";
      state.cueSeq += 1;
      state.cues.push({ id: state.cueSeq, text, start: 0, end: Math.min(2, span) });
      state.cueId = state.cueSeq;
      $("[data-role=subtext]", root).value = "";
      renderCues();
    });
    bindRatios(root);
    subSize.addEventListener("input", applySubPreview);
    applySubPreview();
    widthRange.addEventListener("input", () => { widthNum.value = widthRange.value; updateEstimate(); });
    widthNum.addEventListener("change", () => {
      const value = snapWidth(widthNum.value);
      widthNum.value = value;
      widthRange.value = value;
      updateEstimate();
    });
    speedSelect.addEventListener("change", () => {
      updateEstimate();
      if (state.playing && !reverseBox.checked) video.playbackRate = readSpeed(speedSelect);
    });
    reverseBox.addEventListener("change", () => { updateEstimate(); if (state.playing) stopPlay(); });
    loopBox.addEventListener("change", updateEstimate);
    $("[data-action=play]", root).addEventListener("click", () => {
      if (state.playing) stopPlay();
      else startPlay();
    });
    convertBtn.addEventListener("click", convert);
    downloadBtn.addEventListener("click", () => {
      const rec = outputs.find((item) => item.id === outputId);
      if (rec) openDownload([rec]);
    });
    root.querySelectorAll("[data-action=eject]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        clearVideo();
      });
    });
    $("[data-action=remove-lane]", root).addEventListener("click", () => {
      clearVideo();
      root.remove();
      refreshLaneUi();
    });
    renderInfo();
    renderTrim();
  }

  function pointRatio(node, event) {
    const rect = node.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  function createImageLane(index) {
    const tones = ["#e09a3e", "#d9782b", "#c9842a", "#b86b1d", "#e0a84a", "#c47b12"];
    const tone = tones[(index - 1) % tones.length];
    const outputId = "image-" + index;
    const root = el(`<article class="lane lane--image" data-output="${outputId}" style="--tone:${tone}">
      <div class="lane__head">
        <span class="lane__badge">작업 영역 ${index}</span>
        <h3>이미지 GIF</h3>
        <div class="lane__actions">
          <button type="button" class="btn btn--ghost btn--small" data-action="eject" hidden>사진 빼기</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="remove-lane">영역 지우기</button>
        </div>
      </div>
      <div class="drop" data-role="drop" tabindex="0">
        <strong>사진 여러 장을 끌어다 놓으세요</strong>
        <p>JPG, PNG, WEBP, BMP를 순서대로 GIF로 만듭니다.</p>
        <button type="button" class="btn" data-action="browse">이미지 파일 선택</button>
        <p>여러 장 가능 · 합계 최대 5GB</p>
        <input class="file-input" data-role="file" type="file" accept="${IMAGE_ACCEPT}" multiple>
      </div>
      <div class="info" data-role="info" hidden></div>
      <div class="image-list" data-role="list"></div>
      ${sizeFieldsHtml()}
      <div class="playback">
        <label class="field">배속
          <select data-role="speed">${speedOptions()}</select>
        </label>
        <label class="check"><input data-role="loop" type="checkbox" checked> 반복 재생</label>
      </div>
      <p class="estimate" data-role="estimate">배속 1배는 사진 한 장에 1초입니다.</p>
      <button type="button" class="btn btn--convert" data-action="convert" disabled>이미지 GIF 만들기</button>
      ${waveHtml()}
      <p class="status" data-role="status" aria-live="polite"></p>
      <div class="stage stage--live" data-role="stage"><canvas class="live-canvas" data-role="canvas"></canvas></div>
      <div class="live"><p>생성되는 GIF 프레임</p><div class="thumbs" data-role="thumbs"></div></div>
      <div class="result" data-role="result" hidden><p>완성된 GIF</p><img data-role="result-img" alt="완성된 GIF"></div>
    </article>`);
    $("#image-lanes").appendChild(root);

    const images = [];
    let seq = 0;
    let token = 0;
    let running = false;
    const fileInput = $("[data-role=file]", root);
    const list = $("[data-role=list]", root);
    const info = $("[data-role=info]", root);
    const estimate = $("[data-role=estimate]", root);
    const status = $("[data-role=status]", root);
    const canvas = $("[data-role=canvas]", root);
    const stage = $("[data-role=stage]", root);
    const thumbs = $("[data-role=thumbs]", root);
    const bar = $(".wave-bar", root);
    const downloadBtn = $("[data-action=download]", root);
    const convertBtn = $("[data-action=convert]", root);
    const widthRange = $("[data-role=width]", root);
    const widthNum = $("[data-role=width-num]", root);
    const speedSelect = $("[data-role=speed]", root);
    const loopBox = $("[data-role=loop]", root);
    const drop = $("[data-role=drop]", root);

    function setStatus(text, badState) {
      status.textContent = text || "";
      status.classList.toggle("is-bad", Boolean(badState));
    }
    function widthOf() { return snapWidth(widthNum.value || widthRange.value); }
    function syncEject() {
      const btn = $("[data-action=eject]", root);
      if (btn) btn.hidden = !images.length;
    }
    function updateEstimate() {
      const speed = readSpeed(speedSelect);
      estimate.textContent = images.length
        ? `사진 ${images.length}장 · ${speed}배 · 한 장 ${(1 / speed).toFixed(2)}초 · 합계 ${formatBytes(images.reduce((sum, item) => sum + item.file.size, 0))}`
        : "배속 1배는 사진 한 장에 1초입니다.";
    }
    function renderInfo() {
      info.hidden = !images.length;
      const total = images.reduce((sum, item) => sum + item.file.size, 0);
      info.innerHTML = [
        ["사진 수", images.length + "장"],
        ["합계 용량", formatBytes(total)],
        ["업로드 한도", "5GB"],
        ["변환 FPS 상한", "30 FPS"],
      ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    }
    function renderList() {
      list.innerHTML = "";
      images.forEach((item, index) => {
        const row = el(`<article class="image-item" draggable="true" data-id="${item.id}"></article>`);
        const ord = document.createElement("span");
        ord.className = "ord";
        ord.textContent = String(index + 1);
        const img = document.createElement("img");
        img.src = item.url;
        img.alt = "";
        const text = document.createElement("div");
        text.innerHTML = `<strong>${esc(item.file.name)}</strong><br>${item.width} × ${item.height} · ${formatBytes(item.file.size)}`;
        const actions = document.createElement("div");
        actions.className = "btn-row";
        [["위로", -1], ["아래로", 1]].forEach(([label, dir]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "btn btn--ghost btn--small";
          button.textContent = label;
          button.addEventListener("click", () => moveImage(item.id, dir));
          actions.appendChild(button);
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn--ghost btn--small";
        remove.textContent = "빼기";
        remove.addEventListener("click", () => {
          URL.revokeObjectURL(item.url);
          images.splice(images.findIndex((image) => image.id === item.id), 1);
          refresh();
        });
        actions.appendChild(remove);
        row.append(ord, img, text, actions);
        row.addEventListener("dragstart", () => row.classList.add("is-dragging"));
        row.addEventListener("dragover", (event) => {
          event.preventDefault();
          const dragging = $(".is-dragging", list);
          if (!dragging || dragging === row) return;
          const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
          list.insertBefore(dragging, after ? row.nextSibling : row);
        });
        row.addEventListener("dragend", () => {
          const ids = [...list.querySelectorAll(".image-item")].map((node) => node.dataset.id);
          images.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
          refresh();
        });
        list.appendChild(row);
      });
      convertBtn.disabled = running || !images.length;
      renderInfo();
      updateEstimate();
      syncEject();
    }
    function refresh() { renderList(); }
    function moveImage(id, dir) {
      const indexPos = images.findIndex((item) => item.id === id);
      const next = indexPos + dir;
      if (indexPos < 0 || next < 0 || next >= images.length) return;
      const [item] = images.splice(indexPos, 1);
      images.splice(next, 0, item);
      refresh();
    }
    function clearImages() {
      images.forEach((item) => URL.revokeObjectURL(item.url));
      images.length = 0;
      token += 1;
      running = false;
      removeOutput(outputId);
      thumbs.innerHTML = "";
      setWave(bar, 0);
      setReady(downloadBtn, false);
      setStatus("");
      stage.classList.remove("is-converting");
      refresh();
    }
    async function addImages(files) {
      if (!files.length) return;
      let mismatch = false;
      let tooBig = false;
      let total = images.reduce((sum, item) => sum + item.file.size, 0);
      for (const file of files) {
        if (!isRaster(file)) { mismatch = true; continue; }
        if (file.size > MAX_BYTES || total + file.size > MAX_BYTES) { tooBig = true; continue; }
        try {
          const bmp = await createImageBitmap(file);
          images.push({ id: "img-" + index + "-" + (++seq), file, width: bmp.width, height: bmp.height, url: URL.createObjectURL(file) });
          bmp.close();
          total += file.size;
        } catch (err) {
          setStatus(file.name + " 이미지는 이 브라우저에서 열 수 없습니다.", true);
        }
      }
      if (mismatch) alert("형식에 맞지 않은 파일입니다.");
      if (tooBig) {
        alert("5GB를 넘는 파일은 올릴 수 없습니다.");
        setStatus("이미지 합계는 5GB까지입니다.", true);
      }
      refresh();
    }
    async function convert() {
      if (!images.length || running) return;
      const job = ++token;
      running = true;
      convertBtn.disabled = true;
      setReady(downloadBtn, false);
      removeOutput(outputId);
      thumbs.innerHTML = "";
      setWave(bar, 0);
      stage.classList.add("is-converting");
      try {
        const first = images[0];
        const size = outputSize(first.width, first.height, images.length, widthOf(), readRatio(root));
        const speed = readSpeed(speedSelect);
        const delay = Math.max(34, Math.round(1000 / speed));
        setStatus("사진 순서대로 GIF 프레임을 만드는 중입니다.");
        const blob = await encodeGif({
          canvas, width: size.width, height: size.height, frameCount: images.length, delayMs: delay,
          loop: loopBox.checked,
          cancelled: () => token !== job,
          async draw(ctx, i) {
            const bmp = await createImageBitmap(images[i].file);
            drawContain(ctx, bmp, size.width, size.height);
            bmp.close();
          },
          onFrame(i, total, thumb) {
            setWave(bar, (i + 1) / total);
            setStatus(`프레임 ${i + 1} / ${total}`);
            if (thumb) thumbs.appendChild(thumb);
          },
        });
        if (!blob || token !== job) return;
        const url = URL.createObjectURL(blob);
        upsertOutput({
          id: outputId, blob, url, name: baseName(first.file.name), ext: "gif",
          loops: loopBox.checked, duration: images.length / speed, kind: "이미지 GIF", checked: true,
        });
        $("[data-role=result]", root).hidden = false;
        $("[data-role=result-img]", root).src = url;
        setWave(bar, 1);
        setReady(downloadBtn, true);
        setStatus("이미지 GIF가 완성되었습니다.");
      } catch (err) {
        console.error(err);
        setStatus("이미지 GIF를 만들지 못했습니다.", true);
      } finally {
        running = false;
        stage.classList.remove("is-converting");
        convertBtn.disabled = !images.length;
      }
    }

    $("[data-action=browse]", root).addEventListener("click", (event) => { event.stopPropagation(); fileInput.click(); });
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("keydown", (event) => { if (event.key === "Enter") fileInput.click(); });
    fileInput.addEventListener("change", () => { const files = [...fileInput.files]; fileInput.value = ""; addImages(files); });
    ["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", (event) => addImages([...event.dataTransfer.files]));
    bindRatios(root);
    widthRange.addEventListener("input", () => { widthNum.value = widthRange.value; });
    widthNum.addEventListener("change", () => { const value = snapWidth(widthNum.value); widthNum.value = value; widthRange.value = value; });
    speedSelect.addEventListener("change", updateEstimate);
    convertBtn.addEventListener("click", convert);
    downloadBtn.addEventListener("click", () => {
      const rec = outputs.find((item) => item.id === outputId);
      if (rec) openDownload([rec]);
    });
    $("[data-action=eject]", root).addEventListener("click", (event) => {
      event.stopPropagation();
      clearImages();
    });
    $("[data-action=remove-lane]", root).addEventListener("click", () => {
      clearImages();
      root.remove();
      refreshImageUi();
    });
    renderInfo();
  }

  function createGifLane(index) {
    const tones = ["#1d4e89", "#245a9a", "#163e78", "#2a6494", "#1a4f86", "#0e3f72"];
    const tone = tones[(index - 1) % tones.length];
    const root = el(`<article class="lane lane--gif" style="--tone:${tone}">
      <div class="lane__head">
        <span class="lane__badge">작업 영역 ${index}</span>
        <h3>GIF 동영상</h3>
        <div class="lane__actions">
          <button type="button" class="btn btn--ghost btn--small" data-action="eject" hidden>GIF 빼기</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="remove-lane">영역 지우기</button>
        </div>
      </div>
      <div class="drop" data-role="drop" tabindex="0">
        <strong>GIF 파일을 끌어다 놓으세요</strong>
        <p>이 영역은 GIF만 받아서 동영상으로 바꿉니다.</p>
        <button type="button" class="btn" data-action="browse">GIF 파일 선택</button>
        <p>여러 개 가능 · 파일당 최대 5GB</p>
        <input class="file-input" data-role="file" type="file" accept=".gif,image/gif" multiple>
      </div>
      <div data-role="cards"></div>
    </article>`);
    $("#gif-lanes").appendChild(root);
    const cards = $("[data-role=cards]", root);
    const fileInput = $("[data-role=file]", root);
    const drop = $("[data-role=drop]", root);
    let seq = 0;

    function syncEject() {
      const btn = $("[data-action=eject]", root);
      if (btn) btn.hidden = !cards.children.length;
    }

    function addCard(file, info) {
      const id = "gifvid-" + index + "-" + (++seq);
      const card = el(`<article class="gif-card" data-output="${id}" style="--tone:${tone}">
        <div class="gif-card__head">
          <h3>${esc(file.name)}</h3>
          <button type="button" class="btn btn--ghost btn--small" data-action="remove">GIF 빼기</button>
        </div>
        <img alt="올린 GIF 미리보기">
        <div class="info"></div>
        ${sizeFieldsHtml()}
        <canvas data-role="canvas"></canvas>
        <button type="button" class="btn btn--convert" data-action="convert">동영상으로 변환</button>
        ${waveHtml()}
        <p class="status" data-role="status" aria-live="polite"></p>
      </article>`);
      const preview = $("img", card);
      const url = URL.createObjectURL(file);
      preview.src = url;
      const rows = [
        ["파일 이름", file.name],
        ["형식", "GIF"],
        ["용량", formatBytes(file.size)],
        ["해상도", info.width ? info.width + " × " + info.height : "-"],
        ["프레임", info.partial ? "파일이 커서 일부만 표시" : (info.frames ? info.frames + "장" : "-")],
        ["길이", info.duration ? info.duration.toFixed(2) + "초" : "-"],
      ];
      $(".info", card).innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
      const widthRange = $("[data-role=width]", card);
      const widthNum = $("[data-role=width-num]", card);
      const startWidth = snapWidth(info.width || 480);
      widthRange.value = startWidth;
      widthNum.value = startWidth;
      const bar = $(".wave-bar", card);
      const downloadBtn = $("[data-action=download]", card);
      const convertBtn = $("[data-action=convert]", card);
      const status = $("[data-role=status]", card);
      let busy = false;
      bindRatios(card);
      widthRange.addEventListener("input", () => { widthNum.value = widthRange.value; });
      widthNum.addEventListener("change", () => {
        const value = snapWidth(widthNum.value);
        widthNum.value = value;
        widthRange.value = value;
      });
      convertBtn.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        convertBtn.disabled = true;
        setReady(downloadBtn, false);
        setWave(bar, 0);
        status.classList.remove("is-bad");
        status.textContent = "GIF를 동영상으로 바꾸는 중입니다.";
        card.classList.add("is-converting");
        try {
          const width = snapWidth(widthNum.value || widthRange.value);
          const canvas = $("[data-role=canvas]", card);
          const made = await gifToVideo(file, width, readRatio(card), canvas, (ratio) => {
            setWave(bar, ratio);
            status.textContent = "GIF를 동영상으로 바꾸는 중 · " + Math.round(ratio * 100) + "%";
          });
          const outUrl = URL.createObjectURL(made.blob);
          upsertOutput({
            id, blob: made.blob, url: outUrl, name: baseName(file.name), ext: made.ext,
            loops: true, duration: info.duration || 0, kind: "GIF 동영상", checked: true,
          });
          setWave(bar, 1);
          setReady(downloadBtn, true);
          status.textContent = "동영상이 완성되었습니다. 오른쪽 다운로드 버튼을 누르세요.";
        } catch (err) {
          console.error(err);
          status.textContent = err && err.message === "timeout"
            ? "변환 시간이 너무 길어 멈추었습니다. 가로 크기를 줄이거나 더 짧은 GIF로 다시 시도해 주세요."
            : "이 GIF는 동영상으로 바꾸지 못했습니다. 다른 GIF로 다시 시도해 주세요.";
          status.classList.add("is-bad");
        } finally {
          busy = false;
          convertBtn.disabled = false;
          card.classList.remove("is-converting");
        }
      });
      downloadBtn.addEventListener("click", () => {
        const rec = outputs.find((item) => item.id === id);
        if (rec) openDownload([rec]);
      });
      $("[data-action=remove]", card).addEventListener("click", () => {
        URL.revokeObjectURL(url);
        removeOutput(id);
        card.remove();
        syncEject();
      });
      cards.appendChild(card);
      syncEject();
    }

    async function addFiles(files) {
      if (!files.length) return;
      let mismatch = false;
      let tooBig = false;
      for (const file of files) {
        if (file.size > MAX_BYTES) { tooBig = true; continue; }
        if (!isGifFile(file)) { mismatch = true; continue; }
        const info = await inspectGif(file);
        if (!info) { mismatch = true; continue; }
        addCard(file, info);
      }
      if (mismatch) alert("형식에 맞지 않은 파일입니다.");
      if (tooBig) alert("5GB를 넘는 파일은 올릴 수 없습니다.");
    }

    function clearCards() {
      [...cards.querySelectorAll("[data-action=remove]")].forEach((btn) => btn.click());
    }

    $("[data-action=browse]", root).addEventListener("click", (event) => { event.stopPropagation(); fileInput.click(); });
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("keydown", (event) => { if (event.key === "Enter") fileInput.click(); });
    fileInput.addEventListener("change", () => { const files = [...fileInput.files]; fileInput.value = ""; addFiles(files); });
    ["dragenter", "dragover"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", (event) => addFiles([...event.dataTransfer.files]));
    $("[data-action=eject]", root).addEventListener("click", (event) => {
      event.stopPropagation();
      clearCards();
    });
    $("[data-action=remove-lane]", root).addEventListener("click", () => {
      clearCards();
      root.remove();
      refreshGifUi();
    });
  }

  let nextLaneId = 0;
  let nextImageId = 0;
  let nextGifId = 0;

  function refreshAreaUi(listSel, buttonSel) {
    const nodes = [...document.querySelectorAll(listSel)];
    nodes.forEach((node, index) => {
      const badge = node.querySelector(".lane__badge");
      if (badge) badge.textContent = "작업 영역 " + (index + 1);
    });
    const button = $(buttonSel);
    if (!button) return;
    const full = nodes.length >= MAX_LANES;
    button.disabled = full;
    button.textContent = full ? "작업 영역은 6개까지입니다" : "작업 영역 추가";
  }

  function refreshLaneUi() { refreshAreaUi("#lanes > .lane", "#add-lane"); }
  function refreshImageUi() { refreshAreaUi("#image-lanes > .lane", "#add-image-lane"); }
  function refreshGifUi() { refreshAreaUi("#gif-lanes > .lane", "#add-gif-lane"); }

  function addLane() {
    if (document.querySelectorAll("#lanes > .lane").length >= MAX_LANES) return;
    nextLaneId += 1;
    createLane(nextLaneId);
    refreshLaneUi();
  }

  function addImageLane() {
    if (document.querySelectorAll("#image-lanes > .lane").length >= MAX_LANES) return;
    nextImageId += 1;
    createImageLane(nextImageId);
    refreshImageUi();
  }

  function addGifLane() {
    if (document.querySelectorAll("#gif-lanes > .lane").length >= MAX_LANES) return;
    nextGifId += 1;
    createGifLane(nextGifId);
    refreshGifUi();
  }

  function init() {
    $("#format-row").innerHTML = formatIconsHtml();
    for (let i = 0; i < 3; i += 1) addLane();
    $("#add-lane").addEventListener("click", addLane);
    addImageLane();
    $("#add-image-lane").addEventListener("click", addImageLane);
    addGifLane();
    $("#add-gif-lane").addEventListener("click", addGifLane);
    renderDock();
    $("#check-all").addEventListener("change", (event) => {
      outputs.forEach((item) => { item.checked = event.target.checked; });
      renderDock();
    });
    $("#download-selected").addEventListener("click", () => {
      const picked = outputs.filter((item) => item.checked);
      if (!picked.length) {
        const list = $("#dock-list");
        let note = $("#dock-note");
        if (!note) {
          note = document.createElement("p");
          note.id = "dock-note";
          note.className = "dock__empty";
          list.prepend(note);
        }
        note.textContent = "다운로드할 파일을 선택해 주세요.";
        return;
      }
      openDownload(picked);
    });
    $("#download-all").addEventListener("click", () => {
      if (!outputs.length) return;
      openDownload(outputs.slice());
    });
    $("#remove-selected").addEventListener("click", () => {
      const picked = outputs.filter((item) => item.checked);
      if (!picked.length) {
        const list = $("#dock-list");
        let note = $("#dock-note");
        if (!note) {
          note = document.createElement("p");
          note.id = "dock-note";
          note.className = "dock__empty";
          list.prepend(note);
        }
        note.textContent = "뺄 파일을 선택해 주세요.";
        return;
      }
      removeOutputs(picked.map((item) => item.id));
    });
    $("#modal-yes").addEventListener("click", () => { confirmDownload().catch((err) => console.error(err)); });
    $("#modal-no").addEventListener("click", closeModal);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#download-modal").hidden) closeModal(); });
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("drop", (event) => event.preventDefault());
    if (!window.exports || typeof exports.GIFEncoder !== "function") {
      document.body.insertAdjacentHTML("afterbegin", '<p class="status is-bad">GIF 인코더를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>');
    }
  }

  init();
})();
