import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, X, Volume2, VolumeX, ChevronDown, Trash2, Zap } from "lucide-react";

// ── Indian Language Config ────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en-IN", label: "English", name: "English" },
  { code: "hi-IN", label: "हिंदी", name: "Hindi" },
  { code: "ta-IN", label: "தமிழ்", name: "Tamil" },
  { code: "te-IN", label: "తెలుగు", name: "Telugu" },
  { code: "kn-IN", label: "ಕನ್ನಡ", name: "Kannada" },
  { code: "ml-IN", label: "മലയാളം", name: "Malayalam" },
  { code: "mr-IN", label: "मराठी", name: "Marathi" },
  { code: "gu-IN", label: "ગુજરાતી", name: "Gujarati" },
  { code: "bn-IN", label: "বাংলা", name: "Bengali" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ", name: "Punjabi" },
  { code: "ur-IN", label: "اردو", name: "Urdu" },
];

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

// Fetch with 8-second timeout to prevent infinite hang
const fetchWithTimeout = (url, opts, ms = 8000) => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
};

const askGroq = async (prompt, langName = "English") => {
  const models = ["llama-3.3-70b-versatile", "llama3-8b-8192"];
  for (const model of models) {
    try {
      const r = await fetchWithTimeout(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: 0.7,
          }),
        },
        8000
      );
      if (!r.ok) {
        console.warn(`Groq API error on model ${model}:`, r.status, r.statusText);
        continue;
      }
      const d = await r.json();
      if (d.error) {
        console.warn(`Groq error body on model ${model}:`, d.error);
        continue;
      }
      return d.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
      console.warn(`Groq fetch failed on model ${model}:`, e.message);
    }
  }
  return null;
};

// ── Local fallback: instant keyword-based answers ─────────────────────────────
const localFallback = (query, products, customers, staff, transactions) => {
  const q = query.toLowerCase();
  const today = new Date(); today.setHours(0,0,0,0);
  const getTs = (t) => {
    if (t.createdAt?.seconds) return new Date(t.createdAt.seconds * 1000);
    if (typeof t.createdAt === "number") return new Date(t.createdAt);
    return new Date();
  };
  const todayTx = transactions.filter(t => getTs(t) >= today);
  const todayRev = todayTx.reduce((s, t) => s + Number(t.total || 0), 0);
  const totalRev = transactions.reduce((s, t) => s + Number(t.total || 0), 0);
  const outStock = products.filter(p => p.stock === 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock < 10);
  const vipCust  = customers.filter(c => c.tag === "VIP");
  const activeStaff = staff.filter(s => s.status === "active");

  if (/profit|earn|margin/.test(q)) {
    const profit = todayTx.reduce((s, t) => {
      try {
        const items = typeof t.items === "string" ? JSON.parse(t.items) : (t.items || []);
        return s + items.reduce((ps, item) => {
          const prod = products.find(p => p.id === item.id || p.name === item.name);
          return ps + (Number(item.price || 0) - Number(prod?.cost || 0)) * Number(item.qty || 1);
        }, 0);
      } catch { return s; }
    }, 0);
    return `Today's profit is ₹${Math.round(profit).toLocaleString("en-IN")} from ${todayTx.length} transactions. Total revenue today is ₹${Math.round(todayRev).toLocaleString("en-IN")}.`;
  }
  if (/today|revenue|sales|earning|income/.test(q))
    return `Today's revenue is ₹${Math.round(todayRev).toLocaleString("en-IN")} from ${todayTx.length} transactions. Total all-time revenue is ₹${Math.round(totalRev).toLocaleString("en-IN")}.`;
  if (/out.of.stock|no.stock/.test(q))
    return outStock.length ? `${outStock.length} products are out of stock: ${outStock.slice(0,5).map(p => p.name).join(", ")}.` : "All products are currently in stock.";
  if (/low.stock|running.low|restock/.test(q))
    return lowStock.length ? `${lowStock.length} products have low stock (under 10 units): ${lowStock.slice(0,5).map(p => `${p.name} with ${p.stock} left`).join(", ")}.` : "No products are low on stock.";
  if (/stock|inventor|product/.test(q))
    return `You have ${products.length} products. ${outStock.length} are out of stock and ${lowStock.length} are low on stock.`;
  if (/vip|top.customer|best.customer/.test(q))
    return vipCust.length ? `You have ${vipCust.length} VIP customers: ${vipCust.slice(0,3).map(c => c.name).join(", ")}.` : "No VIP customers yet.";
  if (/customer|visitor|shopper|vip|member/.test(q)) {
    const vipNames = vipCust.map(c => c.name).join(", ");
    return `You have ${customers.length} customers in total, ${vipCust.length} of them are VIP members${vipNames ? ` (${vipNames})` : ""}.`;
  }
  if (/staff|employee|cashier|shift|worker/.test(q)) {
    const names = staff.map(s => s.name).join(", ");
    return `You have ${staff.length} staff members in total (${names || "none"}), and ${activeStaff.length} are currently on shift.`;
  }
  if (/transaction|order|sale/.test(q))
    return `There are ${todayTx.length} transactions today and ${transactions.length} total transactions recorded.`;
  return `Your store has ${products.length} products, ${customers.length} customers, and ${staff.length} staff. Today's revenue is ₹${Math.round(todayRev).toLocaleString("en-IN")} from ${todayTx.length} transactions.`;
};

// ── Build COMPACT store context for AI (keeps prompt small to avoid API errors) ─
const buildContext = (products, customers, staff, transactions, langName = "English") => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const getTs = (t) => {
    if (t.createdAt?.seconds) return new Date(t.createdAt.seconds * 1000);
    if (typeof t.createdAt === "number") return new Date(t.createdAt);
    return new Date();
  };
  const todayTx  = transactions.filter(t => getTs(t) >= today);
  const todayRev  = todayTx.reduce((s, t) => s + Number(t.total || 0), 0);
  const totalRev  = transactions.reduce((s, t) => s + Number(t.total || 0), 0);
  const outStock  = products.filter(p => p.stock === 0);
  const lowStock  = products.filter(p => p.stock > 0 && p.stock < 10);
  const vipCust   = customers.filter(c => c.tag === "VIP");
  const activeStaff = staff.filter(s => s.status === "active");

  // Keep list summaries concise to avoid huge prompts
  const prodSummary = products.slice(0, 15).map(p => `${p.name}(stock:${p.stock},₹${p.price})`).join(",");
  const staffSummary = staff.map(s => `${s.name}(role:${s.role},status:${s.status === "active" ? "on shift" : "on break"})`).join(",");
  const custSummary = customers.slice(0, 15).map(c => `${c.name}(tag:${c.tag},spend:₹${c.spend || 0})`).join(",");

  return `You are SuperMart Voice AI for a grocery supermarket. Reply in ${langName}. Keep answer under 50 words, natural speech, no markdown.
STORE DATA: Today revenue:₹${Math.round(todayRev).toLocaleString("en-IN")} txns:${todayTx.length} | Total revenue:₹${Math.round(totalRev).toLocaleString("en-IN")} txns:${transactions.length}
Products:${products.length} OutOfStock:${outStock.length}(${outStock.slice(0,5).map(p=>p.name).join(",")||"none"}) LowStock:${lowStock.length}(${lowStock.slice(0,5).map(p=>p.name).join(",")||"none"})
Customers:${customers.length} VIP:${vipCust.length} Staff:${staff.length} OnShift:${activeStaff.length}
Staff members: ${staffSummary || "none"}
Customers: ${custSummary || "none"}
Top products: ${prodSummary || "none"}`;
};

// ── Waveform animation bars ───────────────────────────────────────────────────
const WaveForm = ({ active, color = "#7B61FF" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 3, height: 28 }}>
    {[0.6, 1, 0.7, 1.2, 0.5, 0.9, 0.6].map((h, i) => (
      <div key={i} style={{
        width: 3, borderRadius: 99,
        background: color,
        height: active ? `${h * 24}px` : "4px",
        transition: "height 0.15s ease",
        animation: active ? `wave-bar 0.8s ease ${i * 0.1}s infinite alternate` : "none",
      }} />
    ))}
  </div>
);

export default function AIVoiceAssistant({ products = [], customers = [], staff = [], transactions = [], setProducts, setCustomers }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState([]);
  const [langCode, setLangCode] = useState("en-IN");
  const [muteVoice, setMuteVoice] = useState(false);
  const [showLang, setShowLang] = useState(false);
  const [pulse, setPulse] = useState(true);
  const [permError, setPermError] = useState("");
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const historyRef = useRef(null);
  const transcriptRef = useRef("");
  
  // Keep values fresh in a ref to avoid stale closures in listeners
  const stateRef = useRef({ products, customers, staff, transactions });
  useEffect(() => {
    stateRef.current = { products, customers, staff, transactions };
  }, [products, customers, staff, transactions]);

  const langObj = LANGUAGES.find(l => l.code === langCode) || LANGUAGES[0];

  useEffect(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, [history]);

  // ── Speak text ───────────────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    if (muteVoice || !text) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = langCode;
    utt.rate = 0.95;
    utt.pitch = 1;
    // Try to find a matching voice
    const voices = synthRef.current.getVoices();
    const match = voices.find(v => v.lang === langCode) || voices.find(v => v.lang.startsWith(langCode.split("-")[0]));
    if (match) utt.voice = match;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    synthRef.current.speak(utt);
  }, [muteVoice, langCode]);

  // ── Process voice query ───────────────────────────────────────────────────────
  const processQuery = useCallback(async (query) => {
    if (!query.trim()) return;
    setThinking(true);
    setReply("");
    let finalReply = "";
    
    // Read fresh values from stateRef bridge to prevent stale closures
    const { products: curProds, customers: curCusts, staff: curStaff, transactions: curTx } = stateRef.current;
    
    try {
      // Try Groq AI first with a compact prompt
      const context = buildContext(curProds, curCusts, curStaff, curTx, langObj.name);
      const prompt = `${context}\nUSER QUERY: "${query}"\nAnswer:`;
      const aiReply = await askGroq(prompt, langObj.name);
      if (aiReply) {
        finalReply = aiReply;
      } else {
        // Groq failed or timed out → use local instant fallback
        finalReply = localFallback(query, curProds, curCusts, curStaff, curTx);
      }
    } catch (err) {
      console.error("processQuery error:", err);
      finalReply = localFallback(query, curProds, curCusts, curStaff, curTx);
    } finally {
      // ALWAYS reset thinking, even if something crashes
      setThinking(false);
    }
    setReply(finalReply);
    setHistory(h => [...h, { q: query, a: finalReply, lang: langObj.label }]);
    speak(finalReply);
  }, [langObj, speak]);

  // ── Start listening ───────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    setPermError("");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setPermError("Speech recognition not supported in this browser. Use Chrome."); return; }
    synthRef.current.cancel();
    setSpeaking(false);
    
    const rec = new SR();
    rec.lang = langCode;
    rec.interimResults = true;
    rec.continuous = false;
    
    rec.onstart = () => { 
      setListening(true); 
      setTranscript(""); 
      transcriptRef.current = "";
      setPulse(false); 
    };
    
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      transcriptRef.current = t;
      setTranscript(t);
    };
    
    rec.onend = () => {
      setListening(false);
      const finalText = transcriptRef.current.trim();
      if (finalText) {
        processQuery(finalText);
      }
    };
    
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") setPermError("Microphone permission denied. Please allow mic access.");
      else if (e.error === "no-speech") setPermError("No speech detected. Please try again.");
    };
    
    recognitionRef.current = rec;
    rec.start();
  }, [langCode, processQuery]);

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };
  const stopSpeaking = () => { synthRef.current.cancel(); setSpeaking(false); };

  const toggleOpen = () => {
    setOpen(o => !o);
    if (listening) stopListening();
    if (speaking) stopSpeaking();
  };

  const ui = (
    <>
      <style>{`
        @keyframes wave-bar { from { transform: scaleY(0.4); } to { transform: scaleY(1.4); } }
        @keyframes pulse-ring { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.15);opacity:0.2} }
        @keyframes va-fadein { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes orbit-glow { 0%,100%{box-shadow:0 0 24px rgba(123,97,255,0.6),0 0 48px rgba(123,97,255,0.2)} 50%{box-shadow:0 0 32px rgba(0,255,209,0.6),0 0 64px rgba(0,255,209,0.2)} }
        @keyframes listening-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,79,216,0.5)} 50%{box-shadow:0 0 0 16px rgba(255,79,216,0)} }
      `}</style>

      {/* ── Floating Mic Button ── */}
      <div style={{ position: "fixed", bottom: 40, right: 28, zIndex: 99999, pointerEvents: "all" }}>
        {pulse && !open && (
          <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: "2px solid rgba(123,97,255,0.5)", animation: "pulse-ring 2s ease infinite", pointerEvents: "none" }} />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
          title="SuperMart Voice Assistant"
          style={{
            width: 60, height: 60, borderRadius: "50%",
            background: listening
              ? "linear-gradient(135deg, #FF4FD8, #FF2060)"
              : "linear-gradient(135deg, #7B61FF, #00FFD1)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: listening ? "0 0 0 0 rgba(255,79,216,0.5)" : "0 8px 32px rgba(123,97,255,0.5)",
            transition: "all 0.3s ease",
            animation: listening ? "listening-pulse 1s ease infinite" : open ? "orbit-glow 3s ease infinite" : "none",
            pointerEvents: "all",
            position: "relative",
            zIndex: 99999,
          }}
        >
          {open && !listening ? <X size={24} color="#fff" /> : listening ? <MicOff size={24} color="#fff" /> : <Mic size={24} color="#fff" />}
        </button>
        {pulse && !open && (
          <div style={{ position: "absolute", top: -10, right: -6, background: "linear-gradient(135deg,#FF4FD8,#7B61FF)", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap", letterSpacing: "0.04em", pointerEvents: "none" }}>
            VOICE AI
          </div>
        )}
      </div>

      {/* ── Voice Assistant Panel ── */}
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
          position: "fixed", bottom: 116, right: 28, width: 400,
          background: "rgba(11,13,28,0.97)", backdropFilter: "blur(28px)",
          border: "1px solid rgba(123,97,255,0.3)", borderRadius: 24,
          display: "flex", flexDirection: "column", zIndex: 99998,
          boxShadow: "0 32px 100px rgba(0,0,0,0.7), 0 0 60px rgba(123,97,255,0.1)",
          animation: "va-fadein 0.25s ease", overflow: "hidden",
          maxHeight: "80vh",
          pointerEvents: "all",
        }}>

          {/* Header */}
          <div style={{
            padding: "16px 20px", flexShrink: 0,
            background: "linear-gradient(135deg, rgba(123,97,255,0.15), rgba(0,255,209,0.08))",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "linear-gradient(135deg,#7B61FF,#00FFD1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 20px rgba(123,97,255,0.4)" }}>
              <Mic size={20} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "'Space Grotesk',sans-serif" }}>SuperMart Voice AI</div>
              <div style={{ color: "#00FFD1", fontSize: 11, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FFD1", boxShadow: "0 0 6px #00FFD1" }} />
                Groq AI · {langObj.name} · Live Data
              </div>
            </div>
            {/* Mute Toggle */}
            <button onClick={() => setMuteVoice(m => !m)} title={muteVoice ? "Unmute" : "Mute voice"}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: muteVoice ? "#FF4FD8" : "#B7C0E0", display: "flex" }}>
              {muteVoice ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            {/* Clear history */}
            <button onClick={() => { setHistory([]); setReply(""); setTranscript(""); }} title="Clear"
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "#7E89B0", display: "flex" }}>
              <Trash2 size={15} />
            </button>
          </div>

          {/* Language Selector */}
          <div style={{ padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0, position: "relative" }}>
            <button onClick={() => setShowLang(s => !s)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(123,97,255,0.1)", border: "1px solid rgba(123,97,255,0.25)", borderRadius: 10, padding: "7px 14px", cursor: "pointer", color: "#fff", fontSize: 12, fontWeight: 600, width: "100%" }}>
              <span style={{ fontSize: 13 }}>🌐</span>
              <span style={{ flex: 1, textAlign: "left" }}>{langObj.label} — {langObj.name}</span>
              <ChevronDown size={14} color="#7B61FF" style={{ transform: showLang ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {showLang && (
              <div style={{ position: "absolute", top: "calc(100% - 4px)", left: 18, right: 18, background: "rgba(13,16,32,0.99)", border: "1px solid rgba(123,97,255,0.3)", borderRadius: 12, overflow: "hidden", zIndex: 10, boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}>
                {LANGUAGES.map(l => (
                  <button key={l.code} onClick={() => { setLangCode(l.code); setShowLang(false); }}
                    style={{ width: "100%", padding: "9px 14px", background: l.code === langCode ? "rgba(123,97,255,0.15)" : "transparent", border: "none", cursor: "pointer", color: l.code === langCode ? "#7B61FF" : "#B7C0E0", fontSize: 13, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: l.code === langCode ? 700 : 400 }}>
                    <span>{l.label}</span><span style={{ fontSize: 11, opacity: 0.6 }}>{l.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conversation History */}
          <div ref={historyRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            {history.length === 0 && !thinking && !transcript && (
              <div style={{ textAlign: "center", padding: "28px 20px" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(123,97,255,0.1)", border: "1px solid rgba(123,97,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <Mic size={24} color="rgba(123,97,255,0.7)" />
                </div>
                <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Tap the mic and speak</p>
                <p style={{ color: "#7E89B0", fontSize: 12, lineHeight: 1.6 }}>
                  Try: "What is today's profit?" or "Which products are low on stock?" or "How many VIP customers do we have?"
                </p>
              </div>
            )}
            {history.map((h, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* User bubble */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ maxWidth: "82%", background: "rgba(123,97,255,0.2)", border: "1px solid rgba(123,97,255,0.3)", borderRadius: "14px 14px 4px 14px", padding: "9px 13px" }}>
                    <p style={{ color: "#fff", fontSize: 13, margin: 0, lineHeight: 1.5 }}>🎤 {h.q}</p>
                  </div>
                </div>
                {/* AI bubble */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#7B61FF,#00FFD1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Zap size={13} color="#fff" />
                  </div>
                  <div style={{ maxWidth: "82%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px 14px 14px 4px", padding: "9px 13px" }}>
                    <p style={{ color: "#E0E6FF", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{h.a}</p>
                    <span style={{ fontSize: 10, color: "#7E89B0", marginTop: 4, display: "block" }}>{h.lang}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Status / Waveform area */}
          <div style={{ padding: "12px 20px 8px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
            {permError && (
              <div style={{ background: "rgba(255,79,216,0.1)", border: "1px solid rgba(255,79,216,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                <p style={{ color: "#FF4FD8", fontSize: 12, margin: 0 }}>⚠️ {permError}</p>
              </div>
            )}

            {/* Live transcript */}
            {(listening || transcript) && !thinking && (
              <div style={{ background: "rgba(255,79,216,0.08)", border: "1px solid rgba(255,79,216,0.2)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <WaveForm active={listening} color="#FF4FD8" />
                  <span style={{ color: "#FF4FD8", fontSize: 11, fontWeight: 700 }}>{listening ? "LISTENING…" : "HEARD"}</span>
                </div>
                <p style={{ color: "#fff", fontSize: 13, margin: 0, fontStyle: transcript ? "normal" : "italic", opacity: transcript ? 1 : 0.5 }}>
                  {transcript || "Speak now…"}
                </p>
              </div>
            )}

            {/* AI thinking */}
            {thinking && (
              <div style={{ background: "rgba(123,97,255,0.08)", border: "1px solid rgba(123,97,255,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <WaveForm active={true} color="#7B61FF" />
                <span style={{ color: "#7B61FF", fontSize: 12, fontWeight: 600 }}>Analyzing store data…</span>
              </div>
            )}

            {/* Speaking indicator */}
            {speaking && (
              <div style={{ background: "rgba(0,255,209,0.07)", border: "1px solid rgba(0,255,209,0.2)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <WaveForm active={true} color="#00FFD1" />
                  <span style={{ color: "#00FFD1", fontSize: 11, fontWeight: 700 }}>SPEAKING…</span>
                </div>
                <button onClick={stopSpeaking} style={{ background: "rgba(0,255,209,0.1)", border: "1px solid rgba(0,255,209,0.3)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", color: "#00FFD1", fontSize: 11, fontWeight: 600 }}>Stop</button>
              </div>
            )}

            {/* Mic button row */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
              <button
                onClick={listening ? stopListening : startListening}
                disabled={thinking}
                style={{
                  flex: 1, padding: "13px 0",
                  background: listening
                    ? "linear-gradient(135deg,#FF4FD8,#FF2060)"
                    : thinking
                      ? "rgba(123,97,255,0.3)"
                      : "linear-gradient(135deg,#7B61FF,#00FFD1)",
                  border: "none", borderRadius: 14, cursor: thinking ? "default" : "pointer",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: listening ? "0 0 24px rgba(255,79,216,0.4)" : "0 4px 20px rgba(123,97,255,0.3)",
                  transition: "all 0.2s ease",
                  animation: listening ? "listening-pulse 1.2s ease infinite" : "none",
                  opacity: thinking ? 0.6 : 1,
                  fontFamily: "'Space Grotesk',sans-serif",
                }}
              >
                {listening ? <><MicOff size={18} /> Stop Listening</> : thinking ? "Thinking…" : <><Mic size={18} /> Tap to Speak</>}
              </button>
            </div>
            <p style={{ color: "#4A5080", fontSize: 10, textAlign: "center", marginTop: 6 }}>
              {langObj.name} · Groq llama-3.3-70b · Live Firebase Data
            </p>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(ui, document.body);
}
