import { useState, useEffect, useRef } from "react";

const GENRES = [
  { id: "fantasy", label: "奇幻冒险", desc: "魔法、龙与古老预言的世界", icon: "⚔️", color: "#c8a45a", bg: "#100c04" },
  { id: "scifi",   label: "星际探索", desc: "飞船、AI与神秘宇宙深处",    icon: "🚀", color: "#5ac8c8", bg: "#041012" },
  { id: "horror",  label: "克苏鲁恐怖", desc: "黑暗、未知与无名的恐惧",  icon: "🌑", color: "#c86060", bg: "#100404" },
  { id: "mystery", label: "民国悬疑",  desc: "旧上海的谜案与隐藏阴谋",  icon: "🔍", color: "#c895c8", bg: "#0e0412" },
];

const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ"];

/** DeepSeek OpenAI 兼容 Chat Completions；开发环境走 Vite 代理 `/deepseek-api` */
const CHAT_COMPLETIONS_URL =
  import.meta.env.VITE_CHAT_COMPLETIONS_URL ??
  "/deepseek-api/v1/chat/completions";

/** 默认模型；可通过环境变量 `VITE_DEEPSEEK_MODEL` 覆盖 */
const DEEPSEEK_MODEL =
  import.meta.env.VITE_DEEPSEEK_MODEL ?? "deepseek-chat";

const getSysPrompt = (g) => {
  const intros = {
    fantasy: "你是顶级奇幻小说叙述者。故事世界充满魔法、龙、预言与政治阴谋。主角是初出茅庐的年轻英雄。史诗感强烈，充满神秘与命运感。",
    scifi:   "你是顶级科幻小说叙述者。故事设定在星际时代，有外星文明、AI意识与宇宙谜题。主角是经验老道的星际探险家。风格硬核科幻，充满奇思妙想。",
    horror:  "你是顶级恐怖小说叙述者。故事是克苏鲁风格心理恐怖，充满未知恐惧与宇宙级别的威胁。主角调查被诅咒小镇的神秘失踪。氛围压抑、恐惧、不祥。",
    mystery: "你是顶级悬疑小说叙述者。故事设定在1930年代上海，充满阴谋、背叛与隐藏动机。主角是机智的私家侦探。旧上海风情浓厚，张力十足。",
  };
  return `${intros[g]}

仅以如下JSON格式回复（不得有代码块、Markdown或任何多余文字）：
{
  "scene": "场景描述，第二人称，2-3段，共150-250字，沉浸生动",
  "choices": ["选项A（15字内）", "选项B（15字内）", "选项C（15字内）"],
  "hp": <当前生命值0-100，遭遇危险减少10-25，否则保持>,
  "items": ["玩家当前拥有的所有物品，每次更新完整列表"],
  "gameOver": <true表示游戏结束否则false>,
  "gameOverMessage": <游戏结束时的结局文字（100字内），否则null>
}`;
};

export default function TextAdventure() {
  const [phase, setPhase] = useState("start");
  const [genre, setGenre] = useState(null);
  const [genreData, setGenreData] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [sceneText, setSceneText] = useState("");
  const [choices, setChoices] = useState([]);
  const [hp, setHp] = useState(100);
  const [items, setItems] = useState([]);
  const [turn, setTurn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const [typingDone, setTypingDone] = useState(true);
  const [endMsg, setEndMsg] = useState("");
  const [lastApiError, setLastApiError] = useState("");

  const timerRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Lora:ital,wght@0,400;0,500;1,400&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [typed, choices]);

  const typewrite = (text) => {
    clearInterval(timerRef.current);
    setTyped("");
    setTypingDone(false);
    let i = 0;
    timerRef.current = setInterval(() => {
      i++;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timerRef.current);
        setTypingDone(true);
      }
    }, 14);
  };

  const skipTyping = () => {
    clearInterval(timerRef.current);
    setTyped(sceneText);
    setTypingDone(true);
  };

  /**
   * 调用 DeepSeek Chat Completions（OpenAI 兼容）；失败时返回 HTTP 状态与 error.message。
   * @returns {Promise<{ ok: true, result: object } | { ok: false, message: string }>}
   */
  const callAPI = async (messages, g) => {
    setLoading(true);
    try {
      const payloadMessages = [
        { role: "assistant", content: getSysPrompt(g) },
        ...messages,
      ];
      const res = await fetch(CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          max_tokens: 1000,
          messages: payloadMessages,
        }),
      });
      const text = await res.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          return {
            ok: false,
            message: `HTTP ${res.status}，响应不是合法 JSON（前 120 字）：${text.slice(0, 120)}`,
          };
        }
      } else {
        data = {};
      }
      if (!res.ok) {
        const apiMsg = data?.error?.message;
        const hint =
          res.status === 403
            ? "（403 多为：密钥无效、无该模型权限、或当前网络/地区限制）"
            : "";
        return {
          ok: false,
          message: apiMsg
            ? `${apiMsg} [HTTP ${res.status}]${hint}`
            : `请求失败 HTTP ${res.status}${hint}`,
        };
      }
      const raw = (data.choices?.[0]?.message?.content ?? "").trim();
      const clean = raw.replace(/```json|```/g, "").trim();
      if (!clean) {
        return { ok: false, message: "模型返回空正文，无法解析为 JSON" };
      }
      try {
        return { ok: true, result: JSON.parse(clean) };
      } catch {
        return { ok: false, message: "模型返回内容不是合法 JSON 对象" };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "网络请求异常";
      return { ok: false, message };
    } finally {
      setLoading(false);
    }
  };

  const startGame = async (g) => {
    setLastApiError("");
    const gd = GENRES.find(x => x.id === g);
    setGenre(g);
    setGenreData(gd);
    setPhase("loading");
    setTurn(1);
    setHp(100);
    setItems([]);
    const initMsgs = [{ role: "user", content: "开始游戏，生成第一个场景。" }];
    const out = await callAPI(initMsgs, g);
    if (out.ok) {
      const result = out.result;
      setSceneText(result.scene);
      typewrite(result.scene);
      setChoices(result.choices || []);
      setHp(result.hp ?? 100);
      setItems(result.items ?? []);
      setMsgs([...initMsgs, { role: "assistant", content: JSON.stringify(result) }]);
      setPhase("playing");
      if (result.gameOver) {
        setEndMsg(result.gameOverMessage || "故事走到了尽头。");
        setTimeout(() => setPhase("end"), 4000);
      }
    } else {
      setLastApiError(out.message);
      setPhase("start");
    }
  };

  const makeChoice = async (choice) => {
    if (loading) return;
    if (!typingDone) { skipTyping(); return; }
    const newMsgs = [...msgs, { role: "user", content: `我选择：${choice}` }];
    setTurn(t => t + 1);
    const out = await callAPI(newMsgs, genre);
    if (out.ok) {
      setLastApiError("");
      const result = out.result;
      setSceneText(result.scene);
      typewrite(result.scene);
      setChoices(result.choices || []);
      const newHp = Math.max(0, result.hp ?? hp);
      setHp(newHp);
      setItems(result.items ?? items);
      setMsgs([...newMsgs, { role: "assistant", content: JSON.stringify(result) }]);
      if (result.gameOver || newHp <= 0) {
        const finalMsg = result.gameOverMessage || (newHp <= 0 ? "你倒下了，长眠于此……命运再也无法改写。" : "故事走到了尽头。");
        setEndMsg(finalMsg);
        setTimeout(() => setPhase("end"), 4000);
      }
    } else {
      setLastApiError(out.message);
    }
  };

  const ac = genreData?.color || "#c8a45a";
  const bgMain = genreData?.bg || "#0d0a05";

  // ────────────────────── START SCREEN ──────────────────────
  if (phase === "start") {
    return (
      <div style={{
        minHeight: "100vh", background: "#080604", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "2rem 1rem",
        fontFamily: "'Lora', Georgia, serif",
      }}>
        <style>{`
          @keyframes flicker { 0%,100%{opacity:1} 92%{opacity:0.96} 94%{opacity:0.85} 96%{opacity:0.97} }
          @keyframes rise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
          .gcard:hover { transform: translateY(-3px) !important; }
        `}</style>
        <div style={{ animation: "rise 0.8s ease both", textAlign: "center", maxWidth: "580px", width: "100%" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1.2rem", animation: "flicker 4s infinite" }}>📜</div>
          <h1 style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif", fontSize: "clamp(1.8rem,5vw,3rem)",
            fontWeight: 600, letterSpacing: "0.2em", color: "#e8c878",
            textShadow: "0 0 40px rgba(232,200,120,0.4)", marginBottom: "0.4rem",
          }}>文字冒险</h1>
          <p style={{ color: "#5a4820", fontSize: "0.8rem", letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: "2.5rem" }}>
            AI 驱动的互动小说
          </p>
          <p style={{ color: "#6a5028", fontSize: "0.95rem", lineHeight: 1.8, marginBottom: "2.5rem" }}>
            选择你的世界，开启一段由 AI 即兴创作的独特旅程。<br />
            每一次抉择，都将书写属于你的传说。
          </p>
          {lastApiError ? (
            <p style={{
              color: "#c87878", fontSize: "0.82rem", lineHeight: 1.65, marginBottom: "1.25rem",
              maxWidth: "520px", marginLeft: "auto", marginRight: "auto", textAlign: "left",
            }}>
              {lastApiError}
            </p>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem" }}>
            {GENRES.map((g, idx) => (
              <button
                key={g.id}
                className="gcard"
                onClick={() => startGame(g.id)}
                style={{
                  background: "rgba(255,255,255,0.018)", border: `1px solid ${g.color}40`,
                  borderRadius: "4px", padding: "1.4rem 1rem", cursor: "pointer",
                  color: g.color, fontFamily: "'Lora', serif",
                  transition: "all 0.25s ease", outline: "none",
                  animation: `rise ${0.6 + idx * 0.1}s ease both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${g.color}12`; e.currentTarget.style.borderColor = g.color; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.018)"; e.currentTarget.style.borderColor = `${g.color}40`; }}
              >
                <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>{g.icon}</div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.1em", marginBottom: "0.35rem" }}>{g.label}</div>
                <div style={{ fontSize: "0.78rem", color: `${g.color}70`, lineHeight: 1.5 }}>{g.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────── LOADING ──────────────────────
  if (phase === "loading") {
    return (
      <div style={{
        minHeight: "100vh", background: bgMain, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", fontFamily: "'Lora', serif",
      }}>
        <style>{`@keyframes spin { to{transform:rotate(360deg)} } @keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", color: ac, animation: "pulse 1.4s infinite", marginBottom: "1rem" }}>✦</div>
          <p style={{ color: `${ac}60`, fontSize: "0.85rem", letterSpacing: "0.25em" }}>命运之书正在翻开……</p>
        </div>
      </div>
    );
  }

  // ────────────────────── END SCREEN ──────────────────────
  if (phase === "end") {
    const dead = hp <= 0 || endMsg.includes("倒下") || endMsg.includes("死");
    return (
      <div style={{
        minHeight: "100vh", background: bgMain, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "'Lora', serif",
      }}>
        <style>{`@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
        <div style={{ maxWidth: "480px", textAlign: "center", animation: "rise 0.8s ease" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{dead ? "💀" : "✨"}</div>
          <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "1.4rem", color: ac, letterSpacing: "0.2em", marginBottom: "1.5rem" }}>
            {dead ? "命途多舛" : "传奇终结"}
          </h2>
          <p style={{ color: `${ac}90`, lineHeight: 1.9, fontSize: "1rem", marginBottom: "2rem" }}>{endMsg}</p>
          <div style={{ color: "#3a2810", fontSize: "0.8rem", marginBottom: "2rem", letterSpacing: "0.1em" }}>
            ✦ 共历 {turn} 章 ✦ 最终生命 {hp} ✦
          </div>
          <button
            onClick={() => { setPhase("start"); setGenre(null); setGenreData(null); }}
            style={{
              background: "transparent", border: `1px solid ${ac}60`,
              color: ac, fontFamily: "'Cinzel', serif",
              padding: "0.7rem 2rem", cursor: "pointer",
              letterSpacing: "0.15em", fontSize: "0.85rem", borderRadius: "3px",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${ac}15`; e.currentTarget.style.borderColor = ac; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = `${ac}60`; }}
          >
            再启传说
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────── GAME SCREEN ──────────────────────
  const hpPct = Math.max(0, Math.min(100, hp));
  const hpColor = hpPct > 60 ? "#4a8a4a" : hpPct > 30 ? "#9a8030" : "#9a3030";

  return (
    <div style={{
      minHeight: "100vh", background: `radial-gradient(ellipse at 50% 0%, ${bgMain} 0%, #050403 100%)`,
      display: "flex", flexDirection: "column", fontFamily: "'Lora', Georgia, serif", color: ac,
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes pulse  { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
        .choice-btn { transition: all 0.2s ease !important; }
        .choice-btn:hover { background: ${ac}10 !important; border-color: ${ac}90 !important; transform: translateX(5px) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${ac}25; border-radius: 2px; }
      `}</style>

      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", gap: "1rem",
        padding: "0.7rem 1.5rem", borderBottom: `1px solid ${ac}18`,
        background: "rgba(0,0,0,0.5)", flexShrink: 0, flexWrap: "wrap",
      }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.75rem", color: `${ac}80`, letterSpacing: "0.15em" }}>
          {genreData?.icon} {genreData?.label}
        </span>
        <span style={{ color: "#3a2810", fontSize: "0.75rem" }}>第 {turn} 章</span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "0.72rem", color: "#4a3418" }}>♥</span>
          <div style={{ width: "72px", height: "5px", background: "#1a1008", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${hpPct}%`, height: "100%", background: hpColor, borderRadius: "3px", transition: "width 0.6s ease" }} />
          </div>
          <span style={{ fontSize: "0.72rem", color: hpColor, minWidth: "24px" }}>{hpPct}</span>
        </div>
      </div>

      {lastApiError ? (
        <div style={{
          padding: "0.55rem 1.5rem", flexShrink: 0,
          background: "rgba(90, 30, 30, 0.35)", borderBottom: `1px solid ${ac}12`,
          color: "#d8a0a0", fontSize: "0.78rem", lineHeight: 1.5,
        }}>
          {lastApiError}
        </div>
      ) : null}

      {/* SCENE + CHOICES */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ maxWidth: "700px", width: "100%", margin: "0 auto", padding: "2rem 1.5rem 3rem", flex: 1 }}>

          {/* Scene text */}
          <div
            style={{ lineHeight: 2, fontSize: "1.05rem", color: ac, marginBottom: "1.8rem", minHeight: "160px", cursor: !typingDone ? "pointer" : "default" }}
            onClick={!typingDone ? skipTyping : undefined}
            title={!typingDone ? "点击跳过" : ""}
          >
            {loading ? (
              <span style={{ color: `${ac}40`, animation: "pulse 1.2s infinite", fontSize: "0.9rem", letterSpacing: "0.1em" }}>
                ✦ 命运正在书写……
              </span>
            ) : (
              <>
                <span style={{ whiteSpace: "pre-wrap" }}>{typed}</span>
                {!typingDone && (
                  <span style={{ animation: "blink 0.8s infinite", marginLeft: "1px" }}>▌</span>
                )}
              </>
            )}
          </div>

          {/* Items */}
          {items.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "1.2rem" }}>
              {items.map((item, i) => (
                <span key={i} style={{
                  background: `${ac}0e`, border: `1px solid ${ac}28`, borderRadius: "2px",
                  padding: "0.18rem 0.55rem", fontSize: "0.72rem", color: `${ac}70`,
                }}>
                  ✦ {item}
                </span>
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ position: "relative", marginBottom: "1.5rem" }}>
            <div style={{ borderTop: `1px solid ${ac}18` }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#050403", padding: "0 0.5rem", color: `${ac}30`, fontSize: "0.7rem" }}>✦</div>
          </div>

          {/* Skip hint */}
          {!typingDone && !loading && (
            <div style={{ textAlign: "center", color: `${ac}25`, fontSize: "0.72rem", letterSpacing: "0.1em", marginBottom: "1rem" }}>
              点击文字跳过
            </div>
          )}

          {/* Choices */}
          {typingDone && !loading && choices.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", animation: "fadeUp 0.5s ease" }}>
              {choices.map((choice, i) => (
                <button
                  key={i}
                  className="choice-btn"
                  onClick={() => makeChoice(choice)}
                  style={{
                    background: "rgba(255,255,255,0.012)", border: `1px solid ${ac}28`,
                    borderRadius: "3px", padding: "0.85rem 1.2rem",
                    color: ac, fontFamily: "'Lora', serif", fontSize: "0.95rem",
                    textAlign: "left", cursor: "pointer", outline: "none",
                    display: "flex", alignItems: "center", gap: "1rem",
                  }}
                >
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.7rem", color: `${ac}45`, flexShrink: 0, minWidth: "14px" }}>
                    {ROMAN[i]}
                  </span>
                  <span>{choice}</span>
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
