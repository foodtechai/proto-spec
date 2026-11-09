const { generateFromPrompt, reviseFromPrompt, applyModelScreens } = require("./generate.js");
const { runQualityQA, applyQualityFix, fieldNotes, actionRows } = require("./qa.js");

const EXAMPLES = [
  "우리 동네 카페를 예약하고 스탬프를 적립하는 앱",
  "중고 물건을 동네에서 직거래하는 마켓",
  "직원 출퇴근과 휴가 승인을 처리하는 사내 근태 서비스",
  "강아지 산책 예약을 잡고 채팅으로 조율하는 앱",
  "오늘 먹을 음식을 주문하고 배달 현황을 보는 서비스",
  "동네 카페를 예약하고 결제하고 채팅으로 문의하며 스탬프를 적립하고 알림을 받는 앱. 사장님 승인도 필요합니다."
];

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("ok  " + name);
  } catch (error) {
    failed += 1;
    console.error("FAIL " + name);
    console.error("     " + error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

EXAMPLES.forEach((prompt) => {
  test("구조는 통과하고 문장이 비어 있는 개발 질문만 실패한다: " + prompt.slice(0, 24), () => {
    const report = runQualityQA(generateFromPrompt(prompt));
    const bad = structuralFails(report);
    if (bad.length) throw new Error(bad.map((item) => item.id + " " + item.detail).join("\n"));
    ["QA-64", "QA-65", "QA-66", "QA-68"].forEach((id) => {
      const item = report.tests.find((test) => test.id === id);
      assert(item && item.status === "fail", id + " " + (item && item.detail));
    });
    const loginFail = report.tests.find((item) => item.id === "QA-67");
    assert(loginFail && loginFail.status === "pass", loginFail && loginFail.detail);
    assert(report.grade === "보완 필요", report.grade);
    assert(report.walk.unreachable.length === 0, "unreachable");
    assert(report.walk.broken.length === 0, "broken");
    assert(report.total >= 20, "too few tests");
  });
});

test("끊긴 이동은 실패한다", () => {
  const spec = generateFromPrompt(EXAMPLES[0]);
  spec.screens[0].blocks.push({ type: "cta", label: "없는 곳", to: "missing-screen" });
  const report = runQualityQA(spec);
  const item = report.tests.find((test) => test.id === "QA-20");
  assert(item && item.status === "fail", item && item.detail);
  assert(report.grade === "보완 필요", report.grade);
});

test("도달할 수 없는 화면은 실패한다", () => {
  const spec = JSON.parse(JSON.stringify(generateFromPrompt(EXAMPLES[4])));
  spec.screens.push({
    id: "orphan",
    name: "숨은 화면",
    purpose: "어디에서도 열 수 없는 화면입니다",
    blocks: [{ type: "notice", text: "고아" }],
    back: true
  });
  const report = runQualityQA(spec);
  const item = report.tests.find((test) => test.id === "QA-21");
  assert(item && item.status === "fail", item && item.detail);
});

test("로그인 요건은 로그인 화면으로 새로 만든다", () => {
  const login = generateFromPrompt("아이디 비밀번호 치고 로그인하는 화면");
  const hair = generateFromPrompt("헤어샵 디자이너를 예약하는 앱");
  assert(login.screens[0].name === "로그인", login.screens[0].name);
  assert(JSON.stringify(login.screens).indexOf("비밀번호") !== -1, "password field missing");
  assert(!hair.screens.some((screen) => screen.name === "로그인"), "login screen leaked");
  assert(JSON.stringify(hair.screens).indexOf("헤어샵") !== -1, "hair missing");
  const loginQa = runQualityQA(login);
  const loginBad = structuralFails(loginQa);
  if (loginBad.length) {
    throw new Error(loginBad.map((item) => item.id + " " + item.detail).join("\n"));
  }
  const limit = loginQa.tests.find((item) => item.id === "QA-64");
  assert(limit && limit.status === "fail" && limit.fixable === true, limit && limit.detail);
  assert(limit.detail.indexOf("1-1 아이디는 최대 20자") !== -1, limit.detail);
  assert(limit.detail.indexOf("20자를 넘기면") !== -1, limit.detail);
  const copy = loginQa.tests.find((item) => item.id === "QA-65");
  assert(copy && copy.status === "fail" && copy.detail.indexOf("문장") !== -1, copy && copy.detail);
  const auth = loginQa.tests.find((item) => item.id === "QA-67");
  assert(auth && auth.status === "fail" && auth.detail.indexOf("틀렸을 때") !== -1, auth && auth.detail);
});

test("오류를 보여 준다고만 적으면 문장이 없어 실패하고, 적용하면 문장이 남는다", () => {
  const spec = generateFromPrompt("아이디 비밀번호 치고 로그인하는 화면");
  spec.fieldRules = {
    "home|아이디": "영문만 가능. 최대 20자. 20자를 넘기면 더 이상 입력되지 않고 필드 아래에 오류를 보여줍니다. 한글이나 숫자를 입력하면 키 입력을 막고 오류 문구를 보여줍니다."
  };
  const before = runQualityQA(spec);
  const copy = before.tests.find((item) => item.id === "QA-65");
  assert(copy && copy.status === "fail" && copy.detail.indexOf("1-1 아이디는") !== -1, copy && copy.detail);
  assert(copy.detail.indexOf("사용자에게 보일 문장이 없습니다") !== -1, copy.detail);
  const applied = applyQualityFix(spec, "QA-65");
  assert(applied.ok, applied.message);
  const idNote = fieldNotes(spec)[0].notes.find((note) => note.title === "아이디");
  assert(idNote.rule.indexOf("‘아이디는 최대 20자까지 입력할 수 있습니다.’") !== -1, idNote.rule);
  assert(idNote.rule.indexOf("‘영문만 입력할 수 있습니다.’") !== -1, idNote.rule);
  assert(idNote.rule.indexOf("오류를 보여줍니다") === -1, idNote.rule);
  const after = runQualityQA(spec);
  assert(after.tests.find((item) => item.id === "QA-65").status === "pass", after.tests.find((item) => item.id === "QA-65").detail);
});

test("실패 항목의 화면설계서 적용은 동작과 문장을 적고 검사를 통과시킨다", () => {
  const spec = generateFromPrompt("아이디 비밀번호 치고 로그인하는 화면");
  ["QA-64", "QA-65", "QA-66", "QA-67", "QA-68"].forEach((id) => {
    const applied = applyQualityFix(spec, id);
    assert(applied.ok, id + " " + applied.message);
  });
  const report = runQualityQA(spec);
  assert(report.fail === 0, report.tests.filter((item) => item.status === "fail").map((item) => item.id + " " + item.detail).join("\n"));
  const idNote = fieldNotes(spec)[0].notes.find((note) => note.title === "아이디");
  assert(idNote && idNote.no === "1-1", idNote && idNote.no);
  assert(idNote.rule.indexOf("‘아이디는 최대 20자까지 입력할 수 있습니다.’") !== -1, idNote.rule);
  assert(idNote.rule.indexOf("‘영문만 입력할 수 있습니다.’") !== -1, idNote.rule);
  assert(idNote.rule.indexOf("‘아이디를 입력해 주세요.’") !== -1, idNote.rule);
  const rows = actionRows(idNote.rule);
  assert(rows[0].situation === "비어 있음" && rows[0].action.indexOf("alert ‘아이디를 입력해 주세요.’") !== -1, JSON.stringify(rows));
  assert(rows.some((row) => row.situation === "20자를 넘김" && row.action.indexOf("alert ‘아이디는 최대 20자까지 입력할 수 있습니다.’") !== -1), JSON.stringify(rows));
  assert(rows.some((row) => row.situation === "한글이나 숫자를 입력" && row.action.indexOf("키 입력을 막음. alert ‘영문만 입력할 수 있습니다.’") !== -1), JSON.stringify(rows));
  assert(rows.every((row) => row.action.indexOf("컨펌창") === -1), JSON.stringify(rows));
  const plain = actionRows("영문만 가능. 최대 20자.", "아이디", "field");
  assert(plain[0].situation === "비어 있음" && plain[0].action === "진행을 막음. alert ‘아이디를 입력해 주세요.’", JSON.stringify(plain));
  assert(plain.some((row) => row.situation === "20자를 넘김" && row.action === "더 이상 입력되지 않음. alert ‘아이디는 최대 20자까지 입력할 수 있습니다.’"), JSON.stringify(plain));
  assert(plain.some((row) => row.situation === "한글이나 숫자를 입력" && row.action === "키 입력을 막음. alert ‘영문만 입력할 수 있습니다.’"), JSON.stringify(plain));
  const password = fieldNotes(spec)[0].notes.find((note) => note.title === "비밀번호");
  assert(password.rule.indexOf("‘비밀번호는 8자 이상 입력해 주세요.’") !== -1, password.rule);
  assert(password.rule.indexOf("‘비밀번호는 최대 20자까지 입력할 수 있습니다.’") !== -1, password.rule);
  const policy = spec.policies.find((item) => item.title === "로그인 실패");
  assert(policy && policy.detail.indexOf("‘아이디 또는 비밀번호가 올바르지 않습니다.’") !== -1, policy && policy.detail);
  assert(!applyQualityFix(spec, "QA-64").ok, "already applied");
  assert(!applyQualityFix(spec, "QA-20").ok, "other failures stay manual");
});

test("다른 프롬프트는 다른 프로토타입이다", () => {
  const cafe = generateFromPrompt("카페 좌석을 예약하는 앱");
  const hair = generateFromPrompt("헤어샵 디자이너를 예약하는 앱");
  const cafeText = JSON.stringify(cafe.screens);
  const hairText = JSON.stringify(hair.screens);
  assert(cafeText !== hairText, "screens identical");
  assert(cafeText.indexOf("카페") !== -1, "cafe missing");
  assert(hairText.indexOf("헤어샵") !== -1, "hair missing");
  assert(cafeText.indexOf("헤어샵") === -1, "previous topic leaked into cafe");
  assert(hairText.indexOf("카페") === -1, "previous topic leaked into hair");
  assert(structuralFails(runQualityQA(cafe)).length === 0, "cafe qa");
  assert(structuralFails(runQualityQA(hair)).length === 0, "hair qa");
});

function structuralFails(report) {
  return report.tests.filter((item) => item.status !== "pass" && !/^QA-6[4-8]$/.test(item.id));
}

function assertPass(spec, label) {
  const report = runQualityQA(spec);
  const bad = structuralFails(report);
  if (bad.length) {
    throw new Error(label + " " + report.grade + " " + report.score + "\n" + bad.map((item) => item.id + " " + item.detail).join("\n"));
  }
}

test("생성된 화면의 수정은 기존 프로토타입을 유지한다", () => {
  const cafe = generateFromPrompt("우리 동네 카페를 예약하고 스탬프를 적립하는 앱");
  const before = JSON.stringify(cafe.screens);
  const result = reviseFromPrompt(cafe, "채팅으로 문의하는 화면을 추가해줘", { screenId: "home" });
  assert(JSON.stringify(cafe.screens) === before, "original mutated");
  assert(result.spec.prompt === cafe.prompt, "prompt replaced");
  assert(result.spec.domainId === cafe.domainId, "domain replaced");
  assert(result.spec.screens.some((screen) => screen.id === "chat"), "chat missing");
  assert(result.spec.screens.some((screen) => screen.id === "reward"), "reward dropped");
  assert(JSON.stringify(result.spec.screens).indexOf("카페") !== -1, "cafe dropped");
  cafe.screens.forEach((screen) => {
    assert(result.spec.screens.some((item) => item.id === screen.id), "lost " + screen.id);
  });
  assert(result.spec.revisions.length === 1, "revision history");
  assertPass(result.spec, "revise chat");
});

test("기능 삭제는 해당 화면만 걷어 낸다", () => {
  const spec = generateFromPrompt("강아지 산책 예약을 잡고 채팅으로 조율하는 앱");
  const result = reviseFromPrompt(spec, "채팅 화면은 빼줘");
  assert(!result.spec.screens.some((screen) => screen.id === "chat"), "chat remains");
  assert(result.spec.features.chat === false, "chat flag");
  assert(result.spec.screens.some((screen) => screen.id === "home"), "home dropped");
  assert(JSON.stringify(result.spec.screens).indexOf("강아지") !== -1, "topic dropped");
  assertPass(result.spec, "remove chat");
});

test("거래 화면에서 채팅을 빼도 이동이 남는다", () => {
  const spec = generateFromPrompt("중고 물건을 동네에서 직거래하는 마켓");
  const result = reviseFromPrompt(spec, "채팅 화면은 빼줘");
  assert(!result.spec.screens.some((screen) => screen.id === "chat"), "market chat remains");
  assert(JSON.stringify(result.spec.screens).indexOf("직거래") !== -1 || result.spec.domainId === "market", "market dropped");
  assertPass(result.spec, "market remove chat");
});

test("문구 수정은 화면 구성을 유지한다", () => {
  const spec = generateFromPrompt("오늘 먹을 음식을 주문하고 배달 현황을 보는 서비스");
  const result = reviseFromPrompt(spec, "홈 제목을 오늘먹자로 바꿔줘", { screenId: "home" });
  const home = result.spec.screens.find((screen) => screen.id === "home");
  const hero = home.blocks.find((block) => block.type === "hero");
  assert(hero.title === "오늘먹자", hero.title);
  assert(result.spec.screens.length === spec.screens.length, "screen count changed");
  assertPass(result.spec, "rename hero");
});

test("수정 입력은 재생성과 다르다", () => {
  const cafe = generateFromPrompt("카페 좌석을 예약하는 앱");
  const edited = reviseFromPrompt(cafe, "리뷰를 추가해줘").spec;
  const rebuilt = generateFromPrompt("리뷰를 추가해줘");
  assert(edited.prompt.indexOf("카페") !== -1, "edit lost prompt");
  assert(JSON.stringify(edited.screens).indexOf("카페") !== -1, "edit lost cafe");
  assert(/후기|리뷰/.test(JSON.stringify(edited.screens)), "review missing");
  assert(rebuilt.prompt === "리뷰를 추가해줘", rebuilt.prompt);
  assert(JSON.stringify(rebuilt.screens).indexOf("카페") === -1, "regenerate kept cafe");
  assertPass(edited, "edit review");
});

test("로그인 입력칸 안내와 클릭 입력을 반영한다", () => {
  const spec = generateFromPrompt("아이디 비밀번호 입력 가능한 로그인 화면");
  const typed = reviseFromPrompt(spec, "아이디 placehoder을 아이디 입력으로 바꿔줘", { screenId: "home" });
  const form = typed.spec.screens[0].blocks.find((block) => block.type === "form");
  assert(form.placeholders["아이디"] === "아이디 입력", JSON.stringify(form.placeholders));
  const legacy = reviseFromPrompt(spec, "아이디을(를) 입력을 아이디 입력으로 해줘", { screenId: "home" });
  const legacyForm = legacy.spec.screens[0].blocks.find((block) => block.type === "form");
  assert(legacyForm.placeholders["아이디"] === "아이디 입력", JSON.stringify(legacyForm.placeholders));
  const click = reviseFromPrompt(spec, "아이디 클릭 시 입력 되도록 해죠", { screenId: "home" });
  assert(click.changes.some((line) => line.indexOf("아이디") !== -1 && line.indexOf("눌러") !== -1), click.changes.join(" / "));
  assertPass(typed.spec, "placeholder");
  assertPass(click.spec, "click to type");
});

test("아니라 뒤의 제목으로 고치고 그 화면을 연다", () => {
  const spec = generateFromPrompt("가입자 리스트 화면을 만들어죠");
  const result = reviseFromPrompt(spec, "홈 제목을 가입자가 아니라 회원목으로 수정해줘", { screenId: "form" });
  const home = result.spec.screens.find((screen) => screen.id === "home");
  const hero = home.blocks.find((block) => block.type === "hero");
  assert(hero.title === "회원목", hero.title);
  assert(result.focusId === "home", result.focusId);
  assertPass(result.spec, "title instead");
});

test("모델이 고친 화면은 품질 검사를 통과한다", () => {
  const spec = generateFromPrompt("가입자 리스트 화면을 만들어죠");
  const screens = JSON.parse(JSON.stringify(spec.screens));
  const hero = screens.find((screen) => screen.id === "home").blocks.find((block) => block.type === "hero");
  hero.title = "회원목";
  screens.push({
    id: "members",
    name: "회원목록",
    purpose: "회원 목록을 확인하고 다음 화면으로 이동한다",
    blocks: [{ type: "notice", text: "회원 목록" }, { type: "cta", label: "없는 곳", to: "missing-screen" }]
  });
  const applied = applyModelScreens(spec, screens, "홈 제목을 회원목으로", {
    focusId: "home",
    changes: ["홈 제목을 회원목으로 바꿨습니다."]
  });
  assert(applied.ok, applied.reason);
  const nextHero = applied.spec.screens.find((screen) => screen.id === "home").blocks.find((block) => block.type === "hero");
  assert(nextHero.title === "회원목", nextHero.title);
  assert(applied.spec.prompt === spec.prompt, "prompt changed");
  assert(applied.focusId === "home", applied.focusId);
  assertPass(applied.spec, "model screens");
});

test("화면설계서가 없으면 실패한다", () => {
  const report = runQualityQA(null);
  assert(report.fail === 1, "expected one failure");
  assert(report.tests[0].id === "QA-00");
});

if (failed) {
  console.error("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall passed");
