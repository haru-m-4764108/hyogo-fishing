"use strict";
let D = null;
const $ = s => document.querySelector(s);
// 外部由来のURLは http(s) だけ許可（javascript: などを無効化）
const safeUrl = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "#";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const WD = "日月火水木金土";
const today = () => { const n = new Date(); return new Date(n.getTime() + (n.getTimezoneOffset() + 540) * 60000); }; // JST
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayStr = () => ymd(today());
function fmtDate(s){
  if(!s) return "";
  const d = new Date(s.length <= 10 ? s + "T00:00:00+09:00" : s);
  const j = new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000);
  const md = `${j.getMonth()+1}/${j.getDate()}(${WD[j.getDay()]})`;
  return s.length > 10 ? `${md} ${String(j.getHours()).padStart(2,"0")}:${String(j.getMinutes()).padStart(2,"0")}` : md;
}
function daysAgo(s){ const d = new Date(s.length <= 10 ? s + "T00:00:00+09:00" : s); return (Date.now() - d) / 864e5; }
const spotById = id => D.spots.find(s => s.id === id);
const favs = () => store.get("favs", []);

// ---------- theme
(function(){
  const t = store.get("theme", null);
  if (t) document.documentElement.dataset.theme = t;
  $("#themeBtn").onclick = () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; store.set("theme", next);
  };
})();

// ---------- tide helpers
function tideDay(code, dateStr){ return D.tide?.[code]?.days.find(d => d.date === dateStr); }
function tideSummary(code){
  const t = tideDay(code, todayStr());
  if(!t) return "";
  return `<span class="chip tide">${esc(t.name)}</span>` +
    t.high.map(h => `<span class="hi">満${h.time}</span>`).join(" ") + " " +
    t.low.map(h => `<span class="lo">干${h.time}</span>`).join(" ");
}
function tideSvg(t, isToday){
  const W = 340, H = 150, L = 30, R = 14, T = 14, B = 22;
  const v = t.hourly, all = v.concat(t.high.map(x=>x.cm), t.low.map(x=>x.cm));
  const mn = Math.floor(Math.min(...all)/20)*20 - 10, mx = Math.ceil(Math.max(...all)/20)*20 + 10;
  const x = h => L + (W-L-R) * h / 24, y = c => T + (H-T-B) * (1 - (c-mn)/(mx-mn));
  const pts = v.map((c,h) => [x(h), y(c)]);
  // 最終点は翌0時の代わりに直線延長
  pts.push([x(24), y(v[23] + (v[23]-v[22]))]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for(let i=1;i<pts.length;i++){ const p0=pts[i-1], p1=pts[i], cx=(p0[0]+p1[0])/2; d += ` C${cx},${p0[1]} ${cx},${p1[1]} ${p1[0]},${p1[1]}`; }
  let g = "";
  for(let c = mn+10; c <= mx; c += 50){ if(c%50) continue; g += `<line x1="${L}" x2="${W-R}" y1="${y(c)}" y2="${y(c)}" stroke="var(--line)"/><text x="${L-4}" y="${y(c)+3}" font-size="9" text-anchor="end" fill="var(--sub)">${c}</text>`; }
  for(let h=0;h<=24;h+=6) g += `<text x="${x(h)}" y="${H-6}" font-size="9" text-anchor="middle" fill="var(--sub)">${h}時</text>`;
  const ev = (arr, cls, col, dy) => arr.map(e => { const [hh,mm]=e.time.split(":").map(Number); const ex=x(hh+mm/60), ey=y(e.cm);
    return `<circle cx="${ex}" cy="${ey}" r="3" fill="${col}"/><text x="${ex}" y="${ey+dy}" font-size="9.5" text-anchor="middle" fill="${col}" font-weight="600">${e.time}</text>`; }).join("");
  let now = "";
  if(isToday){ const n = today(); const nx = x(n.getHours()+n.getMinutes()/60); now = `<line x1="${nx}" x2="${nx}" y1="${T-4}" y2="${H-B}" stroke="var(--sub)" stroke-dasharray="3 3"/><text x="${nx}" y="${T-5}" font-size="9" text-anchor="middle" fill="var(--sub)">今</text>`; }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="潮位グラフ">${g}
    <path d="${d} L${x(24)},${H-B} L${x(0)},${H-B} Z" fill="var(--tidefill)"/>
    <path d="${d}" fill="none" stroke="var(--tide)" stroke-width="2"/>${now}
    ${ev(t.high,"hi","var(--high)",-6)}${ev(t.low,"lo","var(--low)",13)}</svg>`;
}
function tideWidget(code, key){
  const days = D.tide?.[code]?.days || [];
  if(!days.length) return `<div class="card empty">潮汐データがありません</div>`;
  const sel = store.get("tday:"+key, null);
  const cur = days.find(d => d.date === sel && sel >= todayStr()) || days.find(d => d.date === todayStr()) || days[0];
  const btns = days.map(d => { const dt = new Date(d.date+"T00:00:00+09:00");
    return `<button data-tday="${d.date}" data-key="${esc(key)}" class="${d.date===cur.date?"on":""}">${dt.getMonth()+1}/${dt.getDate()}(${WD[dt.getDay()]})<br><b>${esc(d.name)}</b></button>`; }).join("");
  return `<div class="card tidebox">
    <div class="row"><div class="grow title">${esc(D.tide[code].name)}の潮汐 <span class="chip tide">${esc(cur.name)}</span></div><span class="sub">気象庁</span></div>
    <div class="days">${btns}</div>
    ${tideSvg(cur, cur.date === todayStr())}
    <div class="hl">${cur.high.map(h=>`<span class="hi">満潮 <b>${h.time}</b> (${h.cm}cm)</span>`).join("")}${cur.low.map(h=>`<span class="lo">干潮 <b>${h.time}</b> (${h.cm}cm)</span>`).join("")}</div>
    <div class="sub" style="margin-top:4px">潮名は月齢からの目安です</div>
  </div>`;
}

// ---------- catch cards
function catchCard(c, showSpot){
  const sp = c.spot && spotById(c.spot);
  const fish = (c.fish||[]).length ? `<table class="fish">${c.fish.map(f =>
    `<tr><td>${esc(f.fish)}</td><td>${esc(f.size)}</td><td class="n">${esc(f.count)}</td><td class="sub">${esc(f.point)}</td></tr>`).join("")}</table>` : "";
  const meta = c.meta ? Object.entries(c.meta).filter(([,v])=>v).map(([k,v])=>`<span class="chip">${esc(k)} ${esc(v)}</span>`).join("") : "";
  return `<a class="card link" href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener">
    <div class="row sub"><span class="src">${esc(c.source)}</span><span>${fmtDate(c.date)}</span>
      ${showSpot && sp ? `<span class="ellip">📍${esc(sp.name)}</span>` : ""}</div>
    <div class="title" style="margin-top:3px">${esc(c.title)}</div>
    ${c.shop && c.source==="フィッシングマックス" ? `<div class="sub">${esc(c.shop)}</div>`:""}
    ${meta ? `<div>${meta}</div>`:""}
    ${c.text ? `<div class="sub" style="margin-top:3px">${esc(c.text)}</div>`:""}
    ${fish}
  </a>`;
}

// ---------- views
function viewSpots(){
  const f = favs();
  const recent = id => D.catches.filter(c => c.spot === id && daysAgo(c.date) < 3).length;
  const latest = id => D.catches.find(c => c.spot === id);
  const card = s => { const n = recent(s.id), l = latest(s.id);
    return `<div class="card"><div class="row">
      <button class="star ${f.includes(s.id)?"on":""}" data-fav="${s.id}" aria-label="お気に入り">${f.includes(s.id)?"★":"☆"}</button>
      <a class="grow" href="#/spot/${s.id}" style="color:inherit">
        <div class="row"><div class="grow title ellip">${esc(s.name)}</div><span class="badge ${n?"":"zero"}" title="直近3日の釣果数">${n}</span></div>
        <div class="sub">${tideSummary(s.tide)}</div>
        ${l ? `<div class="sub ellip">🐟 ${fmtDate(l.date)} ${esc(l.title)}</div>` : `<div class="sub">釣果情報なし</div>`}
      </a></div></div>`; };
  const favList = D.spots.filter(s => f.includes(s.id));
  let h = favList.length ? `<h2>★ お気に入り</h2>${favList.map(card).join("")}` : "";
  const areas = [...new Set(D.spots.map(s => s.area))];
  for(const a of areas) h += `<h2>${esc(a)}</h2>` + D.spots.filter(s => s.area === a && !f.includes(s.id)).map(card).join("");
  if(D.safety?.length){
    const s = D.safety.filter(x => daysAgo(x.date) < 30).slice(0,3);
    if(s.length) h = `<div class="card warnc"><div class="title">⚠ 最近の事故・注意情報</div>${s.map(x=>`<div class="sub"><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${fmtDate(x.date)} ${esc(x.title)}</a></div>`).join("")}<div class="sub">ライフジャケット着用を。</div></div>` + h;
  }
  return h + statusBlock();
}

function viewSpot(id){
  const s = spotById(id);
  if(!s) return `<div class="empty">釣り場が見つかりません</div>`;
  const cs = D.catches.filter(c => c.spot === id);
  const shops = D.shops?.[id] || [];
  const q = encodeURIComponent;
  const sns = [
    ["𝕏", "X（最新）", `https://x.com/search?q=${q(s.sns + " 釣果")}&f=live`],
    ["𝕏", "X（釣り場名）", `https://x.com/search?q=${q(s.sns)}&f=live`],
    ["📷", "Instagram", `https://www.instagram.com/explore/search/keyword/?q=${q(s.sns.replace(/\s/g,""))}`],
    ["▶", "YouTube（新着）", `https://www.youtube.com/results?search_query=${q(s.sns + " 釣り")}&sp=CAI%253D`],
    ["♪", "TikTok", `https://www.tiktok.com/search?q=${q(s.sns + " 釣り")}`],
    ["🦋", "Bluesky", `https://bsky.app/search?q=${q(s.sns)}`],
    ["🔎", "Google（1週間）", `https://www.google.com/search?q=${q(s.sns + " 釣果")}&tbs=qdr:w`],
  ];
  if(s.anglers) sns.push(["🎣", "アングラーズ釣果", `https://anglers.jp/areas/${s.anglers}/catches`]);
  if(s.official) sns.push(["🏠", "公式サイト", s.official]);
  sns.push(["🗺", "地図", `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`]);
  const f = favs();
  return `<a class="back" href="#/">‹ 釣り場一覧</a>
    <div class="row"><h2 class="grow" style="margin:0">${esc(s.name)}</h2>
      <button class="star ${f.includes(s.id)?"on":""}" data-fav="${s.id}">${f.includes(s.id)?"★":"☆"}</button></div>
    <div class="sub" style="margin-bottom:8px">${esc(s.area)}エリア</div>
    ${tideWidget(s.tide, s.id)}
    <h2>🐟 釣果情報 <span class="sub">${cs.length}件</span></h2>
    ${cs.length ? cs.slice(0,20).map(c => catchCard(c,false)).join("") : `<div class="card empty">最近の釣果情報は見つかりませんでした。<br>下のSNS・アングラーズも見てみてください。</div>`}
    <div id="spotExtra"></div>
    <h2>💬 SNS・口コミを探す</h2>
    <div class="grid sns">${sns.map(([i,l,u]) => `<a href="${esc(u)}" target="_blank" rel="noopener"><span class="i">${i}</span>${esc(l)}</a>`).join("")}</div>
    <div class="sub" style="margin-top:4px">X・Instagramは公式APIが有料/非公開のため、アプリの検索結果を直接開きます。</div>
    <h2>🏪 近くの釣具屋</h2>
    ${shops.length ? shops.map(sh => `<div class="card"><div class="row">
        <div class="grow"><div class="title">${esc(sh.name)}</div>
          <div class="sub">${sh.km}km${sh.addr?" ・ "+esc(sh.addr):""}</div>
          ${sh.hours?`<div class="sub">🕒 ${esc(sh.hours)}</div>`:""}</div>
        <div style="text-align:right;font-size:13px;line-height:1.9">
          <a href="https://www.google.com/maps/search/?api=1&query=${sh.addr ? q(sh.name+" "+sh.addr) : sh.lat+","+sh.lon}" target="_blank" rel="noopener">地図</a><br>
          ${sh.phone?`<a href="tel:${esc(sh.phone.replace(/[^\d+]/g,""))}">電話</a>`:""}
          ${sh.web?`<a href="${esc(safeUrl(sh.web))}" target="_blank" rel="noopener">Web</a>`:""}</div>
      </div></div>`).join("") : `<div class="card empty">データ取得待ち（OpenStreetMap）</div>`}
    <div class="sub">釣具屋データ: © OpenStreetMap contributors。営業時間は変わることがあります。</div>
    <div class="sub"><a href="https://www.google.com/maps/search/${q("釣具店")}/@${s.lat},${s.lon},13z" target="_blank" rel="noopener">Googleマップで周辺の釣具店を探す ›</a></div>`;
}

function viewCatches(){
  const area = store.get("carea", "all"), src = store.get("csrc", "all");
  const areas = [...new Set(D.spots.map(s => s.area))];
  const srcs = [...new Set(D.catches.map(c => c.source))];
  const list = D.catches.filter(c => (area === "all" || spotById(c.spot)?.area === area) && (src === "all" || c.source === src));
  const chip = (k, v, l, cur) => `<button data-filter="${k}" data-v="${esc(v)}" class="${cur===v?"on":""}">${esc(l)}</button>`;
  return `<div class="chips">${chip("carea","all","全エリア",area)}${areas.map(a=>chip("carea",a,a,area)).join("")}</div>
    <div class="chips">${chip("csrc","all","全情報源",src)}${srcs.map(a=>chip("csrc",a,a,src)).join("")}</div>
    ${list.length ? list.map(c => catchCard(c,true)).join("") : `<div class="empty">該当する釣果がありません</div>`}`;
}

function viewTide(){
  const code = store.get("tstation", "KB");
  const opts = Object.entries(D.tide_stations).map(([k,n]) => `<option value="${k}" ${k===code?"selected":""}>${esc(n)}</option>`).join("");
  const days = D.tide?.[code]?.days || [];
  const rows = days.map(d => { const dt = new Date(d.date+"T00:00:00+09:00");
    return `<tr><td>${dt.getMonth()+1}/${dt.getDate()}(${WD[dt.getDay()]})</td><td><b>${esc(d.name)}</b></td>
      <td class="hi">${d.high.map(h=>h.time).join("<br>")}</td><td class="lo">${d.low.map(h=>h.time).join("<br>")}</td></tr>`; }).join("");
  return `<h2>潮見表</h2><select id="tsel">${opts}</select><div style="height:10px"></div>
    ${tideWidget(code, "st:"+code)}
    <div class="card"><table class="fish"><tr class="sub"><td>日付</td><td>潮</td><td>満潮</td><td>干潮</td></tr>${rows}</table></div>
    <div class="sub">出典: <a href="https://www.data.jma.go.jp/kaiyou/db/tide/suisan/index.php" target="_blank" rel="noopener">気象庁 潮位表</a>（天文潮位。気象条件で実際の潮位は変わります）</div>`;
}

function viewEvents(){
  const ev = D.events || [];
  const up = ev.filter(e => daysAgo(e.date) < 90);
  const card = e => { const sp = e.spot && spotById(e.spot);
    return `<a class="card link" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">
      <div class="row sub"><span class="src">${esc(e.source)}</span><span>${fmtDate(e.date)}</span>${sp?`<span class="ellip">📍${esc(sp.name)}</span>`:""}</div>
      <div class="title" style="margin-top:3px">${esc(e.title)}</div></a>`; };
  return `<h2>📅 釣りイベント・大会</h2>
    <div class="sub" style="margin-bottom:8px">ニュース・釣り公園・釣具店の告知から集めています（日付は掲載日）</div>
    ${up.length ? up.map(card).join("") : `<div class="empty">イベント情報が見つかりませんでした</div>`}
    ${D.safety?.length ? `<h2>⚠ 事故・注意情報</h2>${D.safety.map(e => `<a class="card link warnc" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener"><div class="sub">${esc(e.source)} ・ ${fmtDate(e.date)}</div><div class="title">${esc(e.title)}</div></a>`).join("")}` : ""}`;
}

function statusBlock(){
  const names = {fishingmax:"フィッシングマックス",fishingv:"釣りビジョン",amagasaki:"尼崎市立魚つり公園",news:"ニュース(イベント)",tide:"気象庁 潮位表",shops:"OpenStreetMap 釣具屋"};
  return `<details class="card" style="margin-top:16px"><summary class="sub">情報源と取得状況</summary><ul class="status">${
    Object.entries(D.status||{}).map(([k,v]) => `<li class="${v.ok?"":"ng"}">${v.ok?"✓":"✗"} ${esc(names[k]||k)} ${v.at?"("+fmtDate(v.at)+")":""}${v.ok?"":" 取得失敗→前回データを表示"}</li>`).join("")
  }</ul><div class="sub">各記事の詳細・写真は元サイトでご覧ください。</div></details>`;
}

// ---------- router
let renderSeq = 0;
async function render(){
  if(!D) return;
  const h = location.hash.replace(/^#\/?/, "");
  const [p, arg] = h.split("/");
  const tab = p === "spot" || !p ? "spots" : (window.EXT_TAB || {})[p] || p;
  document.querySelectorAll("nav.tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  const v = {catches: viewCatches, tide: viewTide, events: viewEvents, ...(window.EXT_VIEWS || {})}[p];
  const seq = ++renderSeq;
  window.beforeRender?.();
  let html = p === "spot" ? viewSpot(arg) : v ? v(arg) : viewSpots();
  if(html instanceof Promise){
    html = await html.catch(e => `<div class="empty">表示できませんでした: ${esc(e.message || e)}</div>`);
    if(seq !== renderSeq) return; // 待っている間に別の画面へ移動した
  }
  $("#app").innerHTML = html;
  window.afterRender?.(p, arg);
}
window.render = render;
window.safeUrl = safeUrl;
document.addEventListener("click", e => {
  const fav = e.target.closest("[data-fav]");
  if(fav){ e.preventDefault(); const id = fav.dataset.fav, f = favs(); store.set("favs", f.includes(id) ? f.filter(x=>x!==id) : [...f, id]); render(); return; }
  const td = e.target.closest("[data-tday]");
  if(td){ store.set("tday:"+td.dataset.key, td.dataset.tday); const y = scrollY; render(); scrollTo(0,y); return; }
  const fl = e.target.closest("[data-filter]");
  if(fl){ store.set(fl.dataset.filter, fl.dataset.v); render(); }
});
document.addEventListener("change", e => { if(e.target.id === "tsel"){ store.set("tstation", e.target.value); render(); } });
addEventListener("hashchange", () => { render(); scrollTo(0,0); });

fetch("data.json?" + Date.now()).then(r => r.json()).then(d => {
  D = window.APP_DATA = d;
  $("#upd").innerHTML = `更新<br>${fmtDate(d.generated)}`;
  render();
}).catch(err => { $("#app").innerHTML = `<div class="empty">データを読み込めませんでした<br>${esc(err)}</div>`; });
