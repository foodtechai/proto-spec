(function (global) {
  const DOMAINS = [
    { id: "booking", label: "예약/방문", keywords: ["예약", "부킹", "방문", "좌석", "미용", "헤어", "식당 예약", "카페 예약", "스튜디오", "상담 예약"] },
    { id: "delivery", label: "주문/배달", keywords: ["배달", "주문", "음식", "맛집", "메뉴", "라이더"] },
    { id: "commerce", label: "커머스", keywords: ["쇼핑", "구매", "커머스", "장바구니", "상품", "스토어", "쇼핑몰"] },
    { id: "market", label: "중고/거래", keywords: ["중고", "거래", "판매", "나눔", "마켓플레이스", "직거래"] },
    { id: "social", label: "소셜/커뮤니티", keywords: ["커뮤니티", "sns", "피드", "팔로우", "게시글", "모임", "동호회"] },
    { id: "edu", label: "교육", keywords: ["학습", "강의", "수업", "교육", "과제", "수강", "튜터"] },
    { id: "health", label: "헬스케어", keywords: ["병원", "진료", "건강", "약", "환자", "의료", "증상"] },
    { id: "work", label: "업무/기업", keywords: ["근태", "출퇴근", "업무", "승인", "휴가", "사내", "인사", "프로젝트"] },
    { id: "money", label: "금융", keywords: ["가계부", "송금", "자산", "카드", "금융", "투자", "정산"] },
    { id: "travel", label: "여행", keywords: ["여행", "숙소", "항공", "코스", "관광", "호텔"] },
    { id: "fit", label: "피트니스", keywords: ["운동", "헬스", "피트니스", "루틴", "칼로리", "PT"] },
    { id: "pet", label: "펫", keywords: ["강아지", "고양이", "펫", "산책", "반려동물"] }
  ];

  function tokenize(text) {
    return (text || "")
      .toLowerCase()
      .split(/[\s,/·.\n"'“”]+/)
      .filter((t) => t && t.length > 1);
  }

  function detectDomain(text) {
    const raw = text.toLowerCase();
    let best = { id: "saas", label: "서비스 플랫폼", score: 0 };
    DOMAINS.forEach((d) => {
      const score = d.keywords.reduce((n, k) => n + (raw.includes(k) ? 2 : 0), 0);
      if (score > best.score) best = { id: d.id, label: d.label, score };
    });
    return best;
  }

  function extractName(text) {
    const quoted = text.match(/[“"']([^"'“”]{2,20})[”"']/);
    if (quoted) return quoted[1].trim();
    const named = text.match(/([가-힣A-Za-z0-9]{2,12})\s*(앱|서비스|플랫폼|사이트)/);
    if (named && !/(하고|하는|싶은|위한|되는)$/.test(named[1])) return named[1];
    return null;
  }

  function pickPalette(domainId) {
    const map = {
      booking: { hero: "#2f4a3e", cta: "#c45c26" },
      delivery: { hero: "#7a2e1f", cta: "#d35400" },
      commerce: { hero: "#1f3a5f", cta: "#c45c26" },
      market: { hero: "#3d2b1f", cta: "#c45c26" },
      social: { hero: "#3b2d4a", cta: "#c45c26" },
      edu: { hero: "#243e54", cta: "#c45c26" },
      health: { hero: "#1f4a45", cta: "#2f6b4f" },
      work: { hero: "#2c333a", cta: "#c45c26" },
      money: { hero: "#1f3d2f", cta: "#2f6b4f" },
      travel: { hero: "#2a4a62", cta: "#c45c26" },
      fit: { hero: "#2b2b2b", cta: "#c45c26" },
      pet: { hero: "#5a3d2b", cta: "#c45c26" },
      saas: { hero: "#2f4a3e", cta: "#c45c26" }
    };
    return map[domainId] || map.saas;
  }

  function hasAny(text, words) {
    return words.some((w) => text.includes(w));
  }

  function inferFeatures(text) {
    return {
      chat: hasAny(text, ["채팅", "문의", "메시지", "상담"]),
      pay: hasAny(text, ["결제", "구매", "주문", "송금"]),
      map: hasAny(text, ["지도", "위치", "근처", "동네", "주변"]),
      review: hasAny(text, ["리뷰", "후기", "별점"]),
      loyalty: hasAny(text, ["포인트", "스탬프", "쿠폰", "적립"]),
      admin: hasAny(text, ["관리자", "사장님", "운영", "승인"]),
      notify: hasAny(text, ["알림", "푸시", "리마인드"]),
      schedule: hasAny(text, ["일정", "캘린더", "예약", "스케줄"])
    };
  }

  function defaultName(domain, text) {
    const skip = ["만들고", "싶은", "서비스", "서비스를", "사용자가", "할수", "하는", "앱을", "기능을", "우리", "오늘", "직원", "사내", "조금", "바로", "동네", "근처"];
    const nouns = (text.match(/[가-힣]{2,10}/g) || [])
      .map((n) => n.replace(/(을|를|이|가|은|는|의|에|에서|으로|로)$/, ""))
      .filter((n) => n.length >= 2 && !skip.includes(n) && !/(하고|하는|싶은|부터|까지)$/.test(n));
    const hit = nouns[0];
    const prefix = {
      booking: "예약",
      delivery: "오더",
      commerce: "스토어",
      market: "마켓",
      social: "라운지",
      edu: "클래스",
      health: "케어",
      work: "워크",
      money: "월렛",
      travel: "트립",
      fit: "핏",
      pet: "펫",
      saas: "스튜디오"
    }[domain] || "서비스";
    if (!hit) return prefix;
    if (domain === "booking" && !hit.includes("예약")) return (hit + "예약").slice(0, 8);
    return hit.slice(0, 8);
  }

  function screen(id, name, purpose, kind, blocks, opts) {
    return Object.assign({ id, name, purpose, kind, blocks, tab: false, back: false }, opts || {});
  }

  function extractTopics(text) {
    const stop = {
      만들고: 1, 싶은: 1, 서비스: 1, 앱: 1, 앱을: 1, 기능: 1, 우리: 1, 오늘: 1,
      직원: 1, 사내: 1, 조금: 1, 바로: 1, 그리고: 1, 있으면: 1, 좋겠습니다: 1,
      해주세요: 1, 하는: 1, 위해: 1, 위한: 1, 사용자: 1, 화면: 1, 프로토타입: 1,
      입력: 1, 재입력: 1, 기존: 1, 새로운: 1, 해당: 1, 요건: 1, 맞는: 1
    };
    const weak = {
      동네: 1, 근처: 1, 주변: 1, 오늘: 1, 바로: 1, 지금: 1, 여기: 1, 가장: 1,
      처리: 1, 현황: 1, 확인: 1, 진행: 1, 이용: 1, 사용: 1, 관련: 1
    };
    const words = (text || "").match(/[가-힣A-Za-z0-9]{2,12}/g) || [];
    const topics = [];
    words.forEach((word) => {
      const normalized = word
        .replace(/(을|를|이|가|은|는|와|과|도|만|의|에서|으로|로|에)$/, "")
        .replace(/(하고|하며|하는|싶은|으면|고)$/, "");
      if (normalized.length < 2 || stop[normalized] || topics.indexOf(normalized) !== -1) return;
      topics.push(normalized);
    });
    topics.sort((a, b) => (weak[a] ? 1 : 0) - (weak[b] ? 1 : 0));
    return topics.slice(0, 6);
  }

  function applyPromptContent(screens, ctx) {
    const topics = ctx.topics || [];
    if (!topics.length) return;
    const lead = topics[0];
    const promptLine = (ctx.prompt || "").replace(/\s+/g, " ").trim();
    const home = screens.find((s) => s.id === "home");
    if (home) {
      (home.blocks || []).forEach((block) => {
        if (block.type === "hero") block.subtitle = promptLine.slice(0, 42);
        if (block.type === "search") block.placeholder = lead + " 검색";
        if (block.type === "chips") block.items = topics.slice(0, 4);
        if (block.type === "cards") {
          (block.items || []).forEach((item, index) => {
            const topic = topics[index];
            if (!item || !topic) return;
            item.title = topic;
            item.meta = (topics[index + 2] || ctx.name) + " · 이번 요청";
          });
        }
      });
    }
    const list = screens.find((s) => s.id === "list");
    if (list) {
      if (ctx.domain === "booking" || (ctx.features && ctx.features.schedule)) list.name = lead + " 예약";
      else if (["탐색", "둘러보기", "강의", "거래글", "업무함"].indexOf(list.name) !== -1) list.name = lead;
      list.purpose = lead + " 항목을 고르고 다음 단계로 이동한다";
      (list.blocks || []).forEach((block) => {
        if (block.type === "search") block.placeholder = lead + " 검색";
        if (block.type === "chips") block.items = topics.slice(0, 4);
        if (block.type === "map") block.text = lead + " 주변";
        if (block.type === "notice") block.text = topics.slice(0, 3).join(", ") + " 기준으로 보여 줍니다.";
        if (block.type === "cards" || block.type === "list") {
          (block.items || []).forEach((item, index) => {
            if (!item || typeof item !== "object" || item.to !== "detail") return;
            const topic = topics[index] || lead;
            item.title = topic;
          });
        }
      });
    }
    const detail = screens.find((s) => s.id === "detail");
    if (detail) {
      detail.name = lead + " 상세";
      detail.purpose = lead + "의 정보와 다음 행동을 제공한다";
      (detail.blocks || []).forEach((block) => {
        if (block.type === "hero") {
          block.title = lead;
          block.subtitle = topics.slice(1, 3).join(" · ") || ctx.name;
        }
        if (block.type === "notice") block.text = promptLine.slice(0, 80);
      });
    }
    const form = screens.find((s) => s.id === "form");
    if (form) {
      (form.blocks || []).forEach((block) => {
        if (block.type === "hero") block.subtitle = lead;
        if (block.type === "form" && Array.isArray(block.fields) && block.fields.indexOf(lead) === -1) {
          block.fields = [lead].concat(block.fields).slice(0, 4);
        }
      });
    }
    const chat = screens.find((s) => s.id === "chat");
    if (chat) {
      (chat.blocks || []).forEach((block) => {
        if (block.type === "chat" && block.messages && block.messages[0]) {
          block.messages[0].text = lead + " 관련해서 문의드려요.";
        }
      });
    }
    const success = screens.find((s) => s.id === "success");
    if (success) {
      (success.blocks || []).forEach((block) => {
        if (block.type === "hero") block.subtitle = lead + " 요청이 처리되었습니다.";
      });
    }
  }

  function isLoginPrompt(text, domain) {
    const aboutLogin = /로그인/.test(text || "") && /아이디|비밀번호|이메일|계정|패스워드|화면/.test(text || "");
    if (!aboutLogin) return false;
    if (domain && domain.score >= 2 && !/화면/.test(text || "")) return false;
    return true;
  }

  function buildLoginScreens(ctx) {
    const line = (ctx.prompt || "").replace(/\s+/g, " ").trim();
    return [
      screen("home", "로그인", "아이디와 비밀번호로 로그인한다", "form", [
        { type: "hero", title: "로그인", subtitle: line.slice(0, 42) },
        { type: "form", fields: ["아이디", "비밀번호"] },
        { type: "cta", label: "로그인", to: "success" }
      ], { tab: "home" }),
      screen("list", "회원가입", "새 계정의 아이디와 비밀번호를 만든다", "form", [
        { type: "form", fields: ["이름", "아이디", "비밀번호"] },
        { type: "cta", label: "가입하기", to: "success" }
      ], { tab: "list" }),
      screen("my", "비밀번호 찾기", "아이디로 비밀번호를 다시 설정한다", "form", [
        { type: "form", fields: ["아이디", "이메일"] },
        { type: "cta", label: "재설정 링크 받기", to: "success" }
      ], { tab: "my" }),
      screen("success", "로그인 완료", "로그인한 뒤 다음 화면으로 안내한다", "result", [
        { type: "hero", title: "로그인되었습니다", subtitle: line.slice(0, 42) },
        { type: "cta", label: "처음으로", to: "home" }
      ], { back: true })
    ];
  }

  function buildScreens(ctx) {
    const { name, domain, features, prompt } = ctx;
    const subject = prompt.replace(/\s+/g, " ").slice(0, 42);
    const screens = [];

    screens.push(screen("home", "홈", "핵심 가치를 보여주고 주요 행동으로 진입", "home", [
      { type: "hero", title: name, subtitle: subject || "필요한 일을 더 단순하게" },
      { type: "search", placeholder: "검색해보세요" },
      { type: "chips", items: ["추천", "근처", "인기", "신규"] },
      { type: "stats", items: [{ k: "이용자", v: "1.2k" }, { k: "오늘", v: "36" }, { k: "만족", v: "4.8" }] },
      { type: "cards", items: primaryCards(domain, name) }
    ], { tab: "home" }));

    if (domain === "booking" || features.schedule) {
      screens.push(screen("list", "예약하기", "가능한 대상/시간을 고른다", "list", [
        { type: "search", placeholder: "장소 또는 담당자 검색" },
        { type: "chips", items: ["오늘", "내일", "주말", "야간"] },
        { type: features.map ? "map" : "notice", text: features.map ? "내 주변 가능 장소" : "예약 가능한 항목" },
        { type: "cards", items: [
          { title: "오전 10:00", meta: "1시간 · 바로 확정", to: "detail", emoji: "🕙" },
          { title: "오후 2:00", meta: "인기 시간대", to: "detail", emoji: "🕑" },
          { title: "오후 7:00", meta: "잔여 2명", to: "detail", emoji: "🕖" }
        ] }
      ], { tab: "list" }));
      screens.push(screen("form", "예약 확인", "일시·옵션·요청사항을 입력하고 확정", "form", [
        { type: "hero", title: "예약 정보를 확인하세요", subtitle: name },
        { type: "form", fields: ["이름", "연락처", "희망 시간", "요청사항"] },
        { type: "cta", label: "예약 확정하기", to: "success" }
      ], { back: true }));
    } else if (domain === "delivery" || domain === "commerce") {
      screens.push(screen("list", "둘러보기", "상품/메뉴를 탐색하고 비교", "list", [
        { type: "chips", items: ["전체", "인기", "할인", "신규"] },
        { type: "cards", items: [
          { title: "추천 상품 A", meta: "12,000원 · 별 4.7", to: "detail", emoji: "🛍️" },
          { title: "추천 상품 B", meta: "9,800원 · 별 4.5", to: "detail", emoji: "✨" },
          { title: "세트 구성", meta: "함께 구매 시 할인", to: "detail", emoji: "🎁" }
        ] }
      ], { tab: "list" }));
      screens.push(screen("form", "주문/결제", "수령 정보와 결제를 완료", "form", [
        { type: "form", fields: ["수령 방법", "주소/위치", "요청사항", "결제 수단"] },
        { type: "cta", label: features.pay ? "결제하기" : "주문하기", to: "success" }
      ], { back: true }));
    } else if (domain === "market") {
      screens.push(screen("list", "거래글", "동네 매물을 탐색", "list", [
        { type: "search", placeholder: "물건, 동네 검색" },
        { type: "cards", items: [
          { title: "거의 새것 아이템", meta: "5분 전 · 2.4km", to: "detail", emoji: "📦" },
          { title: "나눔합니다", meta: "오늘 · 800m", to: "detail", emoji: "🤝" },
          { title: "내 물건 올리기", meta: "판매 · 나눔", to: "form", emoji: "✏️" }
        ] }
      ], { tab: "list" }));
      screens.push(screen("form", "글쓰기", "판매/나눔 글을 등록", "form", [
        { type: "form", fields: ["제목", "가격", "거래 방식", "설명"] },
        { type: "cta", label: "등록하기", to: "success" }
      ], { back: true }));
    } else if (domain === "edu") {
      screens.push(screen("list", "강의", "학습 콘텐츠 목록", "list", [
        { type: "cards", items: [
          { title: "입문 01. 시작하기", meta: "12분 · 진행 0%", to: "detail", emoji: "📘" },
          { title: "실습 과제", meta: "오늘 마감", to: "form", emoji: "✏️" }
        ] }
      ], { tab: "list" }));
      screens.push(screen("form", "과제 제출", "과제를 작성하고 제출한다", "form", [
        { type: "form", fields: ["과제명", "내용", "첨부"] },
        { type: "cta", label: "제출하기", to: "success" }
      ], { back: true }));
    } else if (domain === "work") {
      screens.push(screen("list", "업무함", "승인·할 일·공지 처리", "list", [
        { type: "stats", items: [{ k: "대기", v: "4" }, { k: "오늘", v: "2" }, { k: "완료", v: "18" }] },
        { type: "list", items: [
          { title: "휴가 승인 요청", meta: "인사팀 · 2시간 전", to: "detail" },
          { title: "주간 보고서", meta: "오늘 18:00까지", to: "form" }
        ] }
      ], { tab: "list" }));
      screens.push(screen("form", "요청 작성", "승인 문서를 제출", "form", [
        { type: "form", fields: ["유형", "기간/금액", "사유"] },
        { type: "cta", label: "제출하기", to: "success" }
      ], { back: true }));
    } else {
      screens.push(screen("list", "탐색", "핵심 콘텐츠를 탐색", "list", [
        { type: "search", placeholder: "검색" },
        { type: "cards", items: [
          { title: "추천 항목 1", meta: "지금 시작하기 좋은 항목", to: "detail", emoji: "⭐" },
          { title: "추천 항목 2", meta: "사용자 반응이 좋은 항목", to: "detail", emoji: "🔥" }
        ] }
      ], { tab: "list" }));
      screens.push(screen("form", "요청하기", "필요한 정보를 입력하고 요청을 보낸다", "form", [
        { type: "form", fields: ["제목", "내용", "연락처"] },
        { type: "cta", label: "보내기", to: "success" }
      ], { back: true }));
    }

    screens.push(screen("detail", "상세", "한 항목의 정보와 다음 행동을 제공", "detail", [
      { type: "hero", title: "상세 정보", subtitle: name + "의 핵심 항목" },
      { type: "notice", text: "운영 정책, 이용 조건, 포함 내역이 이 영역에 표시됩니다." },
      features.review ? { type: "list", items: [{ title: "최근 후기", meta: "친절하고 설명이 명확했어요" }] } : { type: "stats", items: [{ k: "조회", v: "128" }, { k: "저장", v: "24" }, { k: "공유", v: "6" }] },
      { type: "cta", label: ctaLabel(domain, features), to: domain === "market" ? "chat" : (features.schedule || domain === "booking" ? "form" : "form") }
    ], { back: true }));

    if (features.chat || domain === "market" || domain === "social") {
      screens.push(screen("chat", "대화", "상대와 실시간으로 조율", "chat", [
        { type: "chat", messages: [
          { me: false, text: "안녕하세요. 이용 가능할까요?" },
          { me: true, text: "네, 지금 확인 후 안내드릴게요." },
          { me: false, text: "감사합니다. 시간만 맞으면 바로 진행할게요." }
        ] }
      ], { tab: "chat", back: true }));
    }

    if (features.loyalty) {
      screens.push(screen("reward", "혜택", "스탬프/쿠폰/포인트를 확인하고 사용", "list", [
        { type: "hero", title: "스탬프 7/10", subtitle: "3번 더 이용하면 무료 혜택" },
        { type: "list", items: [
          { title: "신규 가입 쿠폰", meta: "7일 남음" },
          { title: "단골 리워드", meta: "사용 가능" }
        ] }
      ], { tab: "my", back: true }));
    }

    const myItems = [
      { title: "이용 내역", meta: "최근 활동 보기", to: "list" },
      { title: "알림 설정", meta: features.notify ? "푸시 켜짐" : "기기 알림" },
      { title: "고객 지원", meta: "문의하기" }
    ];
    if (features.loyalty) myItems.unshift({ title: "스탬프와 혜택", meta: "적립 현황", to: "reward" });

    screens.push(screen("my", "마이", "계정, 이력, 설정", "profile", [
      { type: "hero", title: "나", subtitle: "프로필 · 이용 이력 · 알림" },
      { type: "list", items: myItems }
    ], { tab: "my" }));

    screens.push(screen("success", "완료", "다음 행동을 안내하는 결과 화면", "result", [
      { type: "hero", title: "완료되었습니다", subtitle: "처리 결과를 확인하고 이력을 볼 수 있습니다." },
      { type: "cta", label: "홈으로", to: "home" }
    ], { back: true }));

    if (features.map) {
      const list = screens.find((s) => s.id === "list");
      if (list && !(list.blocks || []).some((b) => b.type === "map")) {
        list.blocks.splice(Math.min(1, list.blocks.length), 0, { type: "map", text: "내 주변 기준" });
      }
    }

    applyPromptContent(screens, { name, domain, features, prompt, topics: ctx.topics || [] });
    return screens;
  }

  function primaryCards(domain, name) {
    const sets = {
      booking: [
        { title: "지금 예약 가능", meta: "가장 빠른 빈자리", to: "list", emoji: "📅" },
        { title: "단골 장소", meta: "최근 이용한 " + name, to: "detail", emoji: "⭐" }
      ],
      delivery: [
        { title: "근처 인기 메뉴", meta: "30분 내 도착", to: "list", emoji: "🛵" },
        { title: "재주문", meta: "지난 주 주문", to: "detail", emoji: "🔁" }
      ],
      commerce: [
        { title: "오늘의 추천", meta: "개인화 상품", to: "list", emoji: "🛒" },
        { title: "특가", meta: "오늘 마감", to: "detail", emoji: "🏷️" }
      ],
      market: [
        { title: "우리 동네 새 글", meta: "방금 올라온 거래", to: "list", emoji: "📍" },
        { title: "관심 목록", meta: "저장한 매물", to: "detail", emoji: "🤍" }
      ],
      work: [
        { title: "출근하기", meta: "위치 확인 후 기록", to: "form", emoji: "🏢" },
        { title: "대기 중인 승인", meta: "4건", to: "list", emoji: "☑️" }
      ],
      edu: [
        { title: "이어서 학습", meta: "진도 42%", to: "detail", emoji: "▶️" },
        { title: "오늘 과제", meta: "마감 21:00", to: "list", emoji: "📝" }
      ]
    };
    return sets[domain] || [
      { title: "시작하기", meta: "가장 중요한 행동", to: "list", emoji: "🚀" },
      { title: "살펴보기", meta: name + " 둘러보기", to: "detail", emoji: "👀" }
    ];
  }

  function ctaLabel(domain, features) {
    if (domain === "booking" || features.schedule) return "예약하기";
    if (domain === "delivery") return "주문하기";
    if (domain === "commerce" || features.pay) return "구매하기";
    if (domain === "market") return "채팅하기";
    if (domain === "edu") return "수강하기";
    if (domain === "work") return "처리하기";
    return "계속하기";
  }

  function buildFlows(screens, domain, features) {
    const names = Object.fromEntries(screens.map((s) => [s.id, s.name]));
    const flows = [
      { name: "핵심 이용 흐름", steps: ["home", "list", "detail", "form", "success"].filter((id) => names[id]).map((id) => names[id]) },
      { name: "재방문 흐름", steps: [names.home, names.my, names.list].filter(Boolean) }
    ];
    if (features.chat || screens.some((s) => s.id === "chat")) {
      flows.push({ name: "문의/조율 흐름", steps: [names.detail, names.chat, names.form || names.success].filter(Boolean) });
    }
    if (domain === "work") {
      flows.push({ name: "승인 흐름", steps: [names.list, names.form, names.success].filter(Boolean) });
    }
    return flows;
  }

  function buildComponents(domain, features) {
    const list = [
      { name: "GNB/하단 탭", spec: "홈, 탐색, 마이 고정. 현재 위치 강조.", states: "default / selected / disabled" },
      { name: "검색바", spec: "플레이스홀더, 최근 검색, 결과 없음 상태 포함.", states: "empty / typing / result" },
      { name: "리스트 카드", spec: "썸네일, 제목, 메타, 배지. 탭 시 상세 이동.", states: "default / pressed / sold-out" },
      { name: "1차 CTA", spec: "화면당 하나의 주 행동. 하단 고정 가능.", states: "default / loading / disabled" }
    ];
    if (features.schedule) list.push({ name: "타임슬롯", spec: "날짜+시간 선택. 마감 슬롯은 비활성.", states: "available / selected / full" });
    if (features.chat) list.push({ name: "채팅 버블", spec: "발신/수신 구분, 시간, 읽음.", states: "sent / delivered" });
    if (features.pay) list.push({ name: "결제 수단 선택", spec: "카드/간편결제. 실패 시 재시도.", states: "selected / error" });
    if (domain === "work") list.push({ name: "승인 상태 칩", spec: "대기/승인/반려 색 구분.", states: "pending / approved / rejected" });
    return list;
  }

  function generateFromPrompt(prompt) {
    const text = (prompt || "").trim();
    const domain = detectDomain(text);
    const features = inferFeatures(text);
    const topics = extractTopics(text);
    const named = extractName(text);
    const topicName = topics[0]
      ? (domain.id === "booking" && topics[0].indexOf("예약") === -1 ? (topics[0] + "예약").slice(0, 8) : topics[0].slice(0, 8))
      : null;
    const login = isLoginPrompt(text, domain);
    const name = login ? "로그인" : (named || topicName || defaultName(domain.id, text));
    const palette = pickPalette(login ? "saas" : domain.id);
    const tagline = text.split(/[.!?\n]/)[0].slice(0, 48) || name + "를 더 쉽게";
    const screens = login
      ? buildLoginScreens({ name, prompt: text })
      : buildScreens({ name, domain: domain.id, features, prompt: text, topics });
    const tabs = login
      ? [{ id: "home", label: "로그인" }, { id: "list", label: "가입" }, { id: "my", label: "찾기" }]
      : null;
    const ia = screens.filter((s) => s.id !== "success").map((s) => s.name);
    return {
      createdAt: new Date().toISOString(),
      prompt: text,
      name,
      tagline,
      domain: login ? "로그인" : domain.label,
      domainId: login ? "login" : domain.id,
      tabs,
      palette,
      features,
      personas: personasFor(domain.id),
      screens,
      ia,
      flows: buildFlows(screens, domain.id, features),
      components: buildComponents(domain.id, features),
      policies: [
        { title: "빈 상태", detail: "목록이 없을 때 원인과 다음 행동(등록/새로고침)을 함께 제시한다." },
        { title: "권한", detail: "위치·알림·카메라 권한은 실제 기능 직전에 맥락과 함께 요청한다." },
        { title: "오류", detail: "네트워크 실패 시 재시도 버튼을 제공하고, 입력 오류는 필드 단위로 표시한다." },
        { title: "접근성", detail: "주요 버튼 높이 44px 이상, 색만으로 상태를 구분하지 않는다." }
      ],
      requirements: extractRequirements(text, features)
    };
  }

  function personasFor(domainId) {
    const map = {
      booking: ["처음 방문하는 고객", "단골 고객", "매장 운영자"],
      delivery: ["바쁜 직장인", "재주문 사용자", "사장님"],
      commerce: ["가격 비교형 구매자", "브랜드 충성 고객"],
      market: ["판매자", "구매자", "동네 주민"],
      edu: ["입문자", "과제 제출이 급한 수강생"],
      work: ["직원", "팀장(승인자)", "관리자"],
      health: ["초진 환자", "재진 환자"],
      pet: ["반려인", "산책/돌봄 제공자"]
    };
    return map[domainId] || ["신규 사용자", "재방문 사용자", "운영자"];
  }

  function extractRequirements(text, features) {
    const req = ["프롬프트에 적힌 핵심 시나리오를 홈에서 1탭 안에 시작한다."];
    if (features.map) req.push("현재 위치 또는 동네 기준으로 결과를 보여준다.");
    if (features.schedule) req.push("가능한 시간을 먼저 보여주고 확정까지 이어진다.");
    if (features.loyalty) req.push("이용 후 스탬프/포인트가 적립되며 혜택 화면에서 확인한다.");
    if (features.chat) req.push("상세에서 바로 대화할 수 있다.");
    if (features.pay) req.push("결제 수단 선택과 실패 재시도를 포함한다.");
    if (features.admin) req.push("운영자용 승인/관리 화면을 2차 범위로 명시한다.");
    req.push("원문 요구: “" + text.slice(0, 80) + (text.length > 80 ? "…" : "") + "”");
    return req;
  }

  function cloneSpec(spec) {
    return JSON.parse(JSON.stringify(spec));
  }

  function splitClauses(text) {
    return String(text || "")
      .replace(/하고(?=\s)/g, "\n")
      .replace(/하며/g, "\n")
      .replace(/없고/g, "없고\n")
      .replace(/말고/g, "말고\n")
      .split(/[\n,.]+/)
      .map((clause) => clause.trim())
      .filter(Boolean);
  }

  function wantsRemoval(clause) {
    return /삭제|제거|빼\s*줘|빼주|없애|지워|필요\s*없|말고/.test(clause || "");
  }

  function isCopyClause(clause) {
    return /제목|버튼|문구|플레이스홀더|서비스명|앱 이름/.test(clause)
      || /이름(?:을|를)?\s+\S+\s*(?:으로|로)\s*(?:바꿔|변경|수정)/.test(clause);
  }

  function takePhrase(clause, pattern) {
    const found = clause.match(pattern);
    if (!found) return "";
    let value = String(found[1] || "")
      .replace(/^[“"'\s]+|[”"'\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const instead = value.match(/(?:아니라|아니고|말고)\s+(.+)$/);
    if (instead) value = instead[1].trim();
    return value.slice(0, 24);
  }

  function uniqueId(spec, base) {
    const ids = new Set(spec.screens.map((item) => item.id));
    let id = base;
    let n = 2;
    while (ids.has(id)) {
      id = base + n;
      n += 1;
    }
    return id;
  }

  function retarget(spec, id) {
    const fallback = spec.screens.some((item) => item.id === "form" && item.id !== id) ? "form" : "home";
    spec.screens.forEach((item) => {
      if (item.id === id) return;
      (item.blocks || []).forEach((block) => {
        if (block.to === id) {
          if (block.type === "cta" && /채팅/.test(block.label || "")) block.label = "계속하기";
          block.to = fallback;
        }
        if (Array.isArray(block.items)) {
          block.items = block.items.filter((entry) => {
            return !(entry && entry.to === id && /채팅으로 문의|스탬프와 혜택/.test(entry.title || ""));
          });
          block.items.forEach((entry) => {
            if (entry && entry.to === id) entry.to = fallback;
          });
        }
      });
    });
    spec.screens = spec.screens.filter((item) => item.id !== id);
    if (Array.isArray(spec.tabs)) spec.tabs = spec.tabs.filter((tab) => tab.id !== id);
  }

  function hostList(spec, preferId) {
    const host = spec.screens.find((item) => item.id === preferId) || spec.screens.find((item) => item.id === "home");
    if (!host) return null;
    let list = (host.blocks || []).find((block) => block.type === "list" || block.type === "cards");
    if (!list) {
      list = { type: "list", items: [] };
      const ctaAt = host.blocks.findIndex((block) => block.type === "cta");
      if (ctaAt >= 0) host.blocks.splice(ctaAt, 0, list);
      else host.blocks.push(list);
    }
    if (!Array.isArray(list.items)) list.items = [];
    return list;
  }

  function linkItem(spec, preferId, item) {
    const list = hostList(spec, preferId);
    if (!list) return;
    const exists = list.items.some((entry) => entry && entry.to === item.to && entry.title === item.title);
    if (!exists) list.items.push(item);
  }

  function formBlock(spec, preferId) {
    const preferred = spec.screens.find((item) => item.id === preferId);
    const preferredBlock = preferred && (preferred.blocks || []).find((block) => block.type === "form");
    if (preferredBlock) return preferredBlock;
    for (let i = 0; i < spec.screens.length; i += 1) {
      const block = (spec.screens[i].blocks || []).find((entry) => entry.type === "form");
      if (block) return block;
    }
    return null;
  }

  function ensureChat(spec) {
    if (spec.screens.some((item) => item.id === "chat")) return false;
    const chat = screen("chat", "대화", "상대와 실시간으로 조율한다", "chat", [
      { type: "chat", messages: [
        { me: false, text: "안녕하세요. 문의드립니다." },
        { me: true, text: "네, 확인해 드릴게요." }
      ] }
    ], { tab: "chat", back: true });
    const myAt = spec.screens.findIndex((item) => item.id === "my");
    if (myAt >= 0) spec.screens.splice(myAt, 0, chat);
    else spec.screens.push(chat);
    linkItem(spec, "detail", { title: "채팅으로 문의", meta: "바로 대화", to: "chat" });
    if (Array.isArray(spec.tabs) && !spec.tabs.some((tab) => tab.id === "chat")) {
      const myTab = spec.tabs.findIndex((tab) => tab.id === "my");
      spec.tabs.splice(myTab >= 0 ? myTab : spec.tabs.length, 0, { id: "chat", label: "대화" });
    }
    return true;
  }

  function ensureReward(spec) {
    if (spec.screens.some((item) => item.id === "reward")) return false;
    const reward = screen("reward", "혜택", "스탬프와 혜택을 확인하고 사용한다", "list", [
      { type: "hero", title: "혜택", subtitle: "적립 현황을 확인합니다." },
      { type: "list", items: [{ title: "적립 혜택", meta: "사용 가능" }] }
    ], { back: true });
    const myAt = spec.screens.findIndex((item) => item.id === "my");
    if (myAt >= 0) spec.screens.splice(myAt, 0, reward);
    else spec.screens.push(reward);
    linkItem(spec, "my", { title: "스탬프와 혜택", meta: "적립 현황", to: "reward" });
    return true;
  }

  function ensureMap(spec) {
    const list = spec.screens.find((item) => item.id === "list") || spec.screens.find((item) => item.id === "home");
    if (!list) return false;
    if ((list.blocks || []).some((block) => block.type === "map")) return false;
    list.blocks.splice(Math.min(1, list.blocks.length), 0, { type: "map", text: "내 주변" });
    return true;
  }

  function removeMaps(spec) {
    let removed = false;
    spec.screens.forEach((item) => {
      const before = (item.blocks || []).length;
      item.blocks = (item.blocks || []).filter((block) => block.type !== "map");
      if (item.blocks.length !== before) removed = true;
    });
    return removed;
  }

  function ensureReview(spec) {
    const detail = spec.screens.find((item) => item.id === "detail") || spec.screens.find((item) => item.id === "home");
    if (!detail) return false;
    if (/후기|리뷰/.test(JSON.stringify(detail.blocks || []))) return false;
    const block = { type: "list", items: [{ title: "최근 후기", meta: "도움이 되었어요" }] };
    const ctaAt = detail.blocks.findIndex((entry) => entry.type === "cta");
    if (ctaAt >= 0) detail.blocks.splice(ctaAt, 0, block);
    else detail.blocks.push(block);
    return true;
  }

  function removeReviews(spec) {
    let removed = false;
    spec.screens.forEach((item) => {
      const before = (item.blocks || []).length;
      item.blocks = (item.blocks || []).filter((block) => {
        return !(block.type === "list" && /후기|리뷰|별점/.test(JSON.stringify(block)));
      });
      if (item.blocks.length !== before) removed = true;
    });
    return removed;
  }

  function ensurePay(spec, preferId) {
    const fields = formBlock(spec, preferId);
    let changed = false;
    if (fields) {
      if (!Array.isArray(fields.fields)) fields.fields = [];
      if (fields.fields.indexOf("결제 수단") === -1) {
        fields.fields.push("결제 수단");
        changed = true;
      }
    }
    spec.screens.forEach((item) => {
      (item.blocks || []).forEach((block) => {
        if (block.type === "cta" && block.label && block.label.indexOf("결제") === -1 && item.id === "form") {
          block.label = "결제하기";
          changed = true;
        }
      });
    });
    return changed;
  }

  function stripPay(spec) {
    let removed = false;
    spec.screens.forEach((item) => {
      (item.blocks || []).forEach((block) => {
        if (block.type === "form" && Array.isArray(block.fields) && block.fields.length > 1) {
          const next = block.fields.filter((field) => field !== "결제 수단");
          if (next.length !== block.fields.length) {
            block.fields = next;
            removed = true;
          }
        }
        if (block.type === "cta" && block.label === "결제하기") {
          block.label = "주문하기";
          removed = true;
        }
      });
    });
    return removed;
  }

  function ensureNotify(spec) {
    const my = spec.screens.find((item) => item.id === "my");
    if (!my) return false;
    if (/알림/.test(JSON.stringify(my.blocks || []))) return false;
    linkItem(spec, "my", { title: "알림 설정", meta: "푸시 켜짐" });
    return true;
  }

  function stripNotify(spec) {
    let removed = false;
    spec.screens.forEach((item) => {
      (item.blocks || []).forEach((block) => {
        if (!Array.isArray(block.items)) return;
        const next = block.items.filter((entry) => !(entry && entry.title === "알림 설정"));
        if (next.length !== block.items.length) {
          block.items = next;
          removed = true;
        }
      });
    });
    return removed;
  }

  function ensureAdmin(spec) {
    let changed = false;
    if (!/승인/.test(JSON.stringify(spec.screens))) {
      const dest = spec.screens.some((item) => item.id === "detail") ? "detail" : "home";
      linkItem(spec, "list", { title: "승인 대기", meta: "운영자 확인", to: dest });
      changed = true;
    }
    spec.requirements = spec.requirements || [];
    if (!spec.requirements.some((line) => /운영|승인|관리/.test(line))) {
      spec.requirements.push("운영자 승인 절차를 화면 흐름에 포함한다.");
      changed = true;
    }
    return changed;
  }

  function stripAdmin(spec) {
    let removed = false;
    spec.screens.forEach((item) => {
      (item.blocks || []).forEach((block) => {
        if (!Array.isArray(block.items)) return;
        const next = block.items.filter((entry) => !(entry && entry.title === "승인 대기"));
        if (next.length !== block.items.length) {
          block.items = next;
          removed = true;
        }
      });
    });
    spec.requirements = (spec.requirements || []).filter((line) => line !== "운영자 승인 절차를 화면 흐름에 포함한다.");
    return removed;
  }

  function ensureSchedule(spec, preferId) {
    const fields = formBlock(spec, preferId);
    if (fields) {
      if (!Array.isArray(fields.fields)) fields.fields = [];
      if (!fields.fields.some((field) => /시간|예약/.test(field))) fields.fields.unshift("희망 시간");
    }
    if (!/시간|예약/.test(JSON.stringify(spec.screens))) {
      const home = spec.screens.find((item) => item.id === "home");
      if (home) home.blocks.push({ type: "notice", text: "예약 가능한 시간을 선택할 수 있습니다." });
    }
    return true;
  }

  function screenByHint(spec, clause, fallbackId) {
    const current = spec.screens.find((item) => item.id === fallbackId);
    if (/이 화면|현재 화면/.test(clause) && current) return current;
    const named = spec.screens.find((item) => item.name && item.name !== "입력" && clause.indexOf(item.name) !== -1);
    if (named) return named;
    if (/홈|메인/.test(clause)) {
      const home = spec.screens.find((item) => item.id === "home");
      if (home) return home;
    }
    if (/상세/.test(clause)) {
      const detail = spec.screens.find((item) => item.id === "detail");
      if (detail) return detail;
    }
    if (/마이|내 정보|내정보/.test(clause)) {
      const my = spec.screens.find((item) => item.id === "my");
      if (my) return my;
    }
    if (/목록|탐색|리스트/.test(clause)) {
      const list = spec.screens.find((item) => item.id === "list");
      if (list) return list;
    }
    const currentHasForm = current && (current.blocks || []).some((block) => block && block.type === "form");
    if (currentHasForm && /입력|작성|폼|칸|필드|placeholder|placehoder/i.test(clause)) return current;
    if (/입력|작성|폼/.test(clause)) {
      const form = spec.screens.find((item) => item.id === "form")
        || spec.screens.find((item) => (item.blocks || []).some((block) => block && block.type === "form"));
      if (form) return form;
    }
    return current || spec.screens[0];
  }

  function addCustomScreen(spec, name) {
    const id = uniqueId(spec, "extra");
    const extra = screen(id, name, name + " 정보를 확인하고 다음 행동으로 이동한다", "detail", [
      { type: "hero", title: name, subtitle: "추가된 화면" },
      { type: "notice", text: name + "에서 필요한 정보를 확인합니다." },
      { type: "cta", label: "확인", to: "home" }
    ], { back: true });
    const myAt = spec.screens.findIndex((item) => item.id === "my");
    if (myAt >= 0) spec.screens.splice(myAt, 0, extra);
    else spec.screens.push(extra);
    linkItem(spec, "home", { title: name, meta: "추가된 화면", to: id, emoji: "＋" });
    return id;
  }

  function upsertNotice(target, text) {
    let notice = (target.blocks || []).find((block) => block.type === "notice" && block.revision);
    if (!notice) {
      notice = { type: "notice", text: text, revision: true };
      const ctaAt = target.blocks.findIndex((block) => block.type === "cta");
      if (ctaAt >= 0) target.blocks.splice(ctaAt, 0, notice);
      else target.blocks.push(notice);
    } else {
      notice.text = text;
    }
  }

  function ensureBlocks(spec) {
    spec.screens.forEach((item) => {
      if (!item.blocks || !item.blocks.length) {
        item.blocks = [{ type: "notice", text: item.purpose || item.name || "안내" }];
      }
      if (!(item.purpose || "").trim() || item.purpose.trim().length < 8) {
        item.purpose = (item.name || "화면") + "에서 필요한 정보를 확인하고 다음으로 이동한다";
      }
    });
  }

  function applyFeatureTouch(spec, touch, preferId, changes, focus) {
    if (touch.chat === "add") {
      const added = ensureChat(spec);
      if (added) focus.id = "chat";
      changes.push(added ? "대화 화면을 추가했습니다." : "대화 화면은 이미 있습니다.");
    }
    if (touch.chat === "remove") {
      if (spec.screens.some((item) => item.id === "chat")) {
        retarget(spec, "chat");
        changes.push("대화 화면을 뺐습니다.");
      } else changes.push("대화 화면은 원래 없습니다.");
    }
    if (touch.loyalty === "add") {
      const added = ensureReward(spec);
      if (added) focus.id = "reward";
      changes.push(added ? "혜택 화면을 추가했습니다." : "혜택 화면은 이미 있습니다.");
    }
    if (touch.loyalty === "remove") {
      if (spec.screens.some((item) => item.id === "reward")) {
        retarget(spec, "reward");
        changes.push("혜택 화면을 뺐습니다.");
      } else changes.push("혜택 화면은 원래 없습니다.");
    }
    if (touch.map === "add") changes.push(ensureMap(spec) ? "지도를 넣었습니다." : "지도는 이미 있습니다.");
    if (touch.map === "remove") changes.push(removeMaps(spec) ? "지도를 뺐습니다." : "지도는 원래 없습니다.");
    if (touch.review === "add") changes.push(ensureReview(spec) ? "후기를 추가했습니다." : "후기는 이미 있습니다.");
    if (touch.review === "remove") changes.push(removeReviews(spec) ? "후기를 뺐습니다." : "후기는 원래 없습니다.");
    if (touch.pay === "add") changes.push(ensurePay(spec, preferId) ? "결제 항목을 넣었습니다." : "결제 항목은 이미 있습니다.");
    if (touch.pay === "remove") changes.push(stripPay(spec) ? "결제 항목을 뺐습니다." : "결제 항목은 원래 없습니다.");
    if (touch.notify === "add") changes.push(ensureNotify(spec) ? "알림 설정을 넣었습니다." : "알림 설정은 이미 있습니다.");
    if (touch.notify === "remove") changes.push(stripNotify(spec) ? "알림 설정을 뺐습니다." : "알림 설정은 원래 없습니다.");
    if (touch.admin === "add") changes.push(ensureAdmin(spec) ? "승인 항목을 넣었습니다." : "승인 항목은 이미 있습니다.");
    if (touch.admin === "remove") changes.push(stripAdmin(spec) ? "승인 항목을 뺐습니다." : "승인 항목은 원래 없습니다.");
    if (touch.schedule === "add") {
      if (spec.domainId === "booking" || /시간|예약/.test(JSON.stringify(spec.screens))) {
        changes.push("예약 시간 선택은 이미 있습니다.");
      } else {
        ensureSchedule(spec, preferId);
        changes.push("예약 시간 선택을 넣었습니다.");
      }
    }
    if (touch.schedule === "remove") {
      if (spec.domainId === "booking") changes.push("예약 흐름은 기본 화면이라 유지했습니다.");
      else changes.push("예약 화면은 기본 흐름이라 유지했습니다.");
    }
  }

  function applyClause(spec, clause, preferId, changes, focus) {
    const protectedIds = { home: 1, list: 1, detail: 1, form: 1, my: 1, success: 1 };
    const featureNames = {
      채팅: 1, 문의: 1, 메시지: 1, 상담: 1, 결제: 1, 지도: 1, 리뷰: 1, 후기: 1,
      스탬프: 1, 포인트: 1, 쿠폰: 1, 적립: 1, 알림: 1, 예약: 1, 승인: 1, 관리자: 1,
      대화: 1, 혜택: 1
    };

    const rename = takePhrase(clause, /(?:서비스명|앱 이름|이름)(?:을|를)?\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경|수정|해)/);
    if (rename && /서비스명|앱 이름|이름/.test(clause)) {
      const previous = spec.name;
      spec.name = rename;
      spec.screens.forEach((item) => {
        (item.blocks || []).forEach((block) => {
          if (block.type === "hero" && block.title === previous) block.title = rename;
        });
      });
      changes.push("서비스 이름을 " + rename + "(으)로 바꿨습니다.");
    }

    const title = takePhrase(clause, /(?:제목|타이틀)(?:을|를)?\s*(.+?)\s*(?:으로|로)/);
    if (title && /제목|타이틀/.test(clause)) {
      const target = screenByHint(spec, clause, preferId);
      if (target) {
        if (!target.blocks) target.blocks = [];
        let hero = target.blocks.find((block) => block.type === "hero");
        if (!hero) {
          hero = { type: "hero", title: title, subtitle: target.purpose || "" };
          target.blocks.unshift(hero);
        } else hero.title = title;
        focus.id = target.id;
        changes.push(target.name + " 제목을 " + title + "(으)로 바꿨습니다.");
      }
    }

    const button = takePhrase(clause, /(?:버튼 문구|버튼|CTA)(?:을|를)?\s*(.+?)\s*(?:으로|로)/);
    if (button && /버튼|CTA/.test(clause)) {
      const target = screenByHint(spec, clause, preferId);
      if (target) {
        if (!target.blocks) target.blocks = [];
        let cta = target.blocks.find((block) => block.type === "cta");
        if (!cta) {
          const to = spec.screens.some((item) => item.id === "form") ? "form" : "home";
          cta = { type: "cta", label: button, to: to };
          target.blocks.push(cta);
        } else cta.label = button;
        focus.id = target.id;
        changes.push(target.name + " 버튼을 " + button + "(으)로 바꿨습니다.");
      }
    }

    const search = takePhrase(clause, /검색(?:창|바)?(?:\s*문구)?(?:을|를)?\s*(.+?)\s*(?:으로|로)/);
    if (search && /검색/.test(clause)) {
      const target = screenByHint(spec, clause, preferId);
      if (target) {
        if (!target.blocks) target.blocks = [];
        let bar = target.blocks.find((block) => block.type === "search");
        if (!bar) {
          bar = { type: "search", placeholder: search };
          target.blocks.unshift(bar);
        } else bar.placeholder = search;
        focus.id = target.id;
        changes.push("검색 안내를 " + search + "(으)로 바꿨습니다.");
      }
    }

    const fieldName = takePhrase(clause, /([가-힣A-Za-z0-9]{2,12})\s*(?:필드|입력란|항목)(?:을|를)?\s*(?:추가|넣어)/);
    if (fieldName && !/하는$|추가|입력하는/.test(fieldName) && /필드|입력란|항목/.test(clause) && /추가|넣어/.test(clause)) {
      const fields = formBlock(spec, preferId);
      if (fields) {
        if (!Array.isArray(fields.fields)) fields.fields = [];
        if (fields.fields.indexOf(fieldName) === -1) fields.fields.push(fieldName);
        changes.push(fieldName + " 입력 항목을 넣었습니다.");
      }
    }

    const color = (clause.match(/(초록|녹색|파랑|파란|빨강|빨간|주황|보라|검정|검은)/) || [])[1];
    if (color && /색|컬러|테마/.test(clause)) {
      const map = {
        초록: "#2f4a3e", 녹색: "#2f4a3e", 파랑: "#1f3a5f", 파란: "#1f3a5f",
        빨강: "#7a2e1f", 빨간: "#7a2e1f", 주황: "#c45c26", 보라: "#3b2d4a", 검정: "#2b2b2b", 검은: "#2b2b2b"
      };
      spec.palette = spec.palette || {};
      spec.palette.hero = map[color] || spec.palette.hero;
      changes.push("대표 색을 " + color + "으로 바꿨습니다.");
    }

    const addedName = takePhrase(clause, /([가-힣A-Za-z0-9]{2,12})\s*화면(?:을|를)?\s*(?:추가|만들|넣어)/);
    if (addedName && !/하는$/.test(addedName) && /추가|만들|넣어/.test(clause)) {
      if (addedName === "대화" || addedName === "채팅") focus.touch.chat = "add";
      else if (addedName === "혜택") focus.touch.loyalty = "add";
      else if (!featureNames[addedName]) {
        const reserved = { 홈: 1, 메인: 1, 상세: 1, 마이: 1, 완료: 1, 로그인: 1, 화면: 1 };
        if (reserved[addedName] || spec.screens.some((item) => item.name === addedName)) {
          changes.push(addedName + " 화면은 이미 있습니다.");
        } else {
          focus.id = addCustomScreen(spec, addedName);
          changes.push(addedName + " 화면을 추가했습니다.");
        }
      }
    }

    const removedName = takePhrase(clause, /([가-힣A-Za-z0-9]{2,12})\s*화면(?:을|를)?\s*(?:삭제|제거|빼)/);
    if (removedName && wantsRemoval(clause) && !/하는$/.test(removedName)) {
      const target = spec.screens.find((item) => item.name === removedName);
      if (target && target.id === "chat") focus.touch.chat = "remove";
      else if (target && target.id === "reward") focus.touch.loyalty = "remove";
      else if (target && protectedIds[target.id]) changes.push(target.name + " 화면은 기본 흐름이라 유지했습니다.");
      else if (target) {
        retarget(spec, target.id);
        changes.push(target.name + " 화면을 뺐습니다.");
      } else if (!featureNames[removedName]) changes.push(removedName + " 화면은 없습니다.");
    }

    applyFieldEdit(spec, clause, preferId, changes, focus);

    if (!isCopyClause(clause)) {
      const found = inferFeatures(clause);
      const mode = wantsRemoval(clause) ? "remove" : "add";
      Object.keys(found).forEach((key) => {
        if (found[key]) focus.touch[key] = mode;
      });
    }
  }

  function fieldLabel(field) {
    if (field && typeof field === "object") return field.label || field.name || "";
    return String(field || "");
  }

  function cleanHint(text) {
    return String(text || "")
      .replace(/[“”"'`]/g, "")
      .replace(/\s*(?:바꿔|변경|수정)?\s*(?:주세요|해줘|해죠|해주|해 주|하죠|요|줘)?\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30);
  }

  function applyFieldEdit(spec, clause, preferId, changes, focus) {
    const target = screenByHint(spec, clause, preferId);
    if (!target) return;
    const forms = (target.blocks || []).filter((block) => block && block.type === "form");
    if (!forms.length) return;
    const mentioned = [];
    forms.forEach((block) => {
      (block.fields || []).forEach((field) => {
        const label = fieldLabel(field);
        if (label && clause.indexOf(label) !== -1) mentioned.push({ block: block, label: label });
      });
    });
    if (!mentioned.length) return;

    let hint = "";
    const typed = clause.match(/(?:placeholder|placehoder|플레이스\s*홀더|안내\s*문구|힌트)(?:을|를)?\s*(.+?)\s*(?:으로|로)/i);
    if (typed) hint = cleanHint(typed[1]);
    if (!hint) {
      const legacy = clause.match(/을\(를\)\s*입력(?:을|를)?\s*(.+?)\s*(?:으로|로)/);
      if (legacy) hint = cleanHint(legacy[1]);
    }
    if (!hint && /바꿔|변경/.test(clause)) {
      const swapped = clause.match(/(?:을|를)\s*(.+?)\s*(?:으로|로)\s*(?:바꿔|변경)/);
      if (swapped) hint = cleanHint(swapped[1]);
    }
    const wantsType = /클릭|눌러|포커스|타이핑|입력\s*(?:되게|되도록|가능|하게|할\s*수)/.test(clause);
    if (!hint && !wantsType) return;

    target.blocks = (target.blocks || []).filter((block) => !(block && block.type === "notice" && block.revision));
    if (focus) focus.id = target.id;
    mentioned.forEach((item) => {
      if (hint) {
        if (!item.block.placeholders || typeof item.block.placeholders !== "object") item.block.placeholders = {};
        item.block.placeholders[item.label] = hint;
        changes.push(item.label + " 안내를 " + hint + "(으)로 바꿨습니다.");
      } else {
        changes.push(item.label + " 칸을 눌러 바로 입력할 수 있습니다.");
      }
    });
  }

  function reviseFromPrompt(spec, instruction, options) {
    const text = String(instruction || "").trim().slice(0, 200);
    if (!spec || !Array.isArray(spec.screens) || text.length < 2) {
      return { spec: spec, changes: [], focusId: "" };
    }
    const next = cloneSpec(spec);
    const preferId = options && options.screenId;
    const changes = [];
    const focus = { id: "", touch: {} };
    splitClauses(text).forEach((clause) => applyClause(next, clause, preferId, changes, focus));
    next.features = Object.assign({
      chat: false, pay: false, map: false, review: false,
      loyalty: false, admin: false, notify: false, schedule: false
    }, inferFeatures(next.prompt || ""), next.features || {});
    Object.keys(focus.touch).forEach((key) => {
      next.features[key] = focus.touch[key] === "add";
    });
    applyFeatureTouch(next, focus.touch, preferId, changes, focus);
    if (!changes.length) {
      const target = screenByHint(next, text, preferId);
      if (target) {
        upsertNotice(target, text.slice(0, 80));
        changes.push(target.name + "에 수정 문구를 반영했습니다.");
        focus.id = target.id;
      }
    }
    ensureBlocks(next);
    next.ia = next.screens.filter((item) => item.id !== "success").map((item) => item.name);
    next.flows = buildFlows(next.screens, next.domainId, next.features);
    next.components = buildComponents(next.domainId, next.features);
    next.requirements = next.requirements || [];
    const line = "수정 반영: " + text.slice(0, 80);
    if (next.requirements.indexOf(line) === -1) next.requirements.push(line);
    next.revisions = next.revisions || [];
    next.revisions.push({ text: text, at: new Date().toISOString() });
    next.updatedAt = new Date().toISOString();
    return { spec: next, changes: changes, focusId: focus.id || "" };
  }

  const MODEL_BLOCKS = {
    hero: 1, search: 1, chips: 1, stats: 1, cards: 1, list: 1,
    form: 1, cta: 1, map: 1, notice: 1, chat: 1
  };

  function screenLinks(item) {
    const out = [];
    (item.blocks || []).forEach((block) => {
      if (!block || typeof block !== "object") return;
      if (block.to) out.push(block.to);
      (block.items || []).forEach((entry) => {
        if (entry && typeof entry === "object" && entry.to) out.push(entry.to);
      });
    });
    return out;
  }

  function repairModelScreens(screens) {
    const clean = [];
    const seen = new Set();
    screens.forEach((item) => {
      if (!item || typeof item !== "object" || seen.has(item.id)) return;
      const id = String(item.id || "").trim();
      if (!id || !/^[A-Za-z0-9_-]{1,24}$/.test(id)) return;
      const blocks = (Array.isArray(item.blocks) ? item.blocks : []).filter((block) => block && MODEL_BLOCKS[block.type]);
      clean.push({
        id: id,
        name: String(item.name || id).trim().slice(0, 24) || id,
        purpose: String(item.purpose || "").trim(),
        kind: item.kind || "detail",
        blocks: blocks,
        tab: item.tab || false,
        back: !!item.back
      });
      seen.add(id);
    });
    if (!clean.some((item) => item.id === "home") || clean.length < 4) {
      return { ok: false, reason: "홈을 포함한 화면이 4개 이상 필요합니다." };
    }
    const ids = new Set(clean.map((item) => item.id));
    const roots = new Set(["home", "list", "my"]);
    if (ids.has("chat")) roots.add("chat");
    clean.forEach((item) => {
      if (!roots.has(item.id)) item.back = true;
      item.blocks.forEach((block) => {
        if (block.to && !ids.has(block.to)) block.to = "home";
        if (Array.isArray(block.items)) {
          block.items.forEach((entry) => {
            if (entry && entry.to && !ids.has(entry.to)) entry.to = "home";
          });
        }
        if (block.type === "form") {
          block.fields = (block.fields || []).map((field) => {
            return typeof field === "string" ? field.trim() : ((field && (field.label || field.name)) || "");
          }).filter(Boolean).slice(0, 6);
          if (!block.fields.length) block.fields = ["내용"];
        }
        if (block.type === "cta") {
          if (!block.label) block.label = "계속";
          if (!block.to || !ids.has(block.to)) block.to = "home";
        }
        if (block.type === "search" && !(block.placeholder || "").trim()) block.placeholder = "검색";
        if (block.type === "hero" && !block.title) block.title = item.name;
      });
      const ctas = item.blocks.filter((block) => block.type === "cta");
      if (ctas.length > 1) {
        item.blocks = item.blocks.filter((block) => block.type !== "cta").concat(ctas[0]);
      }
      if (item.blocks.some((block) => block.type === "form") && !item.blocks.some((block) => block.type === "cta")) {
        item.blocks.push({ type: "cta", label: "확인", to: ids.has("success") ? "success" : "home" });
      }
      if (!item.blocks.length) item.blocks.push({ type: "notice", text: item.name });
      if (item.purpose.length < 8) item.purpose = item.name + "에서 필요한 정보를 확인하고 다음으로 이동한다";
    });
    const home = clean.find((item) => item.id === "home");
    const reached = new Set();
    const queue = ["home", "list", "my", "chat"].filter((id) => ids.has(id));
    while (queue.length) {
      const id = queue.shift();
      const item = clean.find((entry) => entry.id === id);
      if (!item || reached.has(id)) continue;
      reached.add(id);
      screenLinks(item).forEach((to) => {
        if (ids.has(to) && !reached.has(to)) queue.push(to);
      });
    }
    clean.forEach((item) => {
      if (reached.has(item.id) || !home) return;
      let list = home.blocks.find((block) => block.type === "list" || block.type === "cards");
      if (!list) {
        list = { type: "list", items: [] };
        home.blocks.push(list);
      }
      if (!Array.isArray(list.items)) list.items = [];
      list.items.push({ title: item.name, meta: "이동", to: item.id });
      reached.add(item.id);
    });
    if (ids.has("success") && !clean.some((item) => screenLinks(item).indexOf("success") !== -1) && home) {
      let list = home.blocks.find((block) => block.type === "list");
      if (!list) {
        list = { type: "list", items: [] };
        home.blocks.push(list);
      }
      list.items.push({ title: "완료", meta: "결과", to: "success" });
    }
    return { ok: true, screens: clean };
  }

  function featuresFromScreens(screens) {
    const blob = JSON.stringify(screens);
    return {
      chat: screens.some((item) => item.id === "chat"),
      map: screens.some((item) => (item.blocks || []).some((block) => block.type === "map")),
      loyalty: screens.some((item) => item.id === "reward"),
      review: /후기|리뷰/.test(blob),
      pay: /결제/.test(blob),
      schedule: /시간|예약/.test(blob),
      admin: /승인|운영자|관리자/.test(blob),
      notify: /알림/.test(blob)
    };
  }

  function applyModelScreens(spec, screens, instruction, meta) {
    if (!spec || !Array.isArray(spec.screens)) return { ok: false, reason: "원본 화면이 없습니다." };
    let incoming;
    try {
      incoming = JSON.parse(JSON.stringify(screens));
    } catch (error) {
      return { ok: false, reason: "화면 형식이 아닙니다." };
    }
    if (!Array.isArray(incoming)) return { ok: false, reason: "화면 목록이 없습니다." };
    ["home", "success"].forEach((id) => {
      if (incoming.some((item) => item && item.id === id)) return;
      const kept = spec.screens.find((item) => item.id === id);
      if (kept) incoming.push(JSON.parse(JSON.stringify(kept)));
    });
    const repaired = repairModelScreens(incoming);
    if (!repaired.ok) return repaired;
    const next = cloneSpec(spec);
    next.screens = repaired.screens;
    next.features = featuresFromScreens(next.screens);
    ensureBlocks(next);
    next.ia = next.screens.filter((item) => item.id !== "success").map((item) => item.name);
    next.flows = buildFlows(next.screens, next.domainId, next.features);
    next.components = buildComponents(next.domainId, next.features);
    if (!Array.isArray(next.personas) || next.personas.length < 2) {
      next.personas = ["신규 사용자", "재방문 사용자"];
    }
    next.requirements = next.requirements || [];
    const text = String(instruction || "").trim().slice(0, 200);
    const line = "수정 반영: " + text.slice(0, 80);
    if (text && next.requirements.indexOf(line) === -1) next.requirements.push(line);
    next.revisions = next.revisions || [];
    if (text) next.revisions.push({ text: text, at: new Date().toISOString() });
    next.updatedAt = new Date().toISOString();
    const changes = ((meta && meta.changes) || []).filter((item) => typeof item === "string" && item.trim()).slice(0, 3);
    if (!changes.length) changes.push("요청한 내용으로 화면을 고쳤습니다.");
    const focusId = meta && next.screens.some((item) => item.id === meta.focusId) ? meta.focusId : "home";
    return { ok: true, spec: next, changes: changes, focusId: focusId };
  }

  const api = { generateFromPrompt, detectDomain, reviseFromPrompt, applyModelScreens };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ProtoSpec = api;
})(typeof window !== "undefined" ? window : globalThis);
