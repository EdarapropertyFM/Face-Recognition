"""Minimal browser pages served by the API. Placeholders in CAPS are replaced
by the endpoint before returning."""

_STYLE = """<style>
body{margin:0;background:#111;color:#ddd;font:14px system-ui}
header{padding:8px 12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
a{color:#8cf} button{font:inherit;padding:6px 14px;border:0;border-radius:4px;cursor:pointer}
button.primary{background:#2a7} button.warn{background:#c73} button.plain{background:#444;color:#ddd}
button:disabled{opacity:.4;cursor:default}
img{display:block;max-width:100vw;max-height:calc(100vh - 110px);margin:auto;background:#000}
#status{padding:6px 12px;font-family:ui-monospace,monospace;white-space:pre-wrap;min-height:3.5em}
.ok{color:#6d6} .bad{color:#f66} .warn{color:#fc6}
</style>"""

LIVE_HTML = """<!doctype html><title>Face Recognition - live</title>""" + _STYLE + """
<header><b>Live recognition</b><span>source: SOURCE</span>
<a href="/docs">API docs</a><a href="/persons">persons</a></header>
<img src="/stream?source=SOURCE" alt="live stream">"""

ENROLL_HTML = """<!doctype html><title>Enrol PERSON_NAME</title>""" + _STYLE + """
<header><b>Enrol: PERSON_NAME</b><span style="opacity:.6">PERSON_ID</span>
<span>source: SOURCE</span>
<label><input type="checkbox" id="auto" checked> auto-capture</label>
<button class="primary" id="start">Start camera</button>
<button class="plain" id="capture" disabled>Capture now</button>
<button class="plain" id="undo" disabled>Undo last</button>
<button class="primary" id="finish" disabled>Finish &amp; save</button>
<button class="warn" id="cancel" disabled>Cancel</button>
<a href="/live?source=SOURCE">live view</a><a href="/docs">API docs</a></header>
<div id="status">Click <b>Start camera</b>. You need N_REQUIRED captures; frames are only taken when
the face passes the quality filter. Follow the on-screen pose prompts.</div>
<img id="preview" alt="">
<script>
const pid = "PERSON_ID", base = `/persons/${pid}/enroll/webcam`;
const $ = id => document.getElementById(id);
let poll = null, finished = false;
const say = (html, cls="") => { $("status").innerHTML = html; $("status").className = cls; };
const setButtons = active => {
  $("start").disabled = active; $("auto").disabled = active;
  ["capture","undo","cancel"].forEach(b => $(b).disabled = !active);
};
async function api(method, path, q="") {
  const r = await fetch(base + path + q, {method});
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || r.statusText);
  return body;
}
function render(s) {
  const sc = s.self_check.min == null ? "n/a (need 2+)" :
    `min ${s.self_check.min.toFixed(3)}  mean ${s.self_check.mean.toFixed(3)}`;
  const scCls = s.self_check.min == null ? "" : (s.self_check_ok ? "ok" : "bad");
  say(`captured <b>${s.captured}/${s.required}</b>   step: ${s.guidance}\n` +
      `status: ${s.status}\n` +
      `<span class="${scCls}">self-check (same person, expect ~0.6+): ${sc}</span>` +
      (s.error ? `\n<span class="bad">error: ${s.error}</span>` : ""));
  $("finish").disabled = s.captured < 1 || finished;
  if (s.error && !s.active) { stopPoll(); setButtons(false); }
}
function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }
$("start").onclick = async () => {
  try {
    finished = false;
    const s = await api("POST", "/start", `?source=SOURCE&auto_capture=${$("auto").checked}`);
    $("preview").src = base + "/stream?t=" + Date.now();
    setButtons(true); render(s);
    poll = setInterval(async () => { try { render(await api("GET", "/status")); } catch (e) { say(e.message, "bad"); stopPoll(); } }, 500);
  } catch (e) { say(e.message, "bad"); }
};
$("capture").onclick = async () => { try { render(await api("POST", "/capture")); } catch (e) { say(e.message, "bad"); } };
$("undo").onclick = async () => { try { render(await api("POST", "/undo")); } catch (e) { say(e.message, "bad"); } };
$("cancel").onclick = async () => {
  stopPoll(); try { await fetch(base, {method: "DELETE"}); } catch (e) {}
  $("preview").src = ""; setButtons(false); $("finish").disabled = true; say("cancelled; nothing saved.");
};
$("finish").onclick = async () => {
  let q = "";
  for (;;) {
    try {
      const r = await api("POST", "/finish", q);
      finished = true; stopPoll(); setButtons(false); $("finish").disabled = true; $("preview").src = "";
      const p = r.pairwise_similarity;
      say(`<span class="ok">saved ${r.enrolled} template(s); person now has ${r.template_count}.</span>\n` +
          `pairwise similarity: min ${p.min ?? "n/a"}  mean ${p.mean ?? "n/a"}\n` +
          `remember to record consent in data/CONSENT.md. <a href="/live?source=SOURCE">open live view</a>`, "");
      return;
    } catch (e) {
      if (e.message.startsWith("self-check failed") && q === "" &&
          confirm(e.message + "\n\nSave anyway? (Not recommended)")) { q = "?force=true"; continue; }
      say(e.message, "bad"); return;
    }
  }
};
</script>"""

DVR_HTML = """<!doctype html><title>DVR setup</title>""" + _STYLE + """
<style>
form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px 12px;padding:12px;max-width:1100px}
label{display:flex;flex-direction:column;gap:3px;font-size:12px;opacity:.9}
input,select{font:inherit;padding:6px;background:#222;color:#eee;border:1px solid #444;border-radius:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:12px}
.card{background:#1b1b1b;border:1px solid #333;border-radius:6px;padding:8px}
.card img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#000;margin:6px 0}
.card .row{display:flex;gap:10px;flex-wrap:wrap;font-size:13px}
</style>
<header><b>DVR / NVR setup</b><a href="/live">live view</a><a href="/persons">persons</a><a href="/docs">API docs</a></header>
<form id="f" onsubmit="return false">
 <label>IP / host<input id="host" placeholder="192.168.1.108" required></label>
 <label>RTSP port<input id="port" type="number" value="554"></label>
 <label>Username<input id="username" value="admin"></label>
 <label>Password<input id="password" type="password"></label>
 <label>Brand<select id="brand"><option>hikvision</option><option>dahua</option><option>uniview</option><option>xmeye</option><option>custom</option></select></label>
 <label>Channels<input id="channels" type="number" value="8" min="1" max="64"></label>
 <label>Stream<select id="stream"><option value="sub">sub (recommended)</option><option value="main">main</option></select></label>
 <label>Name (optional)<input id="name" placeholder="Lobby DVR"></label>
 <label style="grid-column:1/-1" id="tplRow" hidden>Custom URL template<input id="url_template" placeholder="rtsp://{user}:{pass}@{host}:{port}/..."></label>
 <div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
  <button class="primary" id="save">Save &amp; connect</button>
  <button class="plain" id="probe" disabled>Test all channels</button>
  <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="detect"> run face detection on test frames</label>
  <button class="warn" id="forget" disabled>Forget DVR</button>
 </div>
</form>
<div id="status"></div>
<div class="grid" id="grid"></div>
<script>
const $ = id => document.getElementById(id);
const say = (html, cls="") => { $("status").innerHTML = html; $("status").className = cls; };
$("brand").onchange = () => $("tplRow").hidden = $("brand").value !== "custom";
async function refresh() {
  const d = await (await fetch("/dvr")).json();
  $("probe").disabled = $("forget").disabled = !d.configured;
  if (d.configured) {
    ["host","port","username","brand","channels","stream","name"].forEach(k => $(k).value = d[k]);
    $("brand").onchange();
    say(`configured: ${d.username}@${d.host}:${d.port} (${d.brand}, ${d.channels} channels, ${d.stream} stream)\n` +
        `example URL: ${d.example_url}\nuse <b>dvr:&lt;channel&gt;</b> as a source, e.g. /live?source=dvr:1`);
  } else say("no DVR configured yet. Enter the DVR's IP, RTSP username/password and brand, then Save.");
}
$("save").onclick = async () => {
  const body = {};
  ["host","username","password","brand","stream","name","url_template"].forEach(k => body[k] = $(k).value);
  body.port = +$("port").value; body.channels = +$("channels").value;
  const r = await fetch("/dvr", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
  const j = await r.json();
  if (!r.ok) { say("error: " + (j.detail?.[0]?.msg || j.detail || r.statusText), "bad"); return; }
  await refresh(); $("probe").click();
};
$("forget").onclick = async () => { await fetch("/dvr", {method:"DELETE"}); $("grid").innerHTML = ""; refresh(); };
$("probe").onclick = async () => {
  $("probe").disabled = true; $("grid").innerHTML = "";
  say("testing channels... (each waits up to 6 s)");
  try {
    const r = await fetch(`/dvr/channels?detect=${$("detect").checked}`);
    const j = await r.json();
    if (!r.ok) { say("error: " + (j.detail || r.statusText), "bad"); return; }
    const ok = j.channels.filter(c => c.ok).length;
    say(`${ok}/${j.channels.length} channels responded on ${j.host} (${j.stream} stream)`, ok ? "ok" : "bad");
    for (const c of j.channels) {
      const card = document.createElement("div"); card.className = "card";
      card.innerHTML = `<b>Channel ${c.channel}</b> <span class="${c.ok ? "ok" : "bad"}">${c.ok ? "OK" : "FAILED"}</span>` +
        (c.ok ? `<img src="/dvr/channels/${c.channel}/snapshot.jpg?t=${Date.now()}">` +
                `<div class="row"><span>${c.width}x${c.height}</span><span>${c.fps} fps</span><span>${c.seconds}s</span>` +
                (c.faces != null ? `<span>faces: ${c.faces}</span>` : "") + `</div>` +
                `<div class="row"><a href="/live?source=${c.source}">live view</a>` +
                `<a href="/dvr/channels/${c.channel}/snapshot.jpg?annotate=true" target="_blank">annotated snapshot</a>` +
                `<code>${c.source}</code></div>`
              : `<div class="bad" style="font-size:12px;margin-top:6px">${c.error}</div>`) +
        `<div style="font-size:11px;opacity:.5;word-break:break-all;margin-top:4px">${c.url_masked}</div>`;
      $("grid").appendChild(card);
    }
  } finally { $("probe").disabled = false; }
};
refresh();
</script>"""
