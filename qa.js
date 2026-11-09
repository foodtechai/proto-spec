(function (global) {
  const KNOWN_BLOCKS = {
    hero: true,
    search: true,
    chips: true,
    stats: true,
    cards: true,
    list: true,
    form: true,
    cta: true,
    map: true,
    notice: true,
    chat: true
  };

  function linksFrom(screen) {
    const out = [];
    (screen.blocks || []).forEach((block) => {
      if (!block || typeof block !== "object") return;
      if (block.to) out.push(block.to);
      (block.items || []).forEach((item) => {
        if (item && typeof item === "object" && item.to) out.push(item.to);
      });
    });
    return out;
  }

  function tabRootIds(screens) {
    const ids = new Set(screens.map((screen) => screen && screen.id));
    const roots = ["home", "list", "my"];
    if (ids.has("chat")) roots.push("chat");
    return roots;
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((item) => {
      const key = item.from + "→" + item.to;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function simulate(screens) {
    const byId = {};
    screens.forEach((screen) => {
      if (screen && screen.id) byId[screen.id] = screen;
    });
    const broken = [];
    const order = [];
    const seen = new Set();
    const queue = tabRootIds(screens).filter((id) => byId[id]);
    if (!queue.length && screens[0] && screens[0].id) queue.push(screens[0].id);

    while (queue.length) {
      const id = queue.shift();
      if (!byId[id] || seen.has(id)) continue;
      seen.add(id);
      order.push({ id: id, name: byId[id].name || id });
      linksFrom(byId[id]).forEach((to) => {
        if (!byId[to]) broken.push({ from: id, fromName: byId[id].name || id, to: to });
        else if (!seen.has(to)) queue.push(to);
      });
    }

    screens.forEach((screen) => {
      if (!screen || !screen.id || seen.has(screen.id)) return;
      linksFrom(screen).forEach((to) => {
        if (!byId[to]) broken.push({ from: screen.id, fromName: screen.name || screen.id, to: to });
      });
    });

    return {
      order: order,
      broken: dedupe(broken),
      unreachable: screens
        .filter((screen) => screen && screen.id && !seen.has(screen.id))
        .map((screen) => ({ id: screen.id, name: screen.name || screen.id }))
    };
  }

  function summarize(tests, walk) {
    const pass = tests.filter((test) => test.status === "pass").length;
    const warn = tests.filter((test) => test.status === "warn").length;
    const fail = tests.filter((test) => test.status === "fail").length;
    const total = tests.length;
    const score = total ? Math.round((pass * 100 + warn * 50) / total) : 0;
    let grade = "보완 필요";
    let headline = "실패한 항목을 보완한 뒤 다시 검사하세요.";
    if (fail === 0 && warn === 0) {
      grade = "합격";
      headline = "화면설계서가 품질 기준을 모두 통과했습니다.";
    } else if (fail === 0) {
      grade = "조건부 합격";
      headline = "필수 항목은 통과했습니다. 경고 항목을 반영하면 개발 핸드오프가 더 안전합니다.";
    }
    return {
      ranAt: new Date().toISOString(),
      score: score,
      grade: grade,
      headline: headline,
      pass: pass,
      warn: warn,
      fail: fail,
      total: total,
      tests: tests,
      walk: walk || { order: [], broken: [], unreachable: [] }
    };
  }

  function fieldLabelOf(field) {
    return typeof field === "string" ? field : (field && (field.label || field.name)) || "";
  }

  function fieldRule(label) {
    const name = String(label || "");
    if (/아이디|userid|user id|^id$/i.test(name) && !/찾기/.test(name)) return "영문만 가능. 최대 20자.";
    if (/비밀번호|패스워드|password/i.test(name)) return "영문과 숫자 조합. 최소 8자, 최대 20자. 입력값은 가림.";
    if (/이메일|email/i.test(name)) return "이메일 형식. 최대 50자.";
    if (/이름|성명/.test(name)) return "한글만 가능. 최대 10자.";
    if (/연락처|전화|휴대폰|핸드폰/.test(name)) return "숫자만 가능. 최대 13자.";
    if (/주소|위치/.test(name)) return "한글과 숫자 가능. 최대 80자.";
    if (/요청|메모|내용/.test(name)) return "한글과 영문 가능. 최대 100자.";
    if (/시간|일시/.test(name)) return "시간 형식. 최대 20자.";
    return "한글과 영문 가능. 최대 40자.";
  }

  function developerQuestions(title, rule) {
    const text = String(rule || "");
    const questions = [];
    const max = text.match(/최대\s*(\d+)\s*자/);
    if (max && !/넘기|초과|더 이상 입력|입력되지|막을|잘라|오류/.test(text)) {
      questions.push(title + "는 최대 " + max[1] + "자입니다. " + max[1] + "자를 넘기면 입력을 막을지, 넘친 글자를 버릴지, 오류 문구를 보여줄지 정해져 있지 않습니다.");
    }
    const min = text.match(/최소\s*(\d+)\s*자/);
    if (min && !/미만|짧으면|부족|막을|오류/.test(text)) {
      questions.push(title + "는 최소 " + min[1] + "자입니다. " + min[1] + "자보다 짧으면 진행을 막을지, 필드 아래에 오류를 보여줄지 정해져 있지 않습니다.");
    }
    if (/영문만/.test(text) && !/한글이나|숫자를 입력|다른 글자|막을|오류/.test(text)) {
      questions.push(title + "는 영문만 가능합니다. 한글이나 숫자를 입력하면 키 입력을 막을지, 오류 문구를 보여줄지 정해져 있지 않습니다.");
    }
    if (/한글만/.test(text) && !/영문이나|숫자를 입력|다른 글자|막을|오류/.test(text)) {
      questions.push(title + "는 한글만 가능합니다. 영문이나 숫자를 입력하면 키 입력을 막을지, 오류 문구를 보여줄지 정해져 있지 않습니다.");
    }
    if (/숫자만/.test(text) && !/다른 글자|막을|오류/.test(text)) {
      questions.push(title + "는 숫자만 가능합니다. 숫자 외 글자를 입력하면 키 입력을 막을지, 오류 문구를 보여줄지 정해져 있지 않습니다.");
    }
    return questions;
  }

  function hasBatchim(word) {
    const value = String(word || "");
    const last = value.charCodeAt(value.length - 1);
    if (last < 0xac00 || last > 0xd7a3) return false;
    return (last - 0xac00) % 28 !== 0;
  }

  function josa(word, pair) {
    return (word || "항목") + (hasBatchim(word) ? pair[0] : pair[1]);
  }

  function hasUserSentence(text) {
    return /[‘'「“"][^’'」”"]{2,}[’'」”"]/.test(String(text || ""));
  }

  function saysShowsError(text) {
    const value = String(text || "");
    return /오류|에러/.test(value) && /보여|표시|노출|문구/.test(value);
  }

  function unnamedError(text) {
    return /오류 문구를 보여|오류를 보여|오류를 표시|에러를 보여/.test(String(text || ""));
  }

  function decidedSentences(rule, title) {
    const text = String(rule || "");
    const name = josa(title || "입력값", ["은", "는"]);
    const sentences = [];
    const max = text.match(/최대\s*(\d+)\s*자/);
    if (max && !/넘기|초과|더 이상 입력|입력되지|막을|잘라|오류/.test(text)) {
      sentences.push(max[1] + "자를 넘기면 더 이상 입력되지 않고 필드 아래에 ‘" + name + " 최대 " + max[1] + "자까지 입력할 수 있습니다.’를 보여줍니다.");
    }
    const min = text.match(/최소\s*(\d+)\s*자/);
    if (min && !/미만|짧으면|부족|막을|오류/.test(text)) {
      sentences.push(min[1] + "자보다 짧으면 진행을 막고 필드 아래에 ‘" + name + " " + min[1] + "자 이상 입력해 주세요.’를 보여줍니다.");
    }
    if (/영문만/.test(text) && !/한글이나|숫자를 입력|다른 글자|막을|오류/.test(text)) {
      sentences.push("한글이나 숫자를 입력하면 키 입력을 막고 ‘영문만 입력할 수 있습니다.’를 보여줍니다.");
    }
    if (/한글만/.test(text) && !/영문이나|숫자를 입력|다른 글자|막을|오류/.test(text)) {
      sentences.push("영문이나 숫자를 입력하면 키 입력을 막고 ‘한글만 입력할 수 있습니다.’를 보여줍니다.");
    }
    if (/숫자만/.test(text) && !/다른 글자|막을|오류/.test(text)) {
      sentences.push("숫자 외 글자를 입력하면 키 입력을 막고 ‘숫자만 입력할 수 있습니다.’를 보여줍니다.");
    }
    return sentences;
  }

  function completeRule(rule, title) {
    const sentences = decidedSentences(rule, title);
    if (!sentences.length) return String(rule || "");
    const base = String(rule || "").replace(/\s+$/, "");
    const glue = /[.。]$/.test(base) ? " " : ". ";
    return base + glue + sentences.join(" ");
  }

  function supplyErrorCopy(title, rule) {
    let text = String(rule || "");
    const name = josa(title || "입력값", ["은", "는"]);
    const max = text.match(/최대\s*(\d+)\s*자/);
    const min = text.match(/최소\s*(\d+)\s*자/);
    if (max) {
      text = text.replace(
        max[1] + "자를 넘기면 더 이상 입력되지 않고 필드 아래에 오류를 보여줍니다.",
        max[1] + "자를 넘기면 더 이상 입력되지 않고 필드 아래에 ‘" + name + " 최대 " + max[1] + "자까지 입력할 수 있습니다.’를 보여줍니다."
      );
    }
    if (min) {
      text = text.replace(
        min[1] + "자보다 짧으면 진행을 막고 필드 아래에 오류를 보여줍니다.",
        min[1] + "자보다 짧으면 진행을 막고 필드 아래에 ‘" + name + " " + min[1] + "자 이상 입력해 주세요.’를 보여줍니다."
      );
    }
    text = text.replace("한글이나 숫자를 입력하면 키 입력을 막고 오류 문구를 보여줍니다.", "한글이나 숫자를 입력하면 키 입력을 막고 ‘영문만 입력할 수 있습니다.’를 보여줍니다.");
    text = text.replace("영문이나 숫자를 입력하면 키 입력을 막고 오류 문구를 보여줍니다.", "영문이나 숫자를 입력하면 키 입력을 막고 ‘한글만 입력할 수 있습니다.’를 보여줍니다.");
    text = text.replace("숫자 외 글자를 입력하면 키 입력을 막고 오류 문구를 보여줍니다.", "숫자 외 글자를 입력하면 키 입력을 막고 ‘숫자만 입력할 수 있습니다.’를 보여줍니다.");
    if (/이메일 형식/.test(text) && !/올바른 이메일 주소/.test(text)) {
      text = text.replace(/\s*$/, "") + " 형식이 아니면 ‘올바른 이메일 주소를 입력해 주세요.’를 보여줍니다.";
    }
    if (/시간 형식/.test(text) && !/시간을 다시 확인/.test(text)) {
      text = text.replace(/\s*$/, "") + " 형식이 아니면 ‘시간을 다시 확인해 주세요.’를 보여줍니다.";
    }
    if (unnamedError(text) || (saysShowsError(text) && !hasUserSentence(text))) {
      text = text.replace(/오류 문구를 보여줍니다/g, "‘입력 내용을 확인해 주세요.’를 보여줍니다");
      text = text.replace(/오류를 보여줍니다/g, "‘입력 내용을 확인해 주세요.’를 보여줍니다");
      text = text.replace(/오류를 표시합니다/g, "‘입력 내용을 확인해 주세요.’를 표시합니다");
    }
    return text;
  }

  function errorCopyGaps(spec) {
    const gaps = [];
    fieldNotes(spec).forEach((screen) => {
      (screen.notes || []).forEach((note) => {
        const text = note.rule || "";
        const who = note.no + " " + josa(note.title, ["은", "는"]);
        if (/이메일 형식/.test(text) && !/올바른 이메일 주소/.test(text)) {
          gaps.push(who + " 이메일 형식만 적혀 있고, 형식이 아닐 때 보여 줄 문장이 없습니다.");
        }
        if (/시간 형식/.test(text) && !/시간을 다시 확인/.test(text)) {
          gaps.push(who + " 시간 형식만 적혀 있고, 형식이 아닐 때 보여 줄 문장이 없습니다.");
        }
        if (unnamedError(text) || (saysShowsError(text) && !hasUserSentence(text))) {
          gaps.push(who + " 오류를 보여 준다고 되어 있지만, 사용자에게 보일 문장이 없습니다.");
        }
      });
    });
    (spec.policies || []).forEach((policy) => {
      const detail = (policy && policy.detail) || "";
      if (unnamedError(detail) || (saysShowsError(detail) && !hasUserSentence(detail))) {
        gaps.push("정책 ‘" + (policy.title || "오류") + "’" + (hasBatchim(policy.title || "오류") ? "은" : "는") + " 오류를 표시한다고 되어 있지만, 사용자에게 보일 문장이 없습니다.");
      }
    });
    return gaps;
  }

  function emptyFieldGaps(spec) {
    const gaps = [];
    fieldNotes(spec).forEach((screen) => {
      (screen.notes || []).forEach((note) => {
        if (note.kind !== "field") return;
        const text = note.rule || "";
        if (/선택|비워\s*둘|없어도/.test(text)) return;
        if (/비어 있으면|값이 없으면|입력하지 않으면/.test(text) && hasUserSentence(text)) return;
        gaps.push(note.no + " " + josa(note.title, ["은", "는"]) + " 비어 있을 때 진행을 막을지, 그때 보여 줄 문장이 정해져 있지 않습니다.");
      });
    });
    return gaps;
  }

  function loginScreen(spec) {
    return (spec.screens || []).find((screen) => {
      const blob = JSON.stringify(screen && screen.blocks);
      const label = ((screen && screen.name) || "") + blob;
      return /비밀번호|패스워드/.test(blob) && /로그인/.test(label);
    });
  }

  function hasLoginFailureCopy(spec) {
    const blob = JSON.stringify(spec.policies || []) + JSON.stringify(spec.fieldRules || {});
    return /아이디 또는 비밀번호가 올바르지 않습니다|비밀번호가 일치하지 않습니다/.test(blob) && hasUserSentence(blob);
  }

  function emptyListGap(spec) {
    const policy = (spec.policies || []).find((item) => item && /빈/.test(item.title || ""));
    if (!policy) return "빈 목록일 때 보여 줄 문장이 없습니다.";
    if (hasUserSentence(policy.detail || "")) return "";
    return "정책 ‘빈 상태’는 목록이 없을 때를 말하지만, 사용자에게 보일 문장이 없습니다.";
  }

  function ruleKey(screenId, title) {
    return String(screenId || "") + "|" + String(title || "");
  }

  const FIXABLE = { "QA-64": true, "QA-65": true, "QA-66": true, "QA-67": true, "QA-68": true };

  const APPLY_HINT = {
    "QA-64": "제한을 넘기거나 어긋나면 더 이상 입력되지 않고, 필드 아래에 보일 문장까지 화면별 상세에 적습니다.",
    "QA-65": "오류로 보여 줄 문장을 따옴표로 화면설계서에 적습니다.",
    "QA-66": "칸이 비어 있으면 진행을 막고, 그때 보여 줄 문장을 화면별 상세에 적습니다.",
    "QA-67": "로그인에 실패하면 보여 줄 문장을 정책에 적습니다.",
    "QA-68": "목록이 없을 때 보여 줄 문장을 정책에 적습니다."
  };

  function canApplyFix(testId) {
    return !!FIXABLE[testId];
  }

  function applyHint(testId) {
    return APPLY_HINT[testId] || "";
  }

  function screenNameOf(spec, id) {
    const found = (spec.screens || []).find((item) => item && item.id === id);
    return found ? found.name : (id || "다음");
  }

  function splitSentences(rule) {
    return String(rule || "")
      .split(/(?<=[.。])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function quotedMessage(sentence) {
    const found = String(sentence || "").match(/[‘'「“"]([^’'」”"]{2,})[’'」”"]/);
    return found ? found[1] : "";
  }

  function situationOf(sentence) {
    if (/비어 있으면|값이 없으면|입력하지 않으면/.test(sentence)) return "비어 있음";
    const over = sentence.match(/(\d+)자를 넘기면/);
    if (over) return over[1] + "자를 넘김";
    const under = sentence.match(/(\d+)자보다 짧으면/);
    if (under) return under[1] + "자보다 짧음";
    if (/한글이나 숫자를 입력하면/.test(sentence)) return "한글이나 숫자를 입력";
    if (/영문이나 숫자를 입력하면/.test(sentence)) return "영문이나 숫자를 입력";
    if (/숫자 외 글자를 입력하면/.test(sentence)) return "숫자 외 글자를 입력";
    if (/형식이 아니면/.test(sentence)) return "형식이 아님";
    if (/누르면/.test(sentence) && /이동/.test(sentence)) return "누르면";
    if (/하나만 선택/.test(sentence)) return "필터를 고름";
    if (/항목을 누르면/.test(sentence)) return "항목을 누름";
    return "";
  }

  function actionLabel(sentence) {
    const message = quotedMessage(sentence);
    const kind = /컨펌|확인하시|취소|진행하시겠/.test(sentence) ? "컨펌창" : ((message || /보여|표시/.test(sentence)) ? "alert" : "");
    const steps = [];
    if (/진행을 막/.test(sentence)) steps.push("진행을 막음");
    if (/더 이상 입력되지/.test(sentence)) steps.push("더 이상 입력되지 않음");
    if (/키 입력을 막/.test(sentence)) steps.push("키 입력을 막음");
    if (/입력한 값은 그대로|입력값은 그대로/.test(sentence)) steps.push("입력값 유지");
    if (kind && message) steps.push(kind + " ‘" + message + "’");
    else if (kind) steps.push(kind);
    if (/화면으로 이동/.test(sentence)) {
      const target = sentence.match(/누르면\s+(.+?)\s*화면으로 이동/);
      steps.push((target ? target[1] : "다음") + " 화면으로 이동");
    }
    return steps.join(". ");
  }

  function situationRank(situation) {
    if (situation === "비어 있음") return 1;
    if (/자보다 짧음/.test(situation)) return 2;
    if (/자를 넘김/.test(situation)) return 3;
    if (/입력$/.test(situation)) return 4;
    if (situation === "형식이 아님") return 5;
    return 6;
  }

  function actionRows(rule, title, kind) {
    const text = String(rule || "");
    const rows = [];
    const seen = {};
    function push(row) {
      if (!row || !row.situation || seen[row.situation]) return;
      seen[row.situation] = true;
      rows.push(row);
    }
    splitSentences(text).forEach((sentence) => {
      const situation = situationOf(sentence);
      const action = actionLabel(sentence);
      if (situation && action) push({ situation: situation, action: action });
    });
    const name = josa(title || "입력값", ["은", "는"]);
    const object = josa(title || "입력값", ["을", "를"]);
    if (kind === "field") push({ situation: "비어 있음", action: "진행을 막음. alert ‘" + object + " 입력해 주세요.’" });
    if (/영문만/.test(text)) push({ situation: "한글이나 숫자를 입력", action: "키 입력을 막음. alert ‘영문만 입력할 수 있습니다.’" });
    if (/한글만/.test(text)) push({ situation: "영문이나 숫자를 입력", action: "키 입력을 막음. alert ‘한글만 입력할 수 있습니다.’" });
    if (/숫자만/.test(text)) push({ situation: "숫자 외 글자를 입력", action: "키 입력을 막음. alert ‘숫자만 입력할 수 있습니다.’" });
    const max = text.match(/최대\s*(\d+)\s*자/);
    if (max) push({ situation: max[1] + "자를 넘김", action: "더 이상 입력되지 않음. alert ‘" + name + " 최대 " + max[1] + "자까지 입력할 수 있습니다.’" });
    const min = text.match(/최소\s*(\d+)\s*자/);
    if (min) push({ situation: min[1] + "자보다 짧음", action: "진행을 막음. alert ‘" + name + " " + min[1] + "자 이상 입력해 주세요.’" });
    if (/이메일 형식/.test(text)) push({ situation: "형식이 아님", action: "alert ‘올바른 이메일 주소를 입력해 주세요.’" });
    if (/시간 형식/.test(text)) push({ situation: "형식이 아님", action: "alert ‘시간을 다시 확인해 주세요.’" });
    if (/가림/.test(text)) push({ situation: "입력 중", action: "입력값을 가림" });
    rows.sort((a, b) => situationRank(a.situation) - situationRank(b.situation));
    if (rows.length) return rows;
    const plain = text.trim();
    if (!plain) return [];
    return [{ situation: "기본", action: plain.replace(/[.。]$/, "") }];
  }

  function fieldNotes(spec) {
    const screens = (spec && spec.screens) || [];
    return screens.map((screen, index) => {
      const major = index + 1;
      const notes = [];
      const add = (title, rule, kind) => {
        const saved = spec.fieldRules && spec.fieldRules[ruleKey(screen.id, title)];
        const text = saved || rule;
        const no = major + "-" + (notes.length + 1);
        notes.push({
          no: no,
          title: title,
          rule: text,
          kind: kind || "",
          rows: actionRows(text, title, kind),
          questions: developerQuestions(title, text).map((question) => no + " " + question)
        });
      };
      (screen.blocks || []).forEach((block) => {
        if (!block) return;
        if (block.type === "form") {
          (block.fields || []).forEach((field) => {
            const label = fieldLabelOf(field);
            if (label) add(label, fieldRule(label), "field");
          });
        } else if (block.type === "search") {
          add("검색", "한글과 영문 가능. 최대 30자.");
        } else if (block.type === "cta") {
          add(block.label || "버튼", "누르면 " + screenNameOf(spec, block.to) + " 화면으로 이동합니다.");
        } else if (block.type === "chips") {
          add("필터", "하나만 선택합니다. 고른 값이 목록에 바로 반영됩니다.");
        } else if (block.type === "cards") {
          add("카드 목록", "항목을 누르면 연결된 화면으로 이동합니다.");
        } else if (block.type === "list") {
          add("목록", "항목을 누르면 연결된 화면으로 이동합니다.");
        } else if (block.type === "notice") {
          add("안내", String(block.text || "안내 문구를 보여 줍니다.").slice(0, 80));
        } else if (block.type === "map") {
          add("지도", "현재 위치 주변을 보여 줍니다.");
        } else if (block.type === "chat") {
          add("대화", "한글과 영문 가능. 메시지당 최대 200자.");
        } else if (block.type === "stats") {
          add("요약 수치", "조회 전용입니다. 눌러도 값이 바뀌지 않습니다.");
        }
      });
      if (!notes.length) add(screen.name || "화면", screen.purpose || "이 화면의 내용을 확인합니다.");
      return { id: screen.id, notes: notes };
    });
  }

  function runQualityQA(spec) {
    const tests = [];

    function check(id, category, name, ok, detail, level) {
      const status = ok ? "pass" : (level === "warn" ? "warn" : "fail");
      tests.push({
        id: id,
        category: category,
        name: name,
        status: status,
        detail: detail,
        fixable: status === "fail" && canApplyFix(id),
        applyHint: applyHint(id)
      });
    }

    if (!spec || typeof spec !== "object" || !Array.isArray(spec.screens)) {
      check("QA-00", "문서 기본", "검사할 화면설계서가 있다", false, "화면설계서 데이터가 없습니다.");
      return summarize(tests, null);
    }

    const screens = spec.screens;
    const features = spec.features || {};
    const walk = simulate(screens);
    const byId = {};
    screens.forEach((screen) => {
      if (screen && screen.id && !byId[screen.id]) byId[screen.id] = screen;
    });
    const names = screens.map((screen) => screen && screen.name).filter(Boolean);
    const nameSet = new Set(names);
    const roots = new Set(tabRootIds(screens));

    check(
      "QA-01",
      "문서 기본",
      "서비스 이름이 있다",
      typeof spec.name === "string" && spec.name.trim().length >= 1,
      spec.name ? "서비스 이름은 '" + spec.name + "'입니다." : "서비스 이름이 비어 있습니다."
    );
    check(
      "QA-02",
      "문서 기본",
      "프롬프트 원문이 문서에 남아 있다",
      typeof spec.prompt === "string" && spec.prompt.trim().length >= 4,
      spec.prompt ? "원문 프롬프트를 요구사항의 출처로 보존했습니다." : "원문 프롬프트가 없습니다."
    );
    check(
      "QA-03",
      "문서 기본",
      "도메인과 작성 시각이 있다",
      !!spec.domain && !!spec.createdAt && !Number.isNaN(Date.parse(spec.createdAt)),
      spec.domain ? "도메인은 " + spec.domain + "입니다." : "도메인 또는 작성 시각이 없습니다."
    );

    check(
      "QA-10",
      "화면 정의",
      "화면이 4개 이상이다",
      screens.length >= 4,
      "정의된 화면은 " + screens.length + "개입니다."
    );

    const ids = screens.map((screen) => screen && screen.id);
    const dup = ids.filter((id, index) => id && ids.indexOf(id) !== index);
    check(
      "QA-11",
      "화면 정의",
      "화면 ID가 중복되지 않는다",
      dup.length === 0,
      dup.length ? "중복 ID: " + dup.join(", ") : "화면 ID " + ids.length + "개가 모두 다릅니다."
    );

    const incomplete = screens.filter((screen) => {
      return !screen || !screen.id || !screen.name || !(screen.purpose || "").trim() || !(screen.blocks || []).length;
    });
    check(
      "QA-12",
      "화면 정의",
      "모든 화면에 이름, 목적, 구성 요소가 있다",
      incomplete.length === 0,
      incomplete.length
        ? "빠진 화면: " + incomplete.map((screen) => (screen && (screen.name || screen.id)) || "이름 없음").join(", ")
        : "모든 화면에 이름, 목적, 블록이 있습니다."
    );

    check(
      "QA-13",
      "화면 정의",
      "홈 화면이 있다",
      !!(byId.home && (byId.home.blocks || []).length),
      byId.home ? "홈에서 주요 행동으로 진입할 수 있습니다." : "홈 화면이 없습니다."
    );

    const needBack = screens.filter((screen) => screen && screen.id && !roots.has(screen.id) && !screen.back);
    check(
      "QA-14",
      "화면 정의",
      "탭 루트가 아닌 화면은 뒤로가기가 있다",
      needBack.length === 0,
      needBack.length
        ? "뒤로가기가 없는 화면: " + needBack.map((screen) => screen.name || screen.id).join(", ")
        : "하위 화면은 이전 화면으로 돌아갈 수 있습니다."
    );

    const formScreens = screens.filter((screen) => (screen.blocks || []).some((block) => block && block.type === "form"));
    const badForms = formScreens.filter((screen) => {
      const fields = (screen.blocks || [])
        .filter((block) => block && block.type === "form")
        .flatMap((block) => block.fields || []);
      const cta = (screen.blocks || []).find((block) => block && block.type === "cta" && block.to);
      return !fields.length || fields.some((field) => !String(field).trim()) || !cta;
    });
    if (!formScreens.length) {
      check("QA-15", "화면 정의", "입력 화면에 필드와 제출 버튼이 있다", false, "사용자가 정보를 입력하는 화면이 없습니다.", "warn");
    } else if (badForms.length) {
      check(
        "QA-15",
        "화면 정의",
        "입력 화면에 필드와 제출 버튼이 있다",
        false,
        "필드 또는 제출 이동이 없는 화면: " + badForms.map((screen) => screen.name || screen.id).join(", ")
      );
    } else {
      check(
        "QA-15",
        "화면 정의",
        "입력 화면에 필드와 제출 버튼이 있다",
        true,
        formScreens.length + "개 입력 화면에 필드와 제출 버튼이 있습니다."
      );
    }

    check(
      "QA-20",
      "이동 경로",
      "버튼과 카드가 실제 화면으로만 이동한다",
      walk.broken.length === 0,
      walk.broken.length
        ? walk.broken.map((link) => link.fromName + "에서 '" + link.to + "' 화면을 찾을 수 없습니다.").join(" ")
        : "끊긴 이동이 없습니다."
    );
    check(
      "QA-21",
      "이동 경로",
      "홈과 탭에서 모든 화면에 도달할 수 있다",
      walk.unreachable.length === 0,
      walk.unreachable.length
        ? "도달하지 못한 화면: " + walk.unreachable.map((screen) => screen.name).join(", ")
        : walk.order.length + "개 화면을 클릭 경로로 모두 방문했습니다."
    );

    const successLinked = screens.some((screen) => linksFrom(screen).indexOf("success") !== -1);
    check(
      "QA-22",
      "이동 경로",
      "완료 화면이 핵심 행동 뒤에 연결되어 있다",
      !!byId.success && successLinked,
      byId.success && successLinked
        ? "처리 뒤 완료 화면으로 이어집니다."
        : "완료 화면이 없거나, 어떤 버튼도 완료 화면으로 가지 않습니다."
    );

    const core = (spec.flows || [])[0];
    check(
      "QA-30",
      "사용자 흐름",
      "핵심 흐름이 3단계 이상이다",
      !!(core && core.steps && core.steps.length >= 3),
      core && core.steps ? "핵심 흐름은 " + core.steps.join(" → ") + " 입니다." : "핵심 사용자 흐름이 없습니다."
    );

    const badSteps = [];
    (spec.flows || []).forEach((flow) => {
      (flow.steps || []).forEach((step) => {
        if (!nameSet.has(step)) badSteps.push((flow.name || "흐름") + ": " + step);
      });
    });
    check(
      "QA-31",
      "사용자 흐름",
      "흐름의 각 단계가 실제 화면 이름이다",
      (spec.flows || []).length > 0 && badSteps.length === 0,
      badSteps.length ? "화면과 맞지 않는 단계: " + badSteps.join(", ") : "모든 흐름 단계가 화면 정의와 일치합니다."
    );

    const expectedIa = screens.filter((screen) => screen && screen.id !== "success").map((screen) => screen.name);
    const ia = spec.ia || [];
    const iaSame = expectedIa.length === ia.length && expectedIa.every((name, index) => name === ia[index]);
    check(
      "QA-32",
      "사용자 흐름",
      "정보구조가 화면 목록과 같다",
      iaSame,
      iaSame ? "IA " + ia.length + "개 항목이 화면 목록과 같습니다." : "IA와 화면 목록이 다릅니다. 화면: " + expectedIa.join(", ")
    );

    check(
      "QA-40",
      "요구사항 추적",
      "핵심 요구사항이 2개 이상이다",
      (spec.requirements || []).length >= 2,
      "요구사항 " + (spec.requirements || []).length + "개를 추적합니다."
    );
    check(
      "QA-42",
      "요구사항 추적",
      "사용자 유형이 2명 이상이다",
      (spec.personas || []).length >= 2,
      (spec.personas || []).length ? (spec.personas || []).join(", ") : "사용자 유형이 없습니다."
    );

    const screenBlob = JSON.stringify(screens);
    const reqBlob = (spec.requirements || []).join("\n");
    const componentBlob = JSON.stringify(spec.components || []);
    if (features.chat) {
      const ok = screens.some((screen) => screen.id === "chat");
      check("QA-43", "요구사항 추적", "채팅 요구가 대화 화면으로 있다", ok, ok ? "대화 화면이 있습니다." : "채팅을 요구했는데 대화 화면이 없습니다.");
    }
    if (features.map) {
      const ok = screens.some((screen) => (screen.blocks || []).some((block) => block && block.type === "map"));
      check("QA-44", "요구사항 추적", "위치·동네 요구가 지도로 표현된다", ok, ok ? "지도 블록이 있습니다." : "동네 또는 위치 요구가 있는데 지도가 없습니다.");
    }
    if (features.loyalty) {
      const ok = screens.some((screen) => screen.id === "reward");
      check("QA-45", "요구사항 추적", "적립 요구가 혜택 화면으로 있다", ok, ok ? "혜택 화면이 있습니다." : "스탬프·포인트 요구가 있는데 혜택 화면이 없습니다.");
    }
    if (features.pay) {
      const ok = screenBlob.indexOf("결제") !== -1 || componentBlob.indexOf("결제") !== -1;
      check("QA-46", "요구사항 추적", "결제 요구가 화면 또는 컴포넌트에 있다", ok, ok ? "결제 수단이 명세에 있습니다." : "결제 요구가 화면과 컴포넌트에 없습니다.");
    }
    if (features.schedule) {
      const ok = /시간|예약/.test(screenBlob);
      check("QA-47", "요구사항 추적", "예약 요구가 시간 선택으로 이어진다", ok, ok ? "예약 시간 선택이 화면에 있습니다." : "예약 요구가 있는데 시간 선택이 없습니다.");
    }
    if (features.admin) {
      const ok = /운영자|관리|승인/.test(reqBlob + screenBlob);
      check("QA-48", "요구사항 추적", "운영·승인 요구가 문서에 반영된다", ok, ok ? "운영·승인 요구가 문서에 있습니다." : "운영자 요구가 문서에 반영되지 않았습니다.");
    }
    if (features.notify) {
      const ok = screenBlob.indexOf("알림") !== -1;
      check("QA-49", "요구사항 추적", "알림 요구가 화면 안내에 있다", ok, ok ? "알림 항목이 있습니다." : "알림 요구가 화면에 없습니다.");
    }

    const components = spec.components || [];
    const badComponents = components.filter((item) => !item || !item.name || !item.spec || !item.states);
    check(
      "QA-50",
      "컴포넌트",
      "공통 컴포넌트 3개 이상에 규칙과 상태가 있다",
      components.length >= 3 && badComponents.length === 0,
      badComponents.length
        ? "규칙 또는 상태가 빈 컴포넌트가 있습니다."
        : "공통 컴포넌트 " + components.length + "개를 정의했습니다."
    );
    const hasCta = components.some((item) => item && /CTA|버튼/.test(item.name || "") && item.states);
    check(
      "QA-51",
      "컴포넌트",
      "주 행동 버튼의 상태 규칙이 있다",
      hasCta,
      hasCta ? "주 행동 버튼의 기본, 로딩, 비활성 상태를 정의했습니다." : "주 행동 버튼의 상태 규칙이 없습니다."
    );

    function policy(title) {
      return (spec.policies || []).find((item) => item && (item.title || "").indexOf(title) !== -1 && (item.detail || "").trim());
    }
    check("QA-60", "정책", "빈 상태 정책이 있다", !!policy("빈"), policy("빈") ? policy("빈").detail : "데이터가 없을 때의 다음 행동이 없습니다.");
    check("QA-61", "정책", "오류·재시도 정책이 있다", !!policy("오류"), policy("오류") ? policy("오류").detail : "네트워크 실패와 입력 오류 정책이 없습니다.");
    check("QA-62", "정책", "권한 요청 정책이 있다", !!policy("권한"), policy("권한") ? policy("권한").detail : "위치·알림 권한을 언제 요청하는지 없습니다.");
    const a11y = policy("접근성");
    check(
      "QA-63",
      "정책",
      "접근성 기준에 터치 크기와 색 구분이 있다",
      !!(a11y && /44|터치/.test(a11y.detail) && /색/.test(a11y.detail)),
      a11y ? a11y.detail : "접근성 정책이 없습니다."
    );

    const questions = [];
    fieldNotes(spec).forEach((screen) => {
      (screen.notes || []).forEach((note) => {
        (note.questions || []).forEach((question) => questions.push(question));
      });
    });
    check(
      "QA-64",
      "개발 질문",
      "입력 제한을 넘겼을 때의 동작이 정해져 있다",
      questions.length === 0,
      questions.length
        ? "개발자가 구현 전에 막히는 질문이 있습니다. " + questions.join(" ")
        : "입력 제한을 넘는 경우의 동작이 화면설계에 적혀 있습니다."
    );

    const copyGaps = errorCopyGaps(spec);
    check(
      "QA-65",
      "개발 질문",
      "오류로 보여 줄 문장이 적혀 있다",
      copyGaps.length === 0,
      copyGaps.length
        ? "오류를 보여 준다고 되어 있지만 문장이 없습니다. " + copyGaps.join(" ")
        : "오류로 보여 줄 문장이 화면설계에 적혀 있습니다."
    );

    const emptyGaps = emptyFieldGaps(spec);
    check(
      "QA-66",
      "개발 질문",
      "입력 칸이 비었을 때의 문장이 적혀 있다",
      emptyGaps.length === 0,
      emptyGaps.length
        ? "개발자가 빈 값 처리를 정할 수 없습니다. " + emptyGaps.join(" ")
        : "비어 있는 입력의 문장이 화면설계에 적혀 있습니다."
    );

    const login = loginScreen(spec);
    const loginGap = login && !hasLoginFailureCopy(spec);
    check(
      "QA-67",
      "개발 질문",
      "로그인 실패 문장이 적혀 있다",
      !loginGap,
      loginGap
        ? (login.name || "로그인") + " 화면은 성공만 이어지고, 아이디나 비밀번호가 틀렸을 때 보여 줄 문장이 없습니다."
        : (login ? "로그인 실패 문장이 화면설계에 적혀 있습니다." : "로그인 화면이 없어 실패 문장을 요구하지 않습니다.")
    );

    const listGap = emptyListGap(spec);
    check(
      "QA-68",
      "개발 질문",
      "빈 목록에서 보여 줄 문장이 적혀 있다",
      !listGap,
      listGap || "빈 목록에서 보여 줄 문장이 화면설계에 적혀 있습니다."
    );

    const unknown = [];
    screens.forEach((screen) => {
      (screen.blocks || []).forEach((block) => {
        if (block && block.type && !KNOWN_BLOCKS[block.type]) unknown.push((screen.name || screen.id) + ": " + block.type);
      });
    });
    check(
      "QA-70",
      "프로토타입",
      "모든 블록을 프로토타입이 그릴 수 있다",
      unknown.length === 0,
      unknown.length ? "알 수 없는 블록: " + unknown.join(", ") : "화면 블록이 모두 프로토타입 렌더러에 있습니다."
    );

    const multiCta = screens.filter((screen) => (screen.blocks || []).filter((block) => block && block.type === "cta").length > 1);
    check(
      "QA-80",
      "프로토타입",
      "주 행동 버튼은 화면당 하나다",
      multiCta.length === 0,
      multiCta.length
        ? "버튼이 둘 이상인 화면: " + multiCta.map((screen) => screen.name || screen.id).join(", ")
        : "각 화면의 주 행동은 하나입니다.",
      "warn"
    );

    const blankSearch = [];
    screens.forEach((screen) => {
      (screen.blocks || []).forEach((block) => {
        if (block && block.type === "search" && !(block.placeholder || "").trim()) blankSearch.push(screen.name || screen.id);
      });
    });
    check(
      "QA-81",
      "프로토타입",
      "검색바에는 안내 문구가 있다",
      blankSearch.length === 0,
      blankSearch.length ? "플레이스홀더가 없는 화면: " + blankSearch.join(", ") : "검색 안내 문구가 있습니다.",
      "warn"
    );

    const shortPurpose = screens.filter((screen) => screen && (screen.purpose || "").trim().length < 8);
    check(
      "QA-82",
      "프로토타입",
      "화면 목적이 한 문장으로 적혀 있다",
      shortPurpose.length === 0,
      shortPurpose.length
        ? "목적이 너무 짧은 화면: " + shortPurpose.map((screen) => screen.name || screen.id).join(", ")
        : "각 화면의 목적을 문장으로 구분했습니다.",
      "warn"
    );

    return summarize(tests, walk);
  }

  function remember(spec, text) {
    if (!Array.isArray(spec.revisions)) spec.revisions = [];
    spec.revisions.push({ text: text });
  }

  function applyQualityFix(spec, testId) {
    if (!spec || typeof spec !== "object" || !Array.isArray(spec.screens)) {
      return { ok: false, message: "반영할 화면설계서가 없습니다." };
    }
    if (!canApplyFix(testId)) {
      return { ok: false, message: "이 실패는 화면설계서에 자동으로 넣을 수 없습니다." };
    }
    if (!spec.fieldRules || typeof spec.fieldRules !== "object") spec.fieldRules = {};
    let applied = 0;

    if (testId === "QA-64") {
      fieldNotes(spec).forEach((screen) => {
        (screen.notes || []).forEach((note) => {
          if (!note.questions || !note.questions.length) return;
          const next = completeRule(note.rule, note.title);
          if (next === note.rule) return;
          spec.fieldRules[ruleKey(screen.id, note.title)] = next;
          applied += 1;
        });
      });
      if (!applied) return { ok: false, message: "반영할 입력 제한 질문이 없습니다." };
      remember(spec, "품질 검사의 입력 제한 질문을 화면설계서에 반영했습니다. 넘기거나 어긋나면 입력을 막고 보일 문장까지 적었습니다.");
      return { ok: true, spec: spec, applied: applied, message: "입력 제한을 넘겼을 때의 동작과 문장을 화면별 상세 " + applied + "개 항목에 반영했습니다." };
    }

    if (testId === "QA-65") {
      fieldNotes(spec).forEach((screen) => {
        (screen.notes || []).forEach((note) => {
          const next = supplyErrorCopy(note.title, note.rule);
          if (next === note.rule) return;
          spec.fieldRules[ruleKey(screen.id, note.title)] = next;
          applied += 1;
        });
      });
      (spec.policies || []).forEach((policy) => {
        const detail = (policy && policy.detail) || "";
        if (!(unnamedError(detail) || (saysShowsError(detail) && !hasUserSentence(detail)))) return;
        policy.detail = "네트워크에 실패하면 ‘연결을 확인한 뒤 다시 시도해 주세요.’를 보여주고 재시도 버튼을 제공합니다. 입력 오류는 화면별 상세에 적은 따옴표 문장을 해당 필드 아래에 보여줍니다.";
        applied += 1;
      });
      if (!applied) return { ok: false, message: "반영할 오류 문구가 없습니다." };
      remember(spec, "품질 검사에서 빠진 오류 문구를 화면설계서에 반영했습니다.");
      return { ok: true, spec: spec, applied: applied, message: "오류로 보여 줄 문장을 화면설계서 " + applied + "곳에 반영했습니다." };
    }

    if (testId === "QA-66") {
      fieldNotes(spec).forEach((screen) => {
        (screen.notes || []).forEach((note) => {
          if (note.kind !== "field") return;
          const text = note.rule || "";
          if (/선택|비워\s*둘|없어도/.test(text)) return;
          if (/비어 있으면|값이 없으면|입력하지 않으면/.test(text) && hasUserSentence(text)) return;
          const sentence = "비어 있으면 진행을 막고 필드 아래에 ‘" + josa(note.title, ["을", "를"]) + " 입력해 주세요.’를 보여줍니다.";
          spec.fieldRules[ruleKey(screen.id, note.title)] = text.replace(/\s*$/, "") + " " + sentence;
          applied += 1;
        });
      });
      if (!applied) return { ok: false, message: "반영할 빈 값 문장이 없습니다." };
      remember(spec, "품질 검사에서 입력 칸이 비었을 때의 문장을 화면설계서에 반영했습니다.");
      return { ok: true, spec: spec, applied: applied, message: "비어 있을 때 보여 줄 문장을 " + applied + "개 항목에 반영했습니다." };
    }

    if (testId === "QA-67") {
      if (hasLoginFailureCopy(spec) || !loginScreen(spec)) return { ok: false, message: "반영할 로그인 실패 문장이 없습니다." };
      if (!Array.isArray(spec.policies)) spec.policies = [];
      spec.policies.push({
        title: "로그인 실패",
        detail: "아이디와 비밀번호가 맞지 않으면 ‘아이디 또는 비밀번호가 올바르지 않습니다.’를 보여 주고, 입력한 값은 그대로 둡니다."
      });
      remember(spec, "품질 검사에서 로그인 실패 문장을 정책에 반영했습니다.");
      return { ok: true, spec: spec, applied: 1, message: "로그인 실패 문장을 정책에 반영했습니다." };
    }

    const listGap = emptyListGap(spec);
    if (!listGap) return { ok: false, message: "반영할 빈 목록 문장이 없습니다." };
    const policy = (spec.policies || []).find((item) => item && /빈/.test(item.title || ""));
    const detail = "목록이 없을 때 ‘아직 항목이 없습니다.’를 보여주고, 등록 또는 새로고침으로 이어집니다.";
    if (policy) policy.detail = detail;
    else {
      if (!Array.isArray(spec.policies)) spec.policies = [];
      spec.policies.push({ title: "빈 상태", detail: detail });
    }
    remember(spec, "품질 검사에서 빈 목록 문장을 정책에 반영했습니다.");
    return { ok: true, spec: spec, applied: 1, message: "빈 목록에서 보여 줄 문장을 정책에 반영했습니다." };
  }

  const api = {
    runQualityQA: runQualityQA,
    fieldNotes: fieldNotes,
    actionRows: actionRows,
    applyQualityFix: applyQualityFix,
    canApplyFix: canApplyFix,
    applyHint: applyHint
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ProtoQA = api;
})(typeof window !== "undefined" ? window : globalThis);
