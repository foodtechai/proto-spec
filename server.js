const http = require("http");
const fs = require("fs");
const path = require("path");
const { reviseFromPrompt, applyModelScreens } = require("./generate.js");
const { runQualityQA } = require("./qa.js");

const root = __dirname;
const envFile = path.join(root, ".env");
const port = Number(process.env.PORT) || 8765;
const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
    if (!line || /^\s*#/.test(line)) return;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) return;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  });
}

loadEnv(envFile);

function apiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("요청이 너무 큽니다."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(new Error("JSON이 아닙니다."));
      }
    });
    req.on("error", reject);
  });
}

function local(req) {
  const address = req.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function saveKey(key) {
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split(/\r?\n/) : [];
  let found = false;
  const next = lines.map((line) => {
    if (/^\s*GEMINI_API_KEY\s*=/.test(line)) {
      found = true;
      return "GEMINI_API_KEY=" + key;
    }
    return line;
  }).filter((line, index, all) => line !== "" || index < all.length - 1);
  if (!found) next.push("GEMINI_API_KEY=" + key);
  fs.writeFileSync(envFile, next.filter((line) => line !== undefined).join("\n").replace(/\n?$/, "\n"), "utf8");
  process.env.GEMINI_API_KEY = key;
}

function slimSpec(spec, screenId) {
  return {
    name: spec.name,
    prompt: spec.prompt,
    domain: spec.domain,
    screenId: screenId,
    screens: spec.screens
  };
}

function modelPrompt(spec, instruction, screenId) {
  const current = (spec.screens || []).find((item) => item.id === screenId);
  return [
    "너는 모바일 프로토타입 편집기다. 수정 문장이 가리키는 부분만 바꾸고 나머지 화면, 문구, 이동은 유지한다.",
    "A가 아니라 B라고 하면 결과는 B이다. 설명 문장을 제목으로 넣지 않는다.",
    "블록 type은 hero, search, chips, stats, cards, list, form, cta, map, notice, chat 만 쓴다.",
    "cards와 list의 items[].to, cta.to는 아래 화면 id만 사용한다.",
    "form.fields는 문자열 배열이다. 화면에는 id, name, purpose, blocks가 있어야 한다.",
    "home과 success는 지우지 않는다. 보고 있는 화면을 우선 수정한다.",
    "JSON만 반환한다. 형식은 {\"changes\":[\"바뀐 내용을 한 문장으로\"],\"focusId\":\"화면id\",\"screens\":[...전체 화면...]}",
    "",
    "보고 있는 화면: " + (current ? current.id + " " + current.name : screenId),
    "수정 문장: " + instruction,
    "현재 프로토타입:",
    JSON.stringify(slimSpec(spec, screenId))
  ].join("\n");
}

function parseModelText(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("모델 응답에 JSON이 없습니다.");
  return JSON.parse(raw.slice(start, end + 1));
}

async function callGemini(model, spec, instruction, screenId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey()
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: modelPrompt(spec, instruction, screenId) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: model.indexOf("3.8") >= 0 ? "LOW" : "MINIMAL" }
        }
      }),
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok) {
      const message = (data.error && data.error.message) || ("Gemini 오류 " + response.status);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map((part) => part.text || "").join("");
    return parseModelText(text);
  } finally {
    clearTimeout(timer);
  }
}

async function reviseWithModel(spec, instruction, screenId) {
  let lastError = null;
  for (let i = 0; i < models.length; i += 1) {
    try {
      const parsed = await callGemini(models[i], spec, instruction, screenId);
      const screens = parsed.screens || (parsed.spec && parsed.spec.screens);
      const applied = applyModelScreens(spec, screens, instruction, {
        focusId: parsed.focusId || screenId,
        changes: parsed.changes
      });
      if (!applied.ok) throw new Error(applied.reason || "모델 화면을 받지 못했습니다.");
      const report = runQualityQA(applied.spec);
      if (report.fail) {
        const blocking = report.tests.filter((item) => item.status === "fail" && !/^QA-6[4-8]$/.test(item.id));
        if (blocking.length) {
          throw new Error("품질 검사 실패 " + blocking.map((item) => item.id).join(", "));
        }
      }
      return {
        spec: applied.spec,
        changes: applied.changes,
        focusId: applied.focusId,
        mode: "model",
        note: ""
      };
    } catch (error) {
      lastError = error;
      console.error("[revise]", models[i], error.status || "", error.message);
      const retryable = error.name === "AbortError"
        || error.status === 404
        || /not found|not supported|is not supported|aborted/i.test(error.message || "");
      if (!retryable) break;
    }
  }
  const fallback = reviseFromPrompt(spec, instruction, { screenId: screenId });
  return {
    spec: fallback.spec,
    changes: fallback.changes,
    focusId: fallback.focusId,
    mode: "rules",
    note: explainModelError(lastError)
  };
}

function explainModelError(error) {
  const text = String((error && error.message) || "");
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(text)) {
    return "저장한 키가 Gemini에서 거절되었습니다. AI Studio에서 API 키를 다시 복사해 연결해 주세요.";
  }
  if (/quota|rate limit|RESOURCE_EXHAUSTED/i.test(text)) {
    return "Gemini 무료 사용량을 잠시 넘겼습니다. 조금 뒤에 다시 수정해 주세요.";
  }
  if (/permission|forbidden|PERMISSION_DENIED/i.test(text)) {
    return "이 키로는 Gemini 화면 수정을 호출할 수 없습니다. AI Studio에서 새 API 키를 만들어 연결해 주세요.";
  }
  if (/aborted|abort/i.test(text)) {
    return "Gemini 응답이 너무 오래 걸려 기본 규칙으로 반영했습니다. 같은 문장으로 한 번 더 수정해 주세요.";
  }
  if (!text) return "모델 수정을 확인하지 못해 기본 규칙으로 반영했습니다.";
  return "모델 수정을 확인하지 못했습니다. " + text.replace(/AIza[\w-]+/g, "").slice(0, 160);
}

function rulesResult(spec, instruction, screenId, note) {
  const result = reviseFromPrompt(spec, instruction, { screenId: screenId });
  return {
    spec: result.spec,
    changes: result.changes,
    focusId: result.focusId,
    mode: "rules",
    note: note || ""
  };
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function serveFile(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const base = path.resolve(root);
  const file = path.resolve(base, "." + pathname);
  if (file !== base && !file.startsWith(base + path.sep)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/plain; charset=utf-8" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (!local(req)) {
    send(res, 403, { error: "이 서버는 이 컴퓨터에서만 사용할 수 있습니다." });
    return;
  }
  if (req.method === "GET" && req.url.split("?")[0] === "/api/status") {
    send(res, 200, { ready: !!apiKey(), model: models[0] });
    return;
  }
  if (req.method === "POST" && req.url.split("?")[0] === "/api/key") {
    try {
      const body = await readBody(req);
      const key = String(body.key || "").trim();
      if (key.length < 20 || key.length > 200 || /\s/.test(key)) {
        send(res, 400, { error: "키 형식을 다시 확인해 주세요." });
        return;
      }
      saveKey(key);
      send(res, 200, { ready: true });
    } catch (error) {
      send(res, 400, { error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url.split("?")[0] === "/api/revise") {
    try {
      const body = await readBody(req);
      const spec = body.spec;
      const instruction = String(body.instruction || "").trim();
      const screenId = body.screenId || "home";
      if (!spec || !Array.isArray(spec.screens) || instruction.length < 2) {
        send(res, 400, { error: "수정할 화면과 문장이 필요합니다." });
        return;
      }
      if (!apiKey()) {
        send(res, 200, rulesResult(spec, instruction, screenId, "Gemini 키가 없어 기본 규칙으로만 수정했습니다."));
        return;
      }
      send(res, 200, await reviseWithModel(spec, instruction, screenId));
    } catch (error) {
      send(res, 500, { error: error.message || "수정에 실패했습니다." });
    }
    return;
  }
  if (req.method === "GET") {
    serveFile(req, res);
    return;
  }
  send(res, 404, { error: "없는 주소입니다." });
});

server.listen(port, "127.0.0.1", () => {
  console.log("ready " + port + " model=" + (apiKey() ? "on" : "off"));
});
