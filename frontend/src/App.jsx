import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./index.css";

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function AnkiCards({ cards }) {
  const [deck, setDeck] = useState(() => cards.map((c, i) => ({ ...c, id: i, due: 0 })));
  const [current, setCurrent] = useState(0);
  const [shown, setShown] = useState(false);
  const [session, setSession] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [done, setDone] = useState(false);

  const due = deck.filter(c => c.due <= 0);
  const card = due[current % Math.max(due.length, 1)];

  function rate(difficulty) {
    const newDeck = deck.map(c => {
      if (c.id !== card.id) return c;
      if (difficulty === "again") return { ...c, due: 0 };
      if (difficulty === "hard") return { ...c, due: 1 };
      if (difficulty === "good") return { ...c, due: 3 };
      if (difficulty === "easy") return { ...c, due: 999 };
      return c;
    });
    setSession(s => ({ ...s, [difficulty]: s[difficulty] + 1 }));
    setDeck(newDeck);
    setShown(false);
    const remaining = newDeck.filter(c => c.due <= 0);
    if (remaining.length === 0) {
      setDone(true);
    } else {
      setCurrent(c => (c + 1) % remaining.length);
    }
  }

  if (done) return (
    <div className="anki-done">
      <div className="done-title">Session Complete! 🎉</div>
      <div className="done-stats">
        <div className="stat"><span className="stat-num" style={{color:"#ff4444"}}>{session.again}</span><span>Again</span></div>
        <div className="stat"><span className="stat-num" style={{color:"#ffaa00"}}>{session.hard}</span><span>Hard</span></div>
        <div className="stat"><span className="stat-num" style={{color:"#44ff88"}}>{session.good}</span><span>Good</span></div>
        <div className="stat"><span className="stat-num" style={{color:"#4488ff"}}>{session.easy}</span><span>Easy</span></div>
      </div>
      <button className="restart-btn" onClick={() => {
        setDeck(cards.map((c, i) => ({ ...c, id: i, due: 0 })));
        setCurrent(0); setShown(false); setSession({ again: 0, hard: 0, good: 0, easy: 0 }); setDone(false);
      }}>Restart Session</button>
    </div>
  );

  return (
    <div className="anki-wrap">
      <div className="anki-progress">
        <span className="anki-count">{due.length} cards remaining</span>
        <div className="anki-bar">
          <div className="anki-bar-fill" style={{ width: `${((cards.length - due.length) / cards.length) * 100}%` }} />
        </div>
      </div>

      <div className="anki-card" onClick={() => !shown && setShown(true)}>
        <div className="anki-label">TERM</div>
        <div className="anki-term">{card?.term}</div>
        {!shown && <div className="anki-hint">Click to reveal answer</div>}
        {shown && (
          <>
            <div className="anki-divider" />
            <div className="anki-label">DEFINITION</div>
            <div className="anki-def">{card?.definition}</div>
          </>
        )}
      </div>

      {shown && (
        <div className="anki-btns">
          <button className="anki-btn again" onClick={() => rate("again")}>
            <span>Again</span><span className="btn-sub">Forgot</span>
          </button>
          <button className="anki-btn hard" onClick={() => rate("hard")}>
            <span>Hard</span><span className="btn-sub">Difficult</span>
          </button>
          <button className="anki-btn good" onClick={() => rate("good")}>
            <span>Good</span><span className="btn-sub">Got it</span>
          </button>
          <button className="anki-btn easy" onClick={() => rate("easy")}>
            <span>Easy</span><span className="btn-sub">Too easy</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MCQSection({ mcqs }) {
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(null);

  function answer(qIdx, opt) {
    if (answers[qIdx]) return;
    const newAnswers = { ...answers, [qIdx]: opt };
    setAnswers(newAnswers);
    if (Object.keys(newAnswers).length === mcqs.length) {
      const correct = mcqs.filter((q, i) => newAnswers[i] === q.answer).length;
      setScore(correct);
    }
  }

  return (
    <div className="mcq-section">
      {score !== null && (
        <div className="mcq-score">
          Score: {score}/{mcqs.length} {score === mcqs.length ? "🎉 Perfect!" : score >= mcqs.length / 2 ? "👍 Good!" : "📚 Keep studying!"}
        </div>
      )}
      {mcqs.map((q, i) => (
        <div key={i} className="mcq-card">
          <div className="mcq-question">Q{i + 1}. {q.question}</div>
          <div className="mcq-options">
            {q.options?.map((opt, j) => {
              const selected = answers[i] === opt;
              const revealed = !!answers[i];
              const isCorrect = opt === q.answer;
              let cls = "mcq-option";
              if (revealed && isCorrect) cls += " correct";
              else if (selected && !isCorrect) cls += " wrong";
              else if (revealed) cls += " faded";
              return (
                <div key={j} className={cls} onClick={() => answer(i, opt)}>
                  {opt}
                  {revealed && isCorrect && " ✓"}
                  {selected && !isCorrect && " ✗"}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [studyData, setStudyData] = useState(null);
  const [studyLoading, setStudyLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("flashcards");
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  async function handleSummarize() {
    setError(null); setResult(null); setChatHistory([]);
    setTranscript(""); setStudyData(null);
    const vid = extractVideoId(url);
    if (!vid) { setError("Invalid YouTube URL."); return; }
    setVideoId(vid); setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/summarize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: vid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setResult(data); setTranscript(data.transcript || "");
    } catch (e) { setError(e.message || "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function handleChat() {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim(); setChatInput("");
    const newHistory = [...chatHistory, { role: "user", content: userMsg }];
    setChatHistory(newHistory); setChatLoading(true);
    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, message: userMsg, history: chatHistory, transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setChatHistory([...newHistory, { role: "assistant", content: data.reply }]);
    } catch {
      setChatHistory([...newHistory, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally { setChatLoading(false); }
  }

  async function handleStudy() {
    setStudyData(null); setStudyLoading(true);
    try {
      const res = await fetch("http://localhost:8000/study", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setStudyData(data); setActiveTab("flashcards");
    } catch (e) { setError(e.message || "Something went wrong.");
    } finally { setStudyLoading(false); }
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1 className="logo">TUBE<span>LENS</span></h1>
          <p className="logo-sub">AI Video Intelligence</p>
        </header>

        <div className="input-row">
          <input className="url-input" type="text" placeholder="Paste YouTube URL here..."
            value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSummarize()} />
          <button className="submit-btn" onClick={handleSummarize} disabled={loading || !url.trim()}>
            {loading ? "Analyzing..." : "Summarize →"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {videoId && (
          <div className="video-strip">
            <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="thumb" className="thumb" />
            <span className="vid-id">ID: {videoId}</span>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="bar-wrap"><div className="bar" /></div>
            <p>Analyzing video transcript...</p>
          </div>
        )}

        {result && (
          <div className="result">
            <div className="section">
              <div className="section-tag">Overview</div>
              <div className="summary-card">{result.summary}</div>
            </div>

            {result.worth_watching && (
              <div className="section">
                <div className="section-tag">Worth Watching?</div>
                <div className="worth-card">💡 {result.worth_watching}</div>
              </div>
            )}

            {result.chapters?.length > 0 && (
              <div className="section">
                <div className="section-tag">Timestamped Chapters</div>
                <div className="chapters">
                  {result.chapters.map((ch, i) => (
                    <div key={i} className="chapter">
                      <div className="ch-timestamp">{ch.timestamp}</div>
                      <div className="ch-content">
                        <div className="ch-title">{ch.title}</div>
                        <div className="ch-desc">{ch.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="section">
              <div className="section-tag">Chat with this Video</div>
              <div className="chat-box">
                {chatHistory.length === 0 && <div className="chat-placeholder">Ask anything about this video...</div>}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`chat-msg ${msg.role}`}>
                    <span className="chat-role">{msg.role === "user" ? "You" : "AI"}</span>
                    <span className="chat-text"><ReactMarkdown>{msg.content}</ReactMarkdown></span>
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-msg assistant">
                    <span className="chat-role">AI</span>
                    <span className="chat-text typing">Thinking...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-row">
                <input className="chat-input" type="text" placeholder="e.g. What did they say about sets?"
                  value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleChat()} />
                <button className="chat-btn" onClick={handleChat} disabled={chatLoading || !chatInput.trim()}>Ask →</button>
              </div>
            </div>

            <div className="section">
              <div className="section-tag">Study Mode</div>
              <button className="study-btn" onClick={handleStudy} disabled={studyLoading}>
                {studyLoading ? "Generating..." : "🎓 Generate Study Material"}
              </button>

              {studyData && (
                <div className="study-output">
                  <div className="study-tabs">
                    <button className={`tab ${activeTab === "flashcards" ? "active" : ""}`} onClick={() => setActiveTab("flashcards")}>Flashcards</button>
                    <button className={`tab ${activeTab === "mcqs" ? "active" : ""}`} onClick={() => setActiveTab("mcqs")}>MCQs</button>
                  </div>
                  {activeTab === "flashcards" && studyData.flashcards?.length > 0 && (
                    <AnkiCards cards={studyData.flashcards} />
                  )}
                  {activeTab === "mcqs" && studyData.mcqs?.length > 0 && (
                    <MCQSection mcqs={studyData.mcqs} />
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}