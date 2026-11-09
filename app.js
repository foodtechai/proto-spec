(function () {
  const EXAMPLES = [
    "우리 동네 카페를 예약하고 스탬프를 적립하는 앱",
    "중고 물건을 동네에서 직거래하는 마켓",
    "직원 출퇴근과 휴가 승인을 처리하는 사내 근태 서비스",
    "강아지 산책 예약을 잡고 채팅으로 조율하는 앱",
    "오늘 먹을 음식을 주문하고 배달 현황을 보는 서비스"
  ];

  const state = {
    view: "prompt",
    prompt: "",
    spec: null,
    screenId: "home",
    stack: [],
    toast: "",
    replacePrompt: false,
    revise: "",
    model: null,
    qaReport: null,
    qaFilter: "all",
    qaShown: 0,
    qaPreview: []
  };

  const app = document.getElementById("app");
  let qaTimer = null;

  function save() {
    if (!state.spec) return;
    try {
      localStorage.setItem("protospec:last", JSON.stringify({
        prompt: state.prompt,
        spec: state.spec,
        qaReport: state.qaReport || null
      }));
    } catch (e) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem("protospec:last");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.spec && data.prompt) {
        state.prompt = data.prompt;
        state.spec = data.spec;
      }
      if (data.qaReport && Array.isArray(data.qaReport.tests)) state.qaReport = data.qaReport;
    } catch (e) {}
  }

  function navigate(id, push) {
    if (!state.spec.screens.find((s) => s.id === id)) return;
    if (push) state.stack.push(state.screenId);
    state.screenId = id;
    render();
  }

  function goBack() {
    const prev = state.stack.pop();
    state.screenId = prev || "home";
    render();
  }

  function currentScreen() {
    return state.spec.screens.find((s) => s.id === state.screenId) || state.spec.screens[0];
  }

  function startGenerate() {
    const text = state.prompt.trim();
    if (text.length < 4) {
      state.toast = "만들고 싶은 서비스를 조금 더 구체적으로 적어 주세요.";
      render();
      return;
    }
    if (qaTimer) {
      clearTimeout(qaTimer);
      qaTimer = null;
    }
    state.view = "generating";
    render();
    setTimeout(() => {
      state.spec = window.ProtoSpec.generateFromPrompt(text);
      state.screenId = "home";
      state.stack = [];
      state.qaReport = null;
      state.view = "prototype";
      save();
      render();
    }, 1100);
  }

  function applyReviseResult(result) {
    state.spec = result.spec;
    state.revise = "";
    state.qaReport = null;
    if (result.focusId && state.spec.screens.some((item) => item.id === result.focusId)) {
      state.screenId = result.focusId;
    } else if (!state.spec.screens.some((item) => item.id === state.screenId)) {
      state.screenId = "home";
    }
    state.stack = state.stack.filter((id) => state.spec.screens.some((item) => item.id === id));
    state.view = "prototype";
    state.toast = [result.note].concat(result.changes || []).filter(Boolean).slice(0, 2).join(" ") || "프로토타입을 수정했습니다.";
    save();
    render();
  }

  async function startRevise() {
    const text = state.revise.trim();
    if (!state.spec || !window.ProtoSpec || !window.ProtoSpec.reviseFromPrompt) {
      state.toast = "수정할 프로토타입이 없습니다.";
      render();
      return;
    }
    if (text.length < 2) {
      state.toast = "수정할 내용을 한 줄로 적어 주세요.";
      render();
      return;
    }
    const screenId = state.screenId;
    if (qaTimer) {
      clearTimeout(qaTimer);
      qaTimer = null;
    }
    state.view = "revising";
    render();
    try {
      const response = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: state.spec, instruction: text, screenId: screenId })
      });
      const data = await response.json();
      if (response.ok && data && data.spec && Array.isArray(data.spec.screens)) {
        applyReviseResult(data);
        return;
      }
    } catch (error) {}
    applyReviseResult(window.ProtoSpec.reviseFromPrompt(state.spec, text, { screenId: screenId }));
  }

  async function saveModelKey() {
    const input = document.getElementById("api-key");
    const key = input ? input.value.trim() : "";
    if (key.length < 20) {
      state.toast = "Gemini 키를 붙여 넣은 뒤 연결을 눌러 주세요.";
      render();
      return;
    }
    try {
      const response = await fetch("/api/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key })
      });
      const data = await response.json();
      if (!response.ok) {
        state.toast = data.error || "키를 저장하지 못했습니다.";
        render();
        return;
      }
      state.model = { ready: true, model: "gemini-3.5-flash-lite" };
      state.toast = "Gemini에 연결했습니다. 이제 수정 문장을 화면으로 고칩니다.";
      render();
    } catch (error) {
      state.toast = "이 페이지는 node server.js 로 열어야 키를 저장할 수 있습니다.";
      render();
    }
  }

  function startQA() {
    if (!state.spec || !window.ProtoQA) {
      state.toast = "품질 검사를 실행할 화면설계서가 없습니다.";
      state.view = state.spec ? "spec" : "prompt";
      render();
      return;
    }
    if (qaTimer) clearTimeout(qaTimer);
    const report = window.ProtoQA.runQualityQA(state.spec);
    state.qaPreview = report.tests;
    state.qaShown = 0;
    state.qaFilter = "all";
    state.view = "qa-running";
    render();
    const tick = () => {
      state.qaShown += 1;
      render();
      const log = document.querySelector(".qa-log");
      if (log) log.scrollTop = log.scrollHeight;
      if (state.qaShown >= report.tests.length) {
        qaTimer = setTimeout(() => {
          state.qaReport = report;
          state.view = "qa";
          save();
          render();
          qaTimer = null;
        }, 360);
        return;
      }
      qaTimer = setTimeout(tick, 55);
    };
    qaTimer = setTimeout(tick, 220);
  }

  function topbar(extra) {
    const order = { prompt: 1, generating: 1, revising: 1, prototype: 1, spec: 2, "qa-running": 3, qa: 3 };
    const current = order[state.view] || 1;
    const cls = (n) => (current === n ? "on" : current > n ? "done" : "");
    return `
      <header class="topbar">
        <div class="brand"><span class="brand-mark">P</span> PROTO·SPEC</div>
        <div class="steps">
          <span class="${cls(1)}">1 프로토타입</span>
          <span>→</span>
          <span class="${cls(2)}">2 화면설계서</span>
          <span>→</span>
          <span class="${cls(3)}">3 품질 QA</span>
        </div>
        <div class="top-actions">${extra || ""}</div>
      </header>
    `;
  }

  function viewPrompt() {
    app.innerHTML = `
      ${topbar("")}
      <main class="prompt-wrap">
        <div class="kicker">Step 1 · Prompt to Prototype</div>
        <h1>만들고 싶은 서비스를<br/>한 문단으로 적어 주세요.</h1>
        <p class="lede">입력한 내용을 분석해 클릭 가능한 프로토타입을 만들고, 화면설계서로 정리한 뒤 품질 QA까지 진행합니다.</p>
        <div class="prompt-box">
          <textarea id="prompt" placeholder="예: 우리 동네 카페를 예약하고, 방문할 때마다 스탬프를 적립하는 앱을 만들고 싶어요. 사장님은 예약을 확인할 수 있으면 좋겠습니다.">${escapeHtml(state.prompt)}</textarea>
          <div class="prompt-actions">
            <span class="char-count">구체적으로 쓸수록 화면이 풍부해집니다</span>
            <button class="btn" id="go">${state.spec ? "새 프로토타입 만들기" : "프로토타입 만들기"}</button>
          </div>
        </div>
        <div class="key-box prompt-key">
          <p>Gemini API 키를 붙여 넣고 연결을 누르면 이 컴퓨터에만 저장됩니다.</p>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">키 만들기</a>
          <input id="api-key" type="password" autocomplete="off" placeholder="Gemini API 키 붙여 넣기" />
          <button class="btn" id="save-key" type="button">연결</button>
        </div>
        <div class="chips">
          ${EXAMPLES.map((ex) => `<button class="chip" data-ex="${escapeAttr(ex)}">${ex}</button>`).join("")}
        </div>
        <div class="process">
          <div class="card"><b>1단계 · 프로토타입</b><p>프롬프트로 화면을 만듭니다. 만들어진 화면에서 다시 적으면 그 프로토타입을 수정하고, 처음 화면에서 다시 적으면 새로 만듭니다.</p></div>
          <div class="card"><b>2단계 · 화면설계서</b><p>프로토타입에서 화면설계서 작성을 누르면 정보구조, 흐름, 화면 정의, 컴포넌트 명세로 정리합니다.</p></div>
          <div class="card"><b>3단계 · 품질 QA</b><p>화면설계서에서 품질 QA를 누르면 이동 경로, 요구사항 반영, 정책, 접근성을 항목별로 검사합니다.</p></div>
        </div>
        ${state.spec ? `<p class="lede" style="margin-top:24px">이전에 만든 <b>${escapeHtml(state.spec.name)}</b> 작업이 있습니다. <button class="btn secondary" id="resume">이어서 보기</button></p>` : ""}
      </main>
      ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
    `;
    const ta = document.getElementById("prompt");
    ta.addEventListener("input", () => { state.prompt = ta.value; state.toast = ""; });
    document.getElementById("go").addEventListener("click", () => { state.prompt = ta.value; startGenerate(); });
    document.querySelectorAll("[data-ex]").forEach((el) => {
      el.addEventListener("click", () => {
        state.prompt = el.getAttribute("data-ex");
        ta.value = state.prompt;
      });
    });
    if (state.replacePrompt) {
      ta.focus();
      ta.select();
      state.replacePrompt = false;
    }
    const resume = document.getElementById("resume");
    if (resume) resume.addEventListener("click", () => { state.view = "prototype"; render(); });
    const saveKey = document.getElementById("save-key");
    if (saveKey) saveKey.addEventListener("click", saveModelKey);
  }

  function viewGenerating() {
    app.innerHTML = `
      ${topbar("")}
      <div class="generating">
        <div class="pulse"></div>
        <h2>서비스를 읽고 화면을 조립하는 중</h2>
        <p class="lede">핵심 시나리오 → 정보구조 → 클릭 가능한 프로토타입</p>
      </div>
    `;
  }

  function viewRevising() {
    app.innerHTML = `
      ${topbar("")}
      <div class="generating">
        <div class="pulse"></div>
        <h2>수정 문장을 현재 프로토타입에 반영하는 중</h2>
        <p class="lede">바꾼다고 한 부분만 고치고, 나머지 화면은 유지합니다.</p>
      </div>
    `;
  }

  function fieldLabel(field) {
    return typeof field === "string" ? field : (field && (field.label || field.name)) || "";
  }

  function renderBlocks(blocks, palette, notes, showRules) {
    const pending = (notes || []).slice();
    const take = () => pending.shift() || null;
    const tag = (note) => {
      if (!note) return "";
      const rule = showRules ? `<span class="callout-rule">${escapeHtml(note.rule)}</span>` : "";
      return `<span class="callout">${escapeHtml(note.no)}</span>${rule}`;
    };
    const line = (title, note) => note
      ? `<div class="callout-line"><span class="callout-title">${escapeHtml(title)}</span>${tag(note)}</div>`
      : "";
    return (blocks || []).map((b) => {
      if (b.type === "hero") return `<div class="hero" style="--hero:${palette.hero}"><h3 style="margin:0">${escapeHtml(b.title)}</h3><p>${escapeHtml(b.subtitle || "")}</p></div>`;
      if (b.type === "search") return `${line("검색", take())}<div class="search">⌕ ${escapeHtml(b.placeholder || "검색")}</div>`;
      if (b.type === "chips") return `${line("필터", take())}<div class="row-chips">${b.items.map((i) => `<span>${escapeHtml(i)}</span>`).join("")}</div>`;
      if (b.type === "stats") return `${line("요약 수치", take())}<div class="stats">${b.items.map((i) => `<div class="stat"><strong>${escapeHtml(i.v)}</strong><span>${escapeHtml(i.k)}</span></div>`).join("")}</div>`;
      if (b.type === "cards") return `${line("카드 목록", take())}<div class="card-list">${b.items.map((i) => `
        <button class="p-card" data-to="${i.to || ""}">
          <div class="thumb">${i.emoji || "•"}</div>
          <div><b>${escapeHtml(i.title)}</b><div class="meta">${escapeHtml(i.meta || "")}</div></div>
          <span>›</span>
        </button>`).join("")}</div>`;
      if (b.type === "list") return `${line("목록", take())}<div class="list">${b.items.map((i) => `
        <button class="list-item" data-to="${i.to || ""}"><b>${escapeHtml(i.title)}</b><div class="meta">${escapeHtml(i.meta || "")}</div></button>`).join("")}</div>`;
      if (b.type === "form") return (b.fields || []).map((f) => {
        const label = fieldLabel(f);
        const hint = (b.placeholders && b.placeholders[label]) || (label + " 입력");
        const kind = /비밀번호|패스워드|password/i.test(label) ? "password" : "text";
        const note = take();
        const head = note
          ? `<div class="callout-line"><label>${escapeHtml(label)}</label>${tag(note)}</div>`
          : `<label>${escapeHtml(label)}</label>`;
        return `<div class="form-field">${head}<input class="fake-input" type="${kind}" placeholder="${escapeAttr(hint)}" autocomplete="off" /></div>`;
      }).join("");
      if (b.type === "cta") return `<div class="cta-block">${line(b.label || "버튼", take())}<button data-to="${b.to || ""}" style="--cta:${palette.cta}">${escapeHtml(b.label)}</button></div>`;
      if (b.type === "map") return `${line("지도", take())}<div class="map-block">${escapeHtml(b.text || "지도")}</div>`;
      if (b.type === "notice") return `${line("안내", take())}<p class="note">${escapeHtml(b.text)}</p>`;
      if (b.type === "chat") return `${line("대화", take())}${b.messages.map((m) => `<div class="chat-bubble ${m.me ? "me" : "them"}">${escapeHtml(m.text)}</div>`).join("")}`;
      return "";
    }).join("");
  }

  function screenNo(spec, screen) {
    const index = (spec.screens || []).findIndex((item) => item.id === screen.id);
    return String((index < 0 ? 0 : index) + 1).padStart(2, "0");
  }

  function screenTabs(spec) {
    if (spec.tabs && spec.tabs.length) return spec.tabs;
    return [
      { id: "home", label: "홈" },
      { id: "list", label: "탐색" },
      (spec.screens || []).find((item) => item.id === "chat") ? { id: "chat", label: "대화" } : null,
      { id: "my", label: "마이" }
    ].filter(Boolean);
  }

  function screenNotes(spec, screen) {
    const listed = window.ProtoQA && ProtoQA.fieldNotes ? ProtoQA.fieldNotes(spec) : [];
    const found = listed.find((item) => item.id === screen.id);
    return found ? found.notes : [];
  }

  function nextScreenIds(screen) {
    return [...new Set((screen.blocks || []).flatMap((block) => {
      if (block.to) return [block.to];
      if (block.items) return block.items.map((item) => item.to).filter(Boolean);
      return [];
    }))];
  }

  function phoneHtml(spec, screen, live) {
    const tabs = screenTabs(spec);
    return `
      <div class="phone">
        <div class="phone-inner">
          <div class="status"><span>9:41</span><span>${escapeHtml(spec.name)}</span></div>
          <div class="screen-header">
            ${screen.back ? `<button class="icon-btn" type="button" ${live ? 'id="back"' : ""}>‹</button>` : ""}
            <span class="screen-no">${screenNo(spec, screen)}</span>
            <h2>${escapeHtml(screen.name)}</h2>
            <span class="badge">${escapeHtml(spec.domain)}</span>
          </div>
          <div class="screen-body">${renderBlocks(screen.blocks, spec.palette, live ? null : screenNotes(spec, screen), false)}</div>
          <nav class="tabbar">
            ${tabs.map((tab) => `<button type="button" class="${tab.id === screen.tab || tab.id === screen.id ? "on" : ""}" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}
          </nav>
        </div>
      </div>`;
  }

  function viewPrototype() {
    const spec = state.spec;
    const screen = currentScreen();

    app.innerHTML = `
      ${topbar(`
        <button class="btn ghost no-print" id="to-prompt" title="처음 화면에서 프롬프트를 다시 적으면 새 프로토타입을 만듭니다">다시 입력</button>
        <button class="btn no-print" id="to-spec">화면설계서 작성</button>
      `)}
      <form class="revise-strip no-print" id="revise-form">
        <label for="revise">이 화면 수정</label>
        <input id="revise" value="${escapeAttr(state.revise)}" placeholder="예: 홈 제목을 회원목으로 바꿔줘 / 회원 목록에 검색을 넣어줘" />
        <button class="btn" type="submit">수정 반영</button>
        <span class="revise-mode">${state.model && state.model.ready ? "Gemini" : "기본 규칙"}</span>
      </form>
      <section class="key-connect no-print">
        <div>
          <h3>키 연결</h3>
          <p>${state.model && state.model.ready
            ? "저장된 키가 거절되면 새 키를 이 칸에 붙여 넣고 다시 연결하세요. 키는 이 컴퓨터에만 저장됩니다."
            : "Gemini API 키를 붙여 넣고 연결을 누르면 이 컴퓨터에만 저장됩니다."}</p>
        </div>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">키 만들기</a>
        <input id="api-key" type="password" autocomplete="off" placeholder="Gemini API 키 붙여 넣기" />
        <button class="btn" id="save-key" type="button">연결</button>
      </section>
      <div class="workspace">
        <aside class="sidebar">
          <h3>화면 목록</h3>
          ${spec.screens.map((s) => `
            <button class="nav-item ${s.id === screen.id ? "active" : ""}" data-nav="${s.id}">
              <span class="nav-no">${screenNo(spec, s)}</span>${escapeHtml(s.name)}
            </button>`).join("")}
        </aside>
        <section class="stage">
          ${phoneHtml(spec, screen, true)}
        </section>
        <aside class="inspector">
          <h3>이 화면의 역할</h3>
          <p class="note">${escapeHtml(screen.purpose)}</p>
          <h3 style="margin-top:24px">수정 이력</h3>
          ${(spec.revisions || []).length
            ? `<ul class="note">${spec.revisions.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>`
            : `<p class="note">위 입력창은 지금 프로토타입만 수정합니다. 처음부터 다시 만들려면 다시 입력을 누르세요.</p>`}
          <h3 style="margin-top:24px">요구사항 반영</h3>
          <ul class="note">${spec.requirements.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </aside>
      </div>
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    `;
    document.getElementById("to-prompt").addEventListener("click", () => {
      state.view = "prompt";
      state.replacePrompt = true;
      state.toast = "";
      render();
    });
    document.getElementById("revise-form").addEventListener("submit", (event) => {
      event.preventDefault();
      state.revise = document.getElementById("revise").value;
      startRevise();
    });
    document.getElementById("revise").addEventListener("input", (event) => {
      state.revise = event.target.value;
      state.toast = "";
      const toast = document.querySelector(".toast");
      if (toast) toast.remove();
    });
    const saveKey = document.getElementById("save-key");
    if (saveKey) saveKey.addEventListener("click", saveModelKey);
    document.getElementById("to-spec").addEventListener("click", () => { state.view = "spec"; render(); });
    document.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => navigate(el.getAttribute("data-nav"), false)));
    document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => navigate(el.getAttribute("data-tab"), false)));
    document.querySelectorAll("[data-to]").forEach((el) => {
      el.addEventListener("click", () => {
        const to = el.getAttribute("data-to");
        if (to) navigate(to, true);
      });
    });
    const back = document.getElementById("back");
    if (back) back.addEventListener("click", goBack);
  }

  function viewSpec() {
    const spec = state.spec;
    const date = new Date(spec.updatedAt || spec.createdAt).toLocaleString("ko-KR");
    const version = "0." + (1 + ((spec.revisions || []).length));
    const qaMeta = state.qaReport
      ? "품질 " + state.qaReport.score + "점 · " + state.qaReport.grade
      : "품질 미검사";
    const qaLabel = state.qaReport ? "품질 QA 다시 진행" : "품질 QA 진행";
    app.innerHTML = `
      ${topbar(`
        <button class="btn ghost no-print" id="to-proto">프로토타입</button>
        <button class="btn no-print" id="to-qa">품질 QA</button>
        <button class="btn secondary no-print" id="print">인쇄/PDF</button>
      `)}
      <article class="spec-page">
        <section class="doc-head">
          <div class="kicker">Step 2 · Screen Design Spec</div>
          <h1>${escapeHtml(spec.name)} 화면설계서</h1>
          <p class="lede">${escapeHtml(spec.tagline)}</p>
          <div class="meta-row">
            <span>문서 버전 ${version} (프로토타입 기반)</span>
            <span>도메인 ${escapeHtml(spec.domain)}</span>
            <span>작성 ${escapeHtml(date)}</span>
            <span>${escapeHtml(qaMeta)}</span>
          </div>
        </section>

        <div class="spec-grid">
          <section class="section">
            <h2>1. 서비스 개요</h2>
            <p class="note">이 문서는 1단계 프로토타입을 기준으로, 실제 구축에 필요한 화면 단위 정의를 정리합니다. 원문 프롬프트는 요구사항의 출처입니다.</p>
            <p class="note"><b>프롬프트</b><br/>${escapeHtml(spec.prompt)}</p>
            ${(spec.revisions || []).length ? `<p class="note"><b>수정 이력</b></p><ul class="note">${spec.revisions.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>` : ""}
          </section>
          <section class="section">
            <h2>2. 사용자</h2>
            <div class="ia">${spec.personas.map((p) => `<span>${escapeHtml(p)}</span>`).join("")}</div>
            <h2 style="margin-top:22px">3. 핵심 요구사항</h2>
            <ul class="note">${spec.requirements.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
          </section>
        </div>

        <section class="section">
          <h2>4. 정보구조 (IA)</h2>
          <div class="ia">${spec.ia.map((s) => `<span>${escapeHtml(s)}</span>`).join("")}</div>
        </section>

        <section class="section">
          <h2>5. 주요 사용자 흐름</h2>
          ${spec.flows.map((f) => `
            <div>
              <b>${escapeHtml(f.name)}</b>
              <div class="flow">${f.steps.map((s, i) => `<span class="box">${escapeHtml(s)}</span>${i < f.steps.length - 1 ? `<span class="arrow">→</span>` : ""}`).join("")}</div>
            </div>`).join("")}
        </section>

        <section class="section">
          <h2>6. 화면 정의</h2>
          <table>
            <thead><tr><th>번호</th><th>ID</th><th>화면명</th><th>목적</th><th>다음 화면</th></tr></thead>
            <tbody>
              ${spec.screens.map((s) => {
                const next = nextScreenIds(s).join(", ") || "-";
                return `<tr><td>${screenNo(spec, s)}</td><td>${s.id}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.purpose)}</td><td>${escapeHtml(next)}</td></tr>`;
              }).join("")}
            </tbody>
          </table>
        </section>

        <section class="section">
          <h2>7. 화면별 상세</h2>
          <p class="note">항목 번호는 화면 안에 붙입니다. 입력 규칙은 상황과 액션으로 적습니다. 문장을 보여 주면 alert, 확인을 받으면 컨펌창입니다.</p>
          ${spec.screens.map((s) => `
            <div class="screen-spec">
              <div class="spec-shot">
                ${phoneHtml(spec, s, false)}
              </div>
              <div class="spec-notes">
                <h3>${screenNo(spec, s)} ${escapeHtml(s.name)}</h3>
                <table class="rule-table">
                  <thead><tr><th>번호</th><th>항목</th><th>상황</th><th>액션</th></tr></thead>
                  <tbody>
                    ${screenNotes(spec, s).map((item) => {
                      const rows = item.rows && item.rows.length ? item.rows : [{ situation: "기본", action: item.rule }];
                      return rows.map((row, index) => `
                        <tr>
                          ${index === 0 ? `<td class="item-no" rowspan="${rows.length}">${escapeHtml(item.no)}</td><td class="item-name" rowspan="${rows.length}">${escapeHtml(item.title)}</td>` : ""}
                          <td>${escapeHtml(row.situation)}</td>
                          <td>${escapeHtml(row.action)}</td>
                        </tr>`).join("");
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </div>`).join("")}
        </section>

        <section class="section">
          <h2>8. 공통 컴포넌트</h2>
          <table>
            <thead><tr><th>컴포넌트</th><th>규칙</th><th>상태</th></tr></thead>
            <tbody>
              ${spec.components.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.spec)}</td><td>${escapeHtml(c.states)}</td></tr>`).join("")}
            </tbody>
          </table>
        </section>

        <section class="section">
          <h2>9. 정책과 비기능</h2>
          <ul class="note">${spec.policies.map((p) => `<li><b>${escapeHtml(p.title)}</b> — ${escapeHtml(p.detail)}</li>`).join("")}</ul>
        </section>

        <section class="section no-print next-step">
          <h2>10. 품질 QA</h2>
          <p class="note">화면 정의, 이동 경로, 사용자 흐름, 요구사항 반영, 컴포넌트, 정책, 접근성을 항목별로 검사합니다.</p>
          ${state.qaReport ? `<p class="note">최근 결과 <b>${state.qaReport.score}점 · ${escapeHtml(state.qaReport.grade)}</b></p>` : ""}
          <button class="btn" id="to-qa-bottom">${qaLabel}</button>
        </section>
      </article>
    `;
    document.getElementById("to-proto").addEventListener("click", () => { state.view = "prototype"; render(); });
    document.getElementById("to-qa").addEventListener("click", startQA);
    document.getElementById("to-qa-bottom").addEventListener("click", startQA);
    document.getElementById("print").addEventListener("click", () => window.print());
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }

  function statusLabel(status) {
    if (status === "pass") return "통과";
    if (status === "warn") return "경고";
    return "실패";
  }

  function gradeClass(grade) {
    if (grade === "합격") return "pass";
    if (grade === "조건부 합격") return "warn";
    return "fail";
  }

  function viewQaRunning() {
    const tests = state.qaPreview || [];
    const shown = tests.slice(0, state.qaShown);
    const pct = tests.length ? Math.round((state.qaShown / tests.length) * 100) : 0;
    app.innerHTML = `
      ${topbar("")}
      <div class="qa-run">
        <div class="kicker">Step 3 · Quality QA</div>
        <h2>품질 테스트를 진행하는 중</h2>
        <p class="lede">${state.qaShown} / ${tests.length}</p>
        <div class="bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
        <div class="qa-log" aria-live="polite">
          ${shown.map((t) => `
            <div class="qa-item">
              <div><span class="pill ${t.status}">${statusLabel(t.status)}</span></div>
              <div>
                <div class="qa-title"><span class="qid">${escapeHtml(t.id)}</span> ${escapeHtml(t.name)}</div>
                <p class="note">${escapeHtml(t.detail)}</p>
              </div>
            </div>`).join("")}
        </div>
      </div>
    `;
  }

  function isFixable(test) {
    if (!test || test.status !== "fail") return false;
    if (test.fixable) return true;
    return !!(window.ProtoQA && ProtoQA.canApplyFix && ProtoQA.canApplyFix(test.id));
  }

  function fixHint(test) {
    if (!isFixable(test)) return "";
    if (test.applyHint) return test.applyHint;
    if (window.ProtoQA && ProtoQA.applyHint) return ProtoQA.applyHint(test.id) || "";
    return "";
  }

  function applyFixButton(test) {
    if (!isFixable(test)) return "";
    return `<button type="button" class="btn apply-fix no-print" data-apply="${escapeAttr(test.id)}">화면설계서 적용</button>`;
  }

  function bindApplyFix() {
    document.querySelectorAll("[data-apply]").forEach((el) => {
      el.addEventListener("click", () => {
        if (!state.spec || !window.ProtoQA || !ProtoQA.applyQualityFix) return;
        const result = ProtoQA.applyQualityFix(state.spec, el.getAttribute("data-apply"));
        state.toast = result.message;
        if (!result.ok) {
          render();
          return;
        }
        state.qaReport = ProtoQA.runQualityQA(state.spec);
        save();
        render();
      });
    });
  }

  function viewQa() {
    const report = state.qaReport;
    if (!report) {
      state.view = "spec";
      viewSpec();
      return;
    }
    const when = new Date(report.ranAt).toLocaleString("ko-KR");
    const fails = report.tests.filter((t) => t.status === "fail");
    const groups = [];
    report.tests.forEach((t) => {
      let group = groups.find((item) => item.name === t.category);
      if (!group) {
        group = { name: t.category, tests: [] };
        groups.push(group);
      }
      group.tests.push(t);
    });
    const filter = state.qaFilter || "all";
    app.innerHTML = `
      ${topbar(`
        <button class="btn ghost no-print" id="to-spec">화면설계서</button>
        <button class="btn ghost no-print" id="to-proto">프로토타입</button>
        <button class="btn secondary no-print" id="rerun">다시 검사</button>
        <button class="btn secondary no-print" id="print">인쇄/PDF</button>
      `)}
      <article class="spec-page">
        <section class="doc-head">
          <div class="kicker">Step 3 · Quality QA</div>
          <div class="score-row">
            <div class="score-num ${gradeClass(report.grade)}">${report.score}</div>
            <div>
              <span class="pill ${gradeClass(report.grade)}">${escapeHtml(report.grade)}</span>
              <h1>${escapeHtml(state.spec.name)} 품질 검사</h1>
              <p class="lede">${escapeHtml(report.headline)}</p>
            </div>
          </div>
          <div class="meta-row">
            <span>통과 ${report.pass}</span>
            <span>경고 ${report.warn}</span>
            <span>실패 ${report.fail}</span>
            <span>총 ${report.total}항목</span>
            <span>${escapeHtml(when)}</span>
          </div>
          ${state.toast ? `<p class="note">${escapeHtml(state.toast)}</p>` : ""}
          ${fails.length ? `<ul class="note fail-list">${fails.map((t) => `<li><div><b>${escapeHtml(t.id)}</b> ${escapeHtml(t.name)} — ${escapeHtml(t.detail)}</div>${applyFixButton(t)}</li>`).join("")}</ul>` : ""}
        </section>
        <section class="section">
          <h2>클릭 경로 시뮬레이션</h2>
          <p class="note">홈과 하단 탭에서 버튼과 카드를 따라 방문한 화면입니다.</p>
          <div class="ia">${report.walk.order.map((step) => `<span>${escapeHtml(step.name)}</span>`).join("")}</div>
          ${report.walk.unreachable.length ? `<p class="note">도달하지 못한 화면: ${report.walk.unreachable.map((s) => escapeHtml(s.name)).join(", ")}</p>` : ""}
        </section>
        <section class="section">
          <h2>검사 항목</h2>
          <div class="chips qa-filters no-print">
            <button class="chip ${filter === "all" ? "on" : ""}" data-filter="all" type="button">전체 ${report.total}</button>
            <button class="chip ${filter === "fail" ? "on" : ""}" data-filter="fail" type="button">실패 ${report.fail}</button>
            <button class="chip ${filter === "warn" ? "on" : ""}" data-filter="warn" type="button">경고 ${report.warn}</button>
            <button class="chip ${filter === "pass" ? "on" : ""}" data-filter="pass" type="button">통과 ${report.pass}</button>
          </div>
          ${groups.map((group) => {
            const groupHidden = filter !== "all" && group.tests.every((t) => t.status !== filter);
            return `<div class="qa-group ${groupHidden ? "is-hidden" : ""}">
              <h3>${escapeHtml(group.name)}</h3>
              ${group.tests.map((t) => `
                <div class="qa-item ${filter !== "all" && t.status !== filter ? "is-hidden" : ""}">
                  <div><span class="pill ${t.status}">${statusLabel(t.status)}</span></div>
                  <div>
                    <div class="qa-title"><span class="qid">${escapeHtml(t.id)}</span> ${escapeHtml(t.name)}</div>
                    <p class="note">${escapeHtml(t.detail)}</p>
                    ${isFixable(t) ? `<div class="qa-actions">${applyFixButton(t)}${fixHint(t) ? `<p class="note">${escapeHtml(fixHint(t))}</p>` : ""}</div>` : ""}
                  </div>
                </div>`).join("")}
            </div>`;
          }).join("")}
        </section>
      </article>
    `;
    document.getElementById("to-spec").addEventListener("click", () => { state.view = "spec"; render(); });
    document.getElementById("to-proto").addEventListener("click", () => { state.view = "prototype"; render(); });
    document.getElementById("rerun").addEventListener("click", startQA);
    document.getElementById("print").addEventListener("click", () => window.print());
    document.querySelectorAll("[data-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        state.qaFilter = el.getAttribute("data-filter");
        state.toast = "";
        render();
      });
    });
    bindApplyFix();
  }

  function render() {
    if (state.view === "prompt") return viewPrompt();
    if (state.view === "generating") return viewGenerating();
    if (state.view === "revising") return viewRevising();
    if (state.view === "prototype") return viewPrototype();
    if (state.view === "spec") return viewSpec();
    if (state.view === "qa-running") return viewQaRunning();
    if (state.view === "qa") return viewQa();
  }

  function loadModelStatus() {
    fetch("/api/status").then((response) => response.json()).then((data) => {
      state.model = data;
      if (state.view !== "prototype" && state.view !== "prompt") return;
      const revising = document.getElementById("revise");
      const keyInput = document.getElementById("api-key");
      if ((revising && document.activeElement === revising) || (keyInput && document.activeElement === keyInput)) return;
      if (revising && revising.value) state.revise = revising.value;
      render();
    }).catch(() => {});
  }

  restore();
  render();
  loadModelStatus();
})();
