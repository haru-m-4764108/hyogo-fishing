/* 仕掛けガイド と 釣りメモリー（写真はこのブラウザの IndexedDB に保存） */
"use strict";
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const D = () => window.APP_DATA || { catches: [], spots: [] };
  const RIGS = window.RIGS, FISH = window.FISH;
  const rigById = id => RIGS.find(r => r.id === id);
  const fishByName = n => FISH.find(f => f.name === n);
  const spotName = id => (D().spots.find(s => s.id === id) || {}).name || (id === "other" ? "その他" : "");
  const WD = "日月火水木金土";
  const stars = n => "★".repeat(n) + "☆".repeat(3 - n);
  const levelLabel = ["", "初心者向け", "慣れてきたら", "上級"];

  // ================================================================ 釣果からの魚カウント
  function fishInCatch(c) {
    const text = [c.title, c.text, ...(c.fish || []).map(f => f.fish)].join(" ").replace(/アジュール/g, "");
    return FISH.filter(f => f.alias.some(a => text.includes(a))).map(f => f.name);
  }
  function recentFish(days = 7, spot = null) {
    const now = Date.now(), cnt = {};
    for (const c of D().catches) {
      if (spot && c.spot !== spot) continue;
      const t = new Date(c.date.length <= 10 ? c.date + "T00:00:00+09:00" : c.date).getTime();
      if ((now - t) / 864e5 > days) continue;
      for (const n of fishInCatch(c)) cnt[n] = (cnt[n] || 0) + 1;
    }
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  }
  const rigsForFish = name => RIGS.filter(r => r.fish.includes(name));
  const thisMonth = () => new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 6e4).getMonth() + 1;

  // ================================================================ 動画（クリックで読み込む軽量埋め込み）
  const video = v => `<div class="yt" data-yt="${esc(v.id)}" role="button" aria-label="${esc(v.title)} を再生">
      <img loading="lazy" src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="">
      <span class="play">▶</span></div>
    <div class="sub" style="margin:4px 0 12px"><b style="color:var(--text)">${esc(v.title)}</b><br>${esc(v.ch)} ・ <a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">YouTubeで開く</a></div>`;

  // ================================================================ 仕掛けガイド
  function viewRigs() {
    const rf = recentFish(7).slice(0, 10);
    const m = thisMonth();
    const season = FISH.filter(f => f.months.includes(m) && rigsForFish(f.name).length);
    const chip = (n, extra = "") => `<a class="chip big" href="#/fish/${encodeURIComponent(n)}">${esc(n)}${extra}</a>`;
    return `<h2>🔥 今週の釣果に出ている魚</h2>
      <div class="sub" style="margin-bottom:6px">直近7日の釣果記事から集計。タップで合う仕掛けへ</div>
      <div>${rf.length ? rf.map(([n, c]) => chip(n, ` <b>${c}</b>`)).join("") : `<span class="sub">データなし</span>`}</div>
      <h2>📅 ${m}月に釣れる魚（兵庫南部）</h2>
      <div>${season.map(f => chip(f.name)).join("")}</div>
      <h2>🎣 仕掛けの種類</h2>
      ${RIGS.map(r => `<a class="card link" href="#/rig/${r.id}">
        <div class="row"><span style="font-size:26px">${r.icon}</span>
          <div class="grow"><div class="row"><span class="title grow">${esc(r.name)}</span><span class="sub" title="${levelLabel[r.level]}">${stars(r.level)}</span></div>
          <div class="sub">${esc(r.summary)}</div>
          <div>${r.fish.slice(0, 6).map(f => `<span class="chip">${esc(f)}</span>`).join("")}</div></div></div></a>`).join("")}`;
  }

  function viewRig(id) {
    const r = rigById(id);
    if (!r) return `<div class="empty">仕掛けが見つかりません</div>`;
    const rf = Object.fromEntries(recentFish(7));
    return `<a class="back" href="#/rigs">‹ 仕掛け一覧</a>
      <h2 style="margin-top:0">${r.icon} ${esc(r.name)}</h2>
      <div class="sub">${stars(r.level)} ${levelLabel[r.level]}</div>
      <div class="card" style="margin-top:8px">${esc(r.summary)}</div>
      <h2>🐟 狙える魚</h2>
      <div>${r.fish.map(f => `<a class="chip big" href="#/fish/${encodeURIComponent(f)}">${esc(f)}${rf[f] ? ` <b title="今週の釣果数">🔥${rf[f]}</b>` : ""}</a>`).join("")}</div>
      <h2>🧰 道具・仕掛け</h2>
      <div class="card"><ul class="list">${r.tackle.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>
      <h2>💡 コツ</h2>
      <div class="card"><ol class="list">${r.tips.map(t => `<li>${t.replace(/<(?!\/?b>)/g, "&lt;")}</li>`).join("")}</ol></div>
      <h2>📍 兵庫南部のおすすめ</h2>
      <div class="card">${esc(r.places)}</div>
      <h2>▶ 解説動画</h2>
      ${r.videos.map(video).join("")}
      <a class="card link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(r.search)}&sp=CAI%253D" target="_blank" rel="noopener">🔎 YouTubeで「${esc(r.search)}」の新着動画を探す ›</a>`;
  }

  async function viewFish(name) {
    name = decodeURIComponent(name || "");
    const f = fishByName(name);
    if (!f) return `<div class="empty">魚が見つかりません</div>`;
    const m = thisMonth();
    const months = Array.from({ length: 12 }, (_, i) => i + 1)
      .map(i => `<span class="mon ${f.months.includes(i) ? "on" : ""} ${i === m ? "now" : ""}">${i}</span>`).join("");
    const rigs = rigsForFish(name);
    const cs = D().catches.filter(c => fishInCatch(c).includes(name)).slice(0, 8);
    const mems = (await MemDB.all()).filter(x => x.fish === name);
    return `<a class="back" href="#/rigs">‹ 仕掛けガイド</a>
      <h2 style="margin-top:0">${esc(name)}</h2>
      ${f.alias.length > 1 ? `<div class="sub">別名・関連: ${esc(f.alias.join("・"))}</div>` : ""}
      <h2>📅 釣れる時期（兵庫南部の目安）</h2>
      <div class="months">${months}</div>
      <h2>🎣 合う仕掛け</h2>
      ${rigs.length ? rigs.map(r => `<a class="card link" href="#/rig/${r.id}"><div class="row"><span style="font-size:22px">${r.icon}</span><div class="grow"><div class="title">${esc(r.name)}</div><div class="sub">${stars(r.level)} ${levelLabel[r.level]}</div></div><span class="sub">›</span></div></a>`).join("") : `<div class="empty">登録なし</div>`}
      <h2>🐟 最近の釣果</h2>
      ${cs.length ? cs.map(c => `<a class="card link" href="${esc(window.safeUrl(c.url))}" target="_blank" rel="noopener"><div class="sub">${esc(c.source)} ・ ${esc(spotName(c.spot))}</div><div class="title">${esc(c.title)}</div></a>`).join("") : `<div class="empty">最近の記事なし</div>`}
      ${mems.length ? `<h2>📸 自分の記録</h2>${await galleryGrid(mems)}` : ""}`;
  }

  // ================================================================ 潮名（collect.py と同じ計算）
  function newMoonJD(k) {
    const T = k / 1236.85, E = 1 - 0.002516 * T - 0.0000074 * T * T, r = Math.PI / 180, s = Math.sin;
    const M = (2.5534 + 29.10535670 * k - 0.0000014 * T * T) * r;
    const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T) * r;
    const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * r;
    const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * r;
    const c = -0.40720 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F) + 0.00739 * E * s(Mp - M)
      - 0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
      + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
      - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om);
    return 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T + c;
  }
  const TIDE_NAMES = [..."大大大中中中小小小", "長", "若", ..."中中大大大大中中中小小小", "長", "若", ..."中中中大大"].map(x => x + "潮");
  function tideName(dateStr) {
    const jd = Date.parse(dateStr + "T12:00:00+09:00") / 864e5 + 2440587.5;
    let k = Math.floor((jd - 2451550.09766) / 29.530588861) + 1;
    while (newMoonJD(k) > jd) k--;
    return TIDE_NAMES[Math.floor(jd - newMoonJD(k)) % 30];
  }

  // ================================================================ IndexedDB
  const MemDB = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const rq = indexedDB.open("hyogo-fishing", 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains("memories")) db.createObjectStore("memories", { keyPath: "id" });
        if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "key" });
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => { dbp = null; rej(rq.error); };
    }));
    const tx = async (stores, mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(stores, mode);
        let out;
        Promise.resolve(fn(...stores.map(s => t.objectStore(s)), v => (out = v))).catch(rej);
        t.oncomplete = () => res(out);
        t.onerror = t.onabort = () => rej(t.error);
      });
    };
    const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    let cache = null;
    return {
      async all() {
        if (cache) return cache;
        try {
          cache = await tx(["memories"], "readonly", (s, set) => req(s.getAll()).then(set));
        } catch (e) { console.warn(e); cache = []; }
        cache.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.created - a.created);
        return cache;
      },
      async get(id) { return (await this.all()).find(m => m.id === id); },
      async photo(key) { return tx(["photos"], "readonly", (s, set) => req(s.get(key)).then(set)); },
      async save(mem, newPhotos = []) {
        cache = null;
        return tx(["memories", "photos"], "readwrite", (ms, ps) => {
          for (const p of newPhotos) ps.put(p);
          ms.put(mem);
        });
      },
      async remove(id) {
        const m = await this.get(id); cache = null;
        return tx(["memories", "photos"], "readwrite", (ms, ps) => {
          ms.delete(id);
          for (const k of (m?.photos || [])) ps.delete(k);
        });
      },
      async removePhotos(keys) { cache = null; return tx(["photos"], "readwrite", ps => keys.forEach(k => ps.delete(k))); },
      clearCache() { cache = null; },
    };
  })();

  // サムネイルの object URL 管理
  let urls = [];
  const revokeAll = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };
  const blobUrl = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  async function fillThumbs(root = document) {
    for (const img of root.querySelectorAll("img[data-photo]")) {
      const p = await MemDB.photo(img.dataset.photo).catch(() => null);
      if (p) img.src = blobUrl(img.dataset.size === "full" ? p.full : p.thumb);
    }
  }

  // ================================================================ 写真処理: EXIF・縮小
  function readExif(buf) {
    const v = new DataView(buf), out = {};
    if (v.getUint16(0) !== 0xFFD8) return out;
    let p = 2;
    while (p + 4 < v.byteLength) {
      const mk = v.getUint16(p), len = v.getUint16(p + 2);
      if (mk === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) {
        const t = p + 10, le = v.getUint16(t) === 0x4949;
        const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
        const ifd = (off, cb) => { const n = u16(off); for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; cb(u16(e), e); } };
        const ascii = (e) => { const n = u32(e + 4), o = n > 4 ? u32(e + 8) : e + 8; let s = ""; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(t + o + i)); return s; };
        const rats = (e) => { const o = u32(e + 8), r = []; for (let i = 0; i < 3; i++) r.push(u32(o + i * 8) / (u32(o + i * 8 + 4) || 1)); return r; };
        let exifOff = 0, gpsOff = 0;
        ifd(u32(4), (tag, e) => { if (tag === 0x8769) exifOff = u32(e + 8); if (tag === 0x8825) gpsOff = u32(e + 8); if (tag === 0x0132) out.dt = out.dt || ascii(e); });
        if (exifOff) ifd(exifOff, (tag, e) => { if (tag === 0x9003) out.dt = ascii(e); });
        if (gpsOff) {
          const g = {};
          ifd(gpsOff, (tag, e) => { if (tag === 1 || tag === 3) g[tag] = String.fromCharCode(v.getUint8(t + e + 8)); if (tag === 2 || tag === 4) g[tag] = rats(e); });
          if (g[2] && g[4]) {
            const dms = a => a[0] + a[1] / 60 + a[2] / 3600;
            out.lat = dms(g[2]) * (g[1] === "S" ? -1 : 1); out.lon = dms(g[4]) * (g[3] === "W" ? -1 : 1);
          }
        }
        return out;
      }
      if ((mk & 0xFF00) !== 0xFF00) break;
      p += 2 + len;
    }
    return out;
  }
  function loadImage(file) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(u); res(img); };
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("画像を読み込めませんでした（HEICの場合はJPEGで選んでください）")); };
      img.src = u;
    });
  }
  function resize(img, max, q) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(res, "image/jpeg", q));
  }
  async function processFile(file) {
    let exif = {};
    try { exif = readExif(await file.slice(0, 256 * 1024).arrayBuffer()); } catch (e) { console.warn(e); }
    const img = await loadImage(file);
    const [full, thumb] = await Promise.all([resize(img, 1600, 0.82), resize(img, 420, 0.75)]);
    return { full, thumb, exif, lastModified: file.lastModified };
  }
  function nearestSpot(lat, lon) {
    let best = null, bd = 1e9;
    for (const s of D().spots) {
      const d = Math.hypot((s.lat - lat) * 111, (s.lon - lon) * 91);
      if (d < bd) { bd = d; best = s; }
    }
    return bd <= 8 ? best.id : null;
  }

  // ================================================================ 釣りメモリー: 画面
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const todayJST = () => new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 6e4);
  const pad = n => String(n).padStart(2, "0");
  const fmtD = s => { const d = new Date(s + "T00:00:00+09:00"); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };

  async function galleryGrid(list) {
    return `<div class="gal">${list.map(m => `<a href="#/mem/${esc(m.id)}" class="gi">
        ${m.photos?.[0] ? `<img data-photo="${esc(m.photos[0])}" alt="">` : `<span class="noimg">🐟</span>`}
        <span class="cap">${esc(m.fish || "")}${m.size ? " " + esc(m.size) + "cm" : ""}</span>
        ${m.photos?.length > 1 ? `<span class="cnt">${m.photos.length}</span>` : ""}</a>`).join("")}</div>`;
  }

  async function viewMemory() {
    const all = await MemDB.all();
    const fFish = sessionStorage.getItem("mfish") || "all", fSpot = sessionStorage.getItem("mspot") || "all";
    const list = all.filter(m => (fFish === "all" || m.fish === fFish) && (fSpot === "all" || m.spot === fSpot));
    const fishes = [...new Set(all.map(m => m.fish).filter(Boolean))];
    const spots = [...new Set(all.map(m => m.spot).filter(Boolean))];
    const total = all.reduce((a, m) => a + (Number(m.count) || 1), 0);
    const biggest = all.filter(m => Number(m.size) > 0).sort((a, b) => b.size - a.size)[0];
    const chip = (k, v, l, cur) => `<button data-mfilter="${k}" data-v="${esc(v)}" class="${cur === v ? "on" : ""}">${esc(l)}</button>`;
    return `<div class="row"><h2 class="grow" style="margin:4px 0">📸 釣りメモリー</h2><a class="btn" href="#/memnew">＋ 記録する</a></div>
      ${all.length ? `<div class="stats card"><div><b>${all.length}</b><span>記録</span></div><div><b>${total}</b><span>匹</span></div><div><b>${fishes.length}</b><span>魚種</span></div>
        <div><b>${biggest ? esc(biggest.size) + "cm" : "-"}</b><span>${biggest ? esc(biggest.fish) : "最大"}</span></div></div>` : ""}
      ${fishes.length > 1 ? `<div class="chips">${chip("mfish", "all", "全魚種", fFish)}${fishes.map(f => chip("mfish", f, f, fFish)).join("")}</div>` : ""}
      ${spots.length > 1 ? `<div class="chips">${chip("mspot", "all", "全釣り場", fSpot)}${spots.map(s => chip("mspot", s, spotName(s) || s, fSpot)).join("")}</div>` : ""}
      ${list.length ? await galleryGrid(list) : `<div class="card empty">まだ記録がありません。<br>「＋ 記録する」から釣った魚の写真を保存しましょう。</div>`}
      <details class="card" style="margin-top:16px"><summary class="title">💾 バックアップ・保存について</summary>
        <p class="sub">写真と記録は<b>このスマホのこのブラウザの中だけ</b>に保存されます（外部には送信されません）。機種変更やブラウザのデータ削除で消えるので、ときどき書き出してください。</p>
        <p class="sub">iPhoneは必ず「ホーム画面に追加」したアプリから使ってください（Safariのままだと、しばらく開かないとデータが消されることがあります）。</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="export">⬇ zipで書き出す</button>
          <label class="btn ghost">⬆ zipから復元<input type="file" accept=".zip,application/zip" id="importZip" hidden></label></div>
        <div class="sub" id="storageInfo" style="margin-top:8px"></div>
      </details>`;
  }

  async function viewMem(id) {
    const m = await MemDB.get(id);
    if (!m) return `<div class="empty">記録が見つかりません <a href="#/memory">戻る</a></div>`;
    const rig = rigById(m.rig);
    return `<a class="back" href="#/memory">‹ 釣りメモリー</a>
      <div class="photos">${(m.photos || []).map(k => `<img data-photo="${esc(k)}" data-size="full" alt="">`).join("") || `<div class="empty">写真なし</div>`}</div>
      ${m.photos?.length > 1 ? `<div class="sub" style="text-align:center">← スワイプ（${m.photos.length}枚）→</div>` : ""}
      <h2 style="margin-top:10px">${esc(m.fish || "（魚種未入力）")}${m.size ? ` <span class="sub">${esc(m.size)}cm</span>` : ""}${m.count > 1 ? ` <span class="sub">×${esc(m.count)}</span>` : ""}</h2>
      <div class="card"><table class="kv">
        <tr><th>日時</th><td>${fmtD(m.date)} ${esc(m.time || "")}</td></tr>
        <tr><th>潮</th><td>${esc(m.tide || tideName(m.date))}</td></tr>
        <tr><th>釣り場</th><td>${m.spot && m.spot !== "other" ? `<a href="#/spot/${esc(m.spot)}">${esc(spotName(m.spot))}</a>` : esc(m.place || "その他")}${m.place && m.spot !== "other" ? `（${esc(m.place)}）` : ""}</td></tr>
        <tr><th>仕掛け</th><td>${rig ? `<a href="#/rig/${rig.id}">${rig.icon} ${esc(rig.name)}</a>` : esc(m.rigText || "-")}</td></tr>
        ${m.bait ? `<tr><th>エサ等</th><td>${esc(m.bait)}</td></tr>` : ""}
      </table>${m.memo ? `<div style="margin-top:8px;white-space:pre-wrap">${esc(m.memo)}</div>` : ""}</div>
      <div class="row" style="gap:8px"><a class="btn" href="#/memedit/${esc(m.id)}">✏ 編集</a><button class="btn ghost danger" data-act="delmem" data-id="${esc(m.id)}">🗑 削除</button></div>`;
  }

  // ---- 入力フォーム
  let draft = null; // {id, photos:[{key, full, thumb, url}], removed:[], ...fields}
  async function viewMemEdit(id) {
    const reuse = draft && (id ? !draft.isNew && draft.id === id : draft.isNew);
    if (!reuse) {
      if (id) {
        const m = await MemDB.get(id);
        if (!m) return `<div class="empty">記録が見つかりません</div>`;
        draft = { ...m, photos: (m.photos || []).map(key => ({ key, stored: true })), removed: [] };
      } else {
        const t = todayJST();
        draft = { id: newId(), isNew: true, photos: [], removed: [], date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
          time: `${pad(t.getHours())}:${pad(t.getMinutes())}`, spot: sessionStorage.getItem("lastSpot") || "", fish: "", size: "", count: 1, rig: "", bait: "", memo: "", place: "" };
      }
    }
    const d = draft;
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
    const spotsByArea = [...new Set(D().spots.map(s => s.area))].map(a => `<optgroup label="${esc(a)}">${D().spots.filter(s => s.area === a).map(s => opt(s.id, s.name, d.spot)).join("")}</optgroup>`).join("");
    const rigOpts = RIGS.map(r => opt(r.id, r.icon + " " + r.name, d.rig)).join("");
    return `<a class="back" href="${d.isNew ? "#/memory" : "#/mem/" + d.id}">‹ キャンセル</a>
      <h2 style="margin-top:0">${d.isNew ? "＋ 釣果を記録" : "✏ 記録を編集"}</h2>
      <div class="ptiles" id="ptiles">${d.photos.map((p, i) => `<div class="pt"><img ${p.stored ? `data-photo="${esc(p.key)}"` : `src="${p.url}"`} alt=""><button data-act="rmphoto" data-i="${i}" aria-label="写真を外す">✕</button></div>`).join("")}
        ${d.photos.length < 6 ? `<label class="pt add"><span>📷<br>写真を追加</span><input type="file" accept="image/*" multiple id="photoIn" hidden></label>` : ""}</div>
      <div class="sub" id="exifNote">${esc(d.exifNote || "写真の撮影日時・位置情報があれば自動で入力します")}</div>
      <form id="memForm" class="form">
        <label>日付<input type="date" name="date" value="${esc(d.date)}" required></label>
        <label>時刻<input type="time" name="time" value="${esc(d.time)}"></label>
        <div class="sub full" id="tideNote">潮: <b>${esc(tideName(d.date))}</b>（月齢からの目安）</div>
        <label class="full">釣り場<select name="spot"><option value="">選択してください</option>${spotsByArea}${opt("other", "その他（下に入力）", d.spot)}</select></label>
        <label class="full">場所の詳細（任意）<input name="place" value="${esc(d.place)}" placeholder="例: 西側の護岸、テトラ帯"></label>
        <label class="full">魚種<input name="fish" list="fishList" value="${esc(d.fish)}" placeholder="例: アジ"><datalist id="fishList">${FISH.map(f => `<option value="${esc(f.name)}">`).join("")}</datalist></label>
        <label>サイズ(cm)<input name="size" type="number" inputmode="decimal" step="0.5" min="0" value="${esc(d.size)}"></label>
        <label>匹数<input name="count" type="number" inputmode="numeric" min="1" value="${esc(d.count)}"></label>
        <label class="full">仕掛け<select name="rig"><option value="">選択（任意）</option>${rigOpts}</select></label>
        <label class="full">エサ・ルアー（任意）<input name="bait" value="${esc(d.bait)}" placeholder="例: アミエビ、エギ3号"></label>
        <label class="full">メモ<textarea name="memo" rows="3" placeholder="天気、タナ、釣れた時間帯など">${esc(d.memo)}</textarea></label>
        <button class="btn full" type="submit" id="saveBtn">保存する</button>
      </form>`;
  }
  function syncForm() {
    const f = $("#memForm"); if (!f || !draft) return;
    for (const el of f.elements) if (el.name) draft[el.name] = el.value;
  }
  async function addPhotos(files) {
    syncForm();
    const note = $("#exifNote");
    if (note) note.textContent = "写真を処理しています…";
    const notes = [];
    for (const file of [...files].slice(0, 6 - draft.photos.length)) {
      try {
        const p = await processFile(file);
        const key = draft.id + "_" + newId();
        draft.photos.push({ key, full: p.full, thumb: p.thumb, url: URL.createObjectURL(p.thumb) });
        if (draft.photos.length === 1 || !draft.exifUsed) {
          const m = p.exif.dt && p.exif.dt.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
          if (m) { draft.date = `${m[1]}-${m[2]}-${m[3]}`; draft.time = `${m[4]}:${m[5]}`; draft.exifUsed = true; notes.push("撮影日時"); }
          if (p.exif.lat) { const s = nearestSpot(p.exif.lat, p.exif.lon); if (s) { draft.spot = s; notes.push("釣り場（位置情報）"); } }
        }
      } catch (e) { alert(e.message || e); }
    }
    draft.exifNote = notes.length ? `✓ 写真から ${notes.join("・")} を入力しました` : "写真に撮影日時・位置の情報がないため、手で入力してください";
    window.render();
  }
  async function saveDraft() {
    syncForm();
    const d = draft, btn = $("#saveBtn");
    if (btn) { btn.disabled = true; btn.textContent = "保存中…"; }
    const newPhotos = d.photos.filter(p => !p.stored).map(p => ({ key: p.key, full: p.full, thumb: p.thumb }));
    const mem = {
      id: d.id, created: d.created || Date.now(), updated: Date.now(),
      date: d.date, time: d.time, tide: tideName(d.date), spot: d.spot, place: d.place.trim(),
      fish: d.fish.trim(), size: d.size, count: Number(d.count) || 1, rig: d.rig, bait: d.bait.trim(), memo: d.memo.trim(),
      photos: d.photos.map(p => p.key),
    };
    try {
      await MemDB.save(mem, newPhotos);
      if (d.removed.length) await MemDB.removePhotos(d.removed);
      if (mem.spot) sessionStorage.setItem("lastSpot", mem.spot);
      navigator.storage?.persist?.().catch(() => {});
      d.photos.forEach(p => p.url && URL.revokeObjectURL(p.url));
      draft = null;
      location.hash = "#/mem/" + mem.id;
    } catch (e) {
      alert("保存できませんでした: " + (e.message || e) + "\n（端末の空き容量やプライベートブラウズを確認してください）");
      if (btn) { btn.disabled = false; btn.textContent = "保存する"; }
    }
  }

  // ================================================================ バックアップ（無圧縮zip）
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function makeZip(files) { // files: [{name, data: Uint8Array}]
    const parts = [], central = [], enc = new TextEncoder();
    let offset = 0;
    const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true);
      h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true);
      c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + f.data.length;
    }
    const csize = central.reduce((a, b) => a + b.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, e.buffer], { type: "application/zip" });
  }
  function readZip(buf) {
    const v = new DataView(buf), dec = new TextDecoder(), out = {};
    let e = buf.byteLength - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("zipファイルではありません");
    let p = v.getUint32(e + 16, true);
    for (let i = 0, n = v.getUint16(e + 10, true); i < n; i++) {
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true);
      const xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nl));
      if (method !== 0) throw new Error("このアプリで書き出したzipを選んでください（圧縮されたzipは読めません）");
      const ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
      out[name] = new Uint8Array(buf, ds, size);
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function exportZip() {
    const all = await MemDB.all();
    if (!all.length) return alert("書き出す記録がありません");
    const files = [{ name: "memories.json", data: new TextEncoder().encode(JSON.stringify({ app: "hyogo-fishing", version: 1, exported: new Date().toISOString(), memories: all }, null, 1)) }];
    for (const m of all) for (const k of m.photos || []) {
      const p = await MemDB.photo(k);
      if (!p) continue;
      files.push({ name: `photos/${k}.jpg`, data: new Uint8Array(await p.full.arrayBuffer()) });
      files.push({ name: `thumbs/${k}.jpg`, data: new Uint8Array(await p.thumb.arrayBuffer()) });
    }
    const blob = await makeZip(files), t = todayJST();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fishing-memory-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  async function importZip(file) {
    try {
      const z = readZip(await file.arrayBuffer());
      const meta = JSON.parse(new TextDecoder().decode(z["memories.json"] || new Uint8Array()));
      if (meta.app !== "hyogo-fishing") throw new Error("このアプリのバックアップではありません");
      let n = 0;
      for (const m of meta.memories) {
        if (typeof m.id !== "string" || !/^[\w-]{1,40}$/.test(m.id)) continue; // 不正なデータは読み込まない
        m.photos = (m.photos || []).filter(k => typeof k === "string" && /^[\w-]{1,80}$/.test(k));
        const photos = (m.photos || []).filter(k => z[`photos/${k}.jpg`]).map(k => ({
          key: k, full: new Blob([z[`photos/${k}.jpg`]], { type: "image/jpeg" }),
          thumb: new Blob([z[`thumbs/${k}.jpg`] || z[`photos/${k}.jpg`]], { type: "image/jpeg" }),
        }));
        await MemDB.save(m, photos); n++;
      }
      alert(`${n}件の記録を復元しました`);
      window.render();
    } catch (e) { alert("復元できませんでした: " + (e.message || e)); }
  }
  async function showStorage() {
    const el = $("#storageInfo"); if (!el || !navigator.storage?.estimate) return;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.().catch(() => false);
    el.textContent = `使用量 ${(usage / 1048576).toFixed(1)}MB / 上限の目安 ${(quota / 1073741824).toFixed(1)}GB ・ ${persisted ? "✓ 自動削除されにくい設定です" : "保存の永続化: 未許可（ホーム画面に追加すると安定します）"}`;
  }

  // ================================================================ 釣り場詳細への追加
  async function spotExtras(id) {
    const box = $("#spotExtra"); if (!box) return;
    const rf = recentFish(14, id).slice(0, 5);
    const rigIds = [...new Set(rf.flatMap(([n]) => rigsForFish(n).map(r => r.id)))].slice(0, 4);
    const mems = (await MemDB.all()).filter(m => m.spot === id);
    box.innerHTML = (rf.length ? `<h2>🎣 ここで今釣れている魚と仕掛け</h2>
        <div>${rf.map(([n, c]) => `<a class="chip big" href="#/fish/${encodeURIComponent(n)}">${esc(n)} <b>${c}</b></a>`).join("")}</div>
        <div style="margin-top:6px">${rigIds.map(rid => { const r = rigById(rid); return `<a class="chip big" href="#/rig/${r.id}">${r.icon} ${esc(r.name)}</a>`; }).join("")}</div>` : "")
      + `<h2>📸 ここでの自分の記録 <span class="sub">${mems.length}件</span></h2>`
      + (mems.length ? await galleryGrid(mems.slice(0, 9)) : "")
      + `<a class="card link" href="#/memnew" data-act="newHere" data-spot="${esc(id)}">＋ この釣り場で記録する</a>`;
    fillThumbs(box);
  }

  // ================================================================ スタイル
  document.head.insertAdjacentHTML("beforeend", `<style>
    .chip.big{font-size:13.5px;padding:4px 12px;margin:3px 4px 3px 0;color:var(--text)}
    .list{margin:0;padding-left:20px} .list li{margin:4px 0}
    .yt{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000;cursor:pointer}
    .yt img,.yt iframe{width:100%;height:100%;object-fit:cover;border:0;display:block}
    .yt .play{position:absolute;inset:0;margin:auto;width:64px;height:44px;border-radius:12px;background:rgba(220,0,0,.9);color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center}
    .months{display:grid;grid-template-columns:repeat(12,1fr);gap:3px}
    .mon{text-align:center;font-size:12px;padding:6px 0;border-radius:6px;background:var(--chip);color:var(--sub)}
    .mon.on{background:var(--accent2);color:#fff;font-weight:600}
    .mon.now{outline:2px solid var(--high);outline-offset:-2px}
    .btn{display:inline-block;background:var(--accent2);color:#fff;border:0;border-radius:10px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer;text-align:center}
    .btn.ghost{background:var(--card);color:var(--text);border:1px solid var(--line)}
    .btn.danger{color:var(--warn)}
    .btn:disabled{opacity:.6}
    .gal{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
    .gi{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--chip);display:block}
    .gi img{width:100%;height:100%;object-fit:cover;display:block}
    .gi .noimg{display:flex;height:100%;align-items:center;justify-content:center;font-size:28px}
    .gi .cap{position:absolute;left:0;right:0;bottom:0;padding:10px 6px 4px;font-size:11.5px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.65));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gi .cnt{position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;border-radius:999px;padding:0 6px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);text-align:center;padding:10px 6px}
    .stats b{display:block;font-size:18px} .stats span{font-size:11.5px;color:var(--sub)}
    .photos{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:6px;border-radius:12px}
    .photos img{flex:none;width:100%;max-height:70vh;object-fit:contain;background:#000;scroll-snap-align:center;border-radius:12px}
    table.kv{width:100%;border-collapse:collapse;font-size:14px} table.kv th{text-align:left;color:var(--sub);font-weight:500;width:5em;padding:4px 0;vertical-align:top} table.kv td{padding:4px 0}
    .ptiles{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px}
    .pt{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--chip)}
    .pt img{width:100%;height:100%;object-fit:cover}
    .pt button{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;cursor:pointer}
    .pt.add{display:flex;align-items:center;justify-content:center;text-align:center;font-size:13px;color:var(--sub);border:2px dashed var(--line);background:var(--card);cursor:pointer}
    .form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
    .form label{display:flex;flex-direction:column;font-size:12.5px;color:var(--sub);gap:3px}
    .form .full{grid-column:1/-1}
    .form input,.form select,.form textarea{font:inherit;font-size:16px;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);width:100%;min-width:0}
    </style>`);

  // ================================================================ ルーティングへの登録
  window.EXT_VIEWS = {
    rigs: viewRigs, rig: viewRig, fish: viewFish,
    memory: viewMemory, mem: viewMem, memnew: () => viewMemEdit(null), memedit: viewMemEdit,
  };
  window.EXT_TAB = { rig: "rigs", fish: "rigs", mem: "memory", memnew: "memory", memedit: "memory" };
  window.afterRender = (p, arg) => {
    fillThumbs();
    if (p === "spot") spotExtras(arg);
    if (p === "memory") showStorage();
    if (p !== "memnew" && p !== "memedit" && draft && !draft.photos.some(x => !x.stored)) draft = null;
  };
  window.beforeRender = revokeAll;

  document.addEventListener("click", e => {
    const yt = e.target.closest("[data-yt]");
    if (yt) {
      yt.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.dataset.yt)}?autoplay=1&rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="YouTube動画"></iframe>`;
      yt.removeAttribute("data-yt"); return;
    }
    const mf = e.target.closest("[data-mfilter]");
    if (mf) { sessionStorage.setItem(mf.dataset.mfilter, mf.dataset.v); window.render(); return; }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const a = act.dataset.act;
    if (a === "export") exportZip();
    if (a === "newHere") { draft = null; sessionStorage.setItem("lastSpot", act.dataset.spot); }
    if (a === "rmphoto") {
      syncForm();
      const [p] = draft.photos.splice(Number(act.dataset.i), 1);
      if (p.stored) draft.removed.push(p.key); else URL.revokeObjectURL(p.url);
      window.render();
    }
    if (a === "delmem" && confirm("この記録と写真を削除しますか？（元に戻せません）")) {
      MemDB.remove(act.dataset.id).then(() => { location.hash = "#/memory"; });
    }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "photoIn" && e.target.files.length) addPhotos(e.target.files);
    if (e.target.id === "importZip" && e.target.files[0]) importZip(e.target.files[0]);
    if (e.target.name === "date" && e.target.form?.id === "memForm") {
      const n = $("#tideNote"); if (n) n.innerHTML = `潮: <b>${esc(tideName(e.target.value))}</b>（月齢からの目安）`;
    }
  });
  document.addEventListener("submit", e => { if (e.target.id === "memForm") { e.preventDefault(); saveDraft(); } });
  window.__memTest = { tideName, readExif, makeZip, readZip }; // 動作確認用
})();
