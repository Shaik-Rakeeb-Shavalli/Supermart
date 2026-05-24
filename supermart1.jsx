import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import {
  LayoutDashboard, Package, BarChart3, Users, Brain, Settings, LogOut, Bell,
  Plus, Minus, X, Edit2, Trash2, CreditCard, Banknote, Search, QrCode,
  Zap, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Download,
  Filter, ShoppingCart, UserCog, Receipt, Star, Cpu, CheckCircle2, RefreshCw,
  Activity, Save, Printer, AlertTriangle, Check, ChevronDown, Eye, EyeOff, Sun, Moon,
  Image, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Link
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart as RPieChart, Pie, Cell, Legend
} from "recharts";
import CsvImportModule from "./CsvImportModule.jsx";
import AIVoiceAssistant from "./AIVoiceAssistant.jsx";
import LandingPage from "./LandingPage.jsx";


// ─── CONFIG ───────────────────────────────────────────────────────────────────
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────
import { fbGet, fbInsert, fbUpdate, fbDelete, auth } from "./firebase.js";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

// Aliases so all existing code continues to work unchanged
const sbGet    = (table, _q) => fbGet(table);
const sbInsert = (table, data) => fbInsert(table, data);
const sbUpdate = (table, id, data) => fbUpdate(table, id, data);
const sbDelete = (table, id) => fbDelete(table, id);

// ─── IMAGE PERSISTENCE (localStorage bridge) ───────────────────────────────────────
// Supabase may not have an `img` column, so we persist base64 images in localStorage
const IMG_KEY = "supermart_prod_imgs";
const getStoredImgs = () => { try { return JSON.parse(localStorage.getItem(IMG_KEY) || "{}"); } catch { return {}; } };
const storeImg = (id, img) => {
  const imgs = getStoredImgs();
  if (img) imgs[String(id)] = img; else delete imgs[String(id)];
  localStorage.setItem(IMG_KEY, JSON.stringify(imgs));
};
const mergeStoredImgs = (products) => {
  const imgs = getStoredImgs();
  return products.map(p => ({ ...p, img: p.img || imgs[String(p.id)] || "" }));
};

// ─── PRODUCT PERSISTENCE (localStorage fallback) ─────────────────────────────
// Products saved here survive refresh/re-login even if Supabase rejects the write
const LP_KEY = "supermart_local_prods";
const getLocalProds = () => { try { return JSON.parse(localStorage.getItem(LP_KEY) || "[]"); } catch { return []; } };
const saveLocalProd = (prod) => {
  const list = getLocalProds();
  const idx = list.findIndex(p => String(p.id) === String(prod.id));
  if (idx >= 0) list[idx] = prod; else list.push(prod);
  localStorage.setItem(LP_KEY, JSON.stringify(list));
};
const removeLocalProd = (id) => {
  localStorage.setItem(LP_KEY, JSON.stringify(getLocalProds().filter(p => String(p.id) !== String(id))));
};
// Merge DB products with any local-only products (not yet confirmed in DB)
const mergeLocalProds = (dbProds) => {
  const local = getLocalProds();
  const localOnly = local.filter(lp => !dbProds.find(dp => String(dp.id) === String(lp.id)));
  // also update DB products with any local edits applied
  const merged = dbProds.map(dp => { const lp = local.find(x => String(x.id) === String(dp.id)); return lp ? { ...dp, ...lp } : dp; });
  return [...merged, ...localOnly];
};

// ─── GROQ AI ─────────────────────────────────────────────────────────────────
const askGroq = async (prompt) => {
  const models = ["llama-3.3-70b-versatile", "llama3-8b-8192"];
  for (const model of models) {
    try {
      const r = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 512,
            temperature: 0.7,
          }),
        }
      );
      const d = await r.json();
      if (d.error) {
        console.warn(`Groq [${model}] error:`, d.error.message);
        if (d.error.type === "invalid_request_error") return `__ERROR__: Bad request — ${d.error.message}`;
        continue; // try next model
      }
      const text = d.choices?.[0]?.message?.content;
      if (text) return text;
    } catch (e) {
      console.warn(`Groq [${model}] fetch error:`, e.message);
    }
  }
  return null; // all models failed
};

// ─── LOCAL SMART ANSWER ENGINE ────────────────────────────────────────────────
const localAnswer = (question, products, customers, staff) => {
  const q = question.toLowerCase();
  const outStock   = products.filter(p => p.stock === 0);
  const critical   = products.filter(p => p.stock > 0 && p.stock < 3);
  const lowStock   = products.filter(p => p.stock >= 3 && p.stock < 10);
  const vips       = customers.filter(c => c.tag === "VIP");
  const activeStaff = staff.filter(s => s.status === "active");
  const totalSpend  = customers.reduce((s, c) => s + Number(c.spend || 0), 0);
  const topSpender  = [...customers].sort((a, b) => Number(b.spend) - Number(a.spend))[0];

  if (/revenue|sales|earning|income|money|turnover/.test(q))
    return `💰 Revenue data is tracked live from Firebase.\n• Total transactions recorded: check Dashboard\n• Add sales via the POS terminal to see revenue grow here.`;

  if (/stock|inventor|restock|out.of|product|item/.test(q)) {
    if (/low|critical|restock|alert|urgent/.test(q) || /out.of/.test(q)) {
      let r = `⚠️ Stock Alerts\n`;
      if (outStock.length)  r += `\n⛔ Out of Stock (${outStock.length}):\n${outStock.map(p => `• ${p.name}`).join("\n")}`;
      if (critical.length)  r += `\n\n🔴 Critical (<3 units) (${critical.length}):\n${critical.map(p => `• ${p.name}: ${p.stock} left`).join("\n")}`;
      if (lowStock.length)  r += `\n\n🟡 Low Stock (<10 units) (${lowStock.length}):\n${lowStock.map(p => `• ${p.name}: ${p.stock} left`).join("\n")}`;
      if (!outStock.length && !critical.length && !lowStock.length) r += `\nAll products are well-stocked ✅`;
      return r;
    }
    return `📦 Inventory Overview\n• Total Products: ${products.length}\n• ⛔ Out of Stock: ${outStock.length}\n• 🔴 Critical Stock: ${critical.length}\n• 🟡 Low Stock: ${lowStock.length}\n• ✅ Healthy: ${products.length - outStock.length - critical.length - lowStock.length}`;
  }

  if (/customer|vip|loyal|member|visitor|shopper/.test(q)) {
    if (/vip|top|best/.test(q))
      return `⭐ VIP Customers (${vips.length})\n${vips.map(c => `• ${c.name} — ₹${Number(c.spend).toLocaleString("en-IN")} spent, ${c.visits} visits, ${c.points} pts`).join("\n") || "No VIP customers yet."}`;
    return `👥 Customer Summary\n• Total: ${customers.length}  •  VIP: ${vips.length}\n• Top Spender: ${topSpender?.name || "N/A"} (₹${Number(topSpender?.spend || 0).toLocaleString("en-IN")})\n• Avg Spend: ₹${customers.length ? Math.round(totalSpend / customers.length).toLocaleString("en-IN") : 0}\n• Regular: ${customers.filter(c => c.tag === "Regular").length}  •  Inactive: ${customers.filter(c => c.tag === "Inactive").length}`;
  }

  if (/staff|cashier|employee|worker|shift|counter/.test(q))
    return `👨‍💼 Staff (${staff.length} total, ${activeStaff.length} on shift)\n\n${staff.map(s => `• ${s.name} [${s.role}] — ${s.counter || "—"} — ${s.status === "active" ? "🟢 On Shift" : "🟡 Break"}\n  Sales: ${s.sales || 0}  Revenue: ₹${Number(s.rev || 0).toLocaleString("en-IN")}`).join("\n")}`;

  if (/forecast|predict|ai|reorder|suggest/.test(q)) {
    const reorder = products.filter(p => p.stock < 10).sort((a, b) => a.stock - b.stock);
    if (reorder.length === 0) return "🤖 All products are sufficiently stocked. No reorders needed right now.";
    return `🤖 AI Restock Forecast (by urgency)\n${reorder.map(p => `• ${p.stock === 0 ? "⛔" : p.stock < 3 ? "🔴" : "🟡"} ${p.name}: ${p.stock} units left — restock recommended`).join("\n")}`;
  }

  if (/payment|pay|upi|cash|card|mode/.test(q))
    return `💳 Payment modes tracked live per transaction in the POS terminal. Use the Dashboard > Analytics section to see payment breakdowns.`;

  return `📊 Store Overview — SuperMart\n\n📦 Inventory: ${products.length} products (${outStock.length} out of stock)\n👥 Customers: ${customers.length} (${vips.length} VIPs)\n👨‍💼 Staff: ${activeStaff.length} of ${staff.length} on shift\n\nAsk me about: stock, customers, staff, forecasts!`;
};



// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK_THEME = {
  bg: "#070711", surf: "#111322", surfAlt: "#15182B", surfHover: "#1A1E35",
  border: "rgba(255,255,255,0.08)", borderGlow: "rgba(123,97,255,0.35)",
  accent: "#7B61FF", accentB: "#4DA3FF", cyan: "#00FFD1", pink: "#FF4FD8",
  alt: "#00FFD1", danger: "#FF4FD8", warn: "#FFB547",
  text: "#FFFFFF", textSec: "#B7C0E0", muted: "#7E89B0",
  mono: '"JetBrains Mono",monospace',
  glowPurple: "0 0 24px rgba(123,97,255,0.35)",
  glowBlue:   "0 0 24px rgba(77,163,255,0.3)",
  glowCyan:   "0 0 24px rgba(0,255,209,0.25)",
  radius: "20px", radiusSm: "12px", mode: "dark",
};
const LIGHT_THEME = {
  bg: "#F0F2FA", surf: "#FFFFFF", surfAlt: "#F5F6FD", surfHover: "#ECEEF8",
  border: "rgba(0,0,0,0.09)", borderGlow: "rgba(106,81,255,0.3)",
  accent: "#6A51FF", accentB: "#3B8EFF", cyan: "#00B896", pink: "#D6248A",
  alt: "#00B896", danger: "#D6248A", warn: "#C07000",
  text: "#0D0F1A", textSec: "#3D4466", muted: "#6B718C",
  mono: '"JetBrains Mono",monospace',
  glowPurple: "0 0 24px rgba(106,81,255,0.15)",
  glowBlue:   "0 0 24px rgba(59,142,255,0.15)",
  glowCyan:   "0 0 24px rgba(0,184,150,0.15)",
  radius: "20px", radiusSm: "12px", mode: "light",
};

const ThemeContext = createContext(DARK_THEME);
const useTheme = () => useContext(ThemeContext);

// A is a module-level alias used by legacy code (updated on each render via ThemeProvider)
let A = DARK_THEME;

// ─── POS LUXURY THEME (Maison Aurum — matches Customer Website) ───────────────
const P = {
  // Core surfaces
  bg:       "#0A0906",           // obsidian — deepest background
  surf:     "rgba(26,22,16,0.92)", // dark ink surface with glass feel
  surfAlt:  "rgba(36,30,20,0.88)", // slightly lighter surface
  border:   "rgba(201,168,76,0.18)", // gold glass border
  borderHover: "rgba(201,168,76,0.45)", // gold border on hover

  // Gold palette
  gold:     "#C9A84C",
  goldLight:"#E8C97A",
  goldDim:  "#7A6130",
  goldGlow: "rgba(201,168,76,0.25)",

  // Text
  text:     "#F7F3EC",           // ivory
  textSec:  "#EDE7DA",           // ivory-dark
  muted:    "#8C8070",           // ash
  dim:      "#5A5448",           // stone

  // Accents / Semantic
  accent:   "#C9A84C",           // gold as primary accent
  success:  "#4CAF7A",
  danger:   "#D4645C",
  warn:     "#E8A84C",

  // Glassmorphism
  glass:    "rgba(247,243,236,0.05)",
  glassBorder: "rgba(201,168,76,0.2)",
  blur:     "saturate(180%) blur(20px)",

  // Typography
  fontDisplay: "'Cormorant Garamond', Georgia, serif",
  fontLabel:   "'Tenor Sans', sans-serif",
  fontBody:    "'Montserrat', sans-serif",
  mono:     "'JetBrains Mono', monospace",

  // Shadows
  shadowGold: "0 8px 40px rgba(201,168,76,0.18)",
  shadowDeep: "0 24px 64px rgba(0,0,0,0.6)",
};

// ─── DEFAULT DATA ─────────────────────────────────────────────────────────────
const FONT = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Tenor+Sans&family=Montserrat:wght@200;300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Montserrat',sans-serif;font-weight:300;background:#0A0906;color:#F7F3EC;line-height:1.7}

/* ── POS Luxury scrollbar ── */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:#0A0906}
::-webkit-scrollbar-thumb{background:rgba(201,168,76,0.35);border-radius:10px}
::-webkit-scrollbar-thumb:hover{background:rgba(201,168,76,0.65)}

/* ── Keyframes ── */
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes fadein{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeinfast{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes toastin{from{opacity:0;transform:translateX(110%)}to{opacity:1;transform:translateX(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes glowPulse{0%,100%{box-shadow:0 0 20px rgba(201,168,76,0.25)}50%{box-shadow:0 0 40px rgba(201,168,76,0.55)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes goldShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
@keyframes goldPulse{0%,100%{border-color:rgba(201,168,76,0.2)}50%{border-color:rgba(201,168,76,0.55)}}
@keyframes ripple{0%{transform:scale(0);opacity:0.8}100%{transform:scale(3);opacity:0}}

/* ── Glass card base (luxury) ── */
.pos-glass{
  background:rgba(26,22,16,0.85);
  backdrop-filter:saturate(180%) blur(20px);
  -webkit-backdrop-filter:saturate(180%) blur(20px);
  border:1px solid rgba(201,168,76,0.18);
  border-radius:14px;
  transition:border-color 0.35s,box-shadow 0.35s,transform 0.35s cubic-bezier(0.16,1,0.3,1);
}
.pos-glass:hover{
  border-color:rgba(201,168,76,0.42);
  box-shadow:0 8px 40px rgba(201,168,76,0.12),0 0 0 1px rgba(201,168,76,0.08) inset;
  transform:translateY(-2px);
}
.pos-btn-gold{
  font-family:'Tenor Sans',sans-serif;
  letter-spacing:0.12em;
  text-transform:uppercase;
  font-size:0.7rem;
  background:linear-gradient(135deg,#C9A84C,#E8C97A);
  color:#0A0906;
  border:none;
  border-radius:6px;
  cursor:pointer;
  transition:opacity 0.25s,transform 0.25s cubic-bezier(0.16,1,0.3,1),box-shadow 0.25s;
}
.pos-btn-gold:hover{
  opacity:0.9;
  transform:translateY(-1px);
  box-shadow:0 8px 32px rgba(201,168,76,0.38);
}
.pos-btn-ghost{
  font-family:'Tenor Sans',sans-serif;
  letter-spacing:0.1em;
  text-transform:uppercase;
  font-size:0.68rem;
  background:transparent;
  color:rgba(201,168,76,0.85);
  border:1px solid rgba(201,168,76,0.28);
  border-radius:6px;
  cursor:pointer;
  transition:background 0.25s,border-color 0.25s,box-shadow 0.25s;
}
.pos-btn-ghost:hover{
  background:rgba(201,168,76,0.1);
  border-color:rgba(201,168,76,0.55);
  box-shadow:0 0 16px rgba(201,168,76,0.15);
}

/* Admin panel legacy classes remain unchanged */
.neo-card{background:rgba(17,19,34,0.8);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:20px;transition:all 0.3s ease}
.neo-card:hover{border-color:rgba(123,97,255,0.35);box-shadow:0 8px 32px rgba(123,97,255,0.15);transform:translateY(-2px)}
.neo-btn{transition:all 0.2s ease}
.neo-btn:hover{transform:translateY(-1px);filter:brightness(1.1)}
`;

const INIT_PRODUCTS = [];
const INIT_CUSTOMERS = [];
const INIT_STAFF = [];
const CATC = ["#6C63FF", "#00D4AA", "#FFB547", "#FF4D6D", "#7C3AED", "#06B6D4"];
const INIT_NOTIFS = [];
const TICKER = [];

// ─── TOAST SYSTEM ─────────────────────────────────────────────────────────────
let _addToast = null;
const Toast = () => {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _addToast = (msg, type = "success") => {
      const id = Date.now();
      setToasts(p => [...p, { id, msg, type }]);
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
    };
    return () => { _addToast = null; };
  }, []);
  const colors = { success: A.alt, error: A.danger, warn: A.warn, info: A.accent };
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: A.surf, border: `1px solid ${colors[t.type] || A.accent}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, minWidth: 280, animation: "toastin 0.25s ease", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[t.type] || A.accent, flexShrink: 0 }} />
          <span style={{ color: A.text, fontSize: 13 }}>{t.msg}</span>
          <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} style={{ marginLeft: "auto", background: "none", border: "none", color: A.muted, cursor: "pointer", display: "flex" }}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
};
const toast = (msg, type = "success") => _addToast?.(msg, type);

// ─── MODAL ────────────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children, width = 480 }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
    <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto", animation: "fadein 0.2s ease" }}>
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${A.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: A.surf, zIndex: 1 }}>
        <h3 style={{ color: A.text, fontSize: 16, fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: A.muted, display: "flex" }}><X size={18} /></button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

const ConfirmModal = ({ msg, onConfirm, onClose }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
    <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, width: "100%", maxWidth: 380, padding: 28, animation: "fadein 0.2s ease", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, background: `${A.danger}18`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><AlertTriangle size={24} color={A.danger} /></div>
      <h3 style={{ color: A.text, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Confirm Delete</h3>
      <p style={{ color: A.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{msg}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 12, background: "none", border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
        <button onClick={onConfirm} style={{ flex: 1, padding: 12, background: A.danger, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 700 }}>Delete</button>
      </div>
    </div>
  </div>
);

// ─── FORM FIELD ───────────────────────────────────────────────────────────────
const Field = ({ label, children, required }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <label style={{ color: A.muted, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 }}>{label}{required && <span style={{ color: A.danger }}> *</span>}</label>
    {children}
  </div>
);
const Input = (props) => (
  <input {...props} style={{ width: "100%", padding: "10px 12px", background: A.bg, border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 13, outline: "none", ...props.style }} />
);
const Select = ({ value, onChange, children, ...rest }) => (
  <select value={value} onChange={onChange} style={{ width: "100%", padding: "10px 12px", background: A.bg, border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 13, outline: "none", ...rest.style }}>
    {children}
  </select>
);

// ─── UTILITY COMPONENTS ───────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 8, padding: "10px 14px" }}>
    <p style={{ color: A.muted, fontSize: 11, marginBottom: 6 }}>{label}</p>
    {payload.map((p, i) => <p key={i} style={{ color: p.color || A.text, fontSize: 13, fontFamily: A.mono, fontWeight: 600 }}>{p.name}: ₹{Number(p.value).toLocaleString("en-IN")}</p>)}
  </div>;
};
const Badge = ({ status }) => {
  const m = { active: { bg: "#00D4AA20", c: "#00D4AA", l: "Active" }, low: { bg: "#FFB54720", c: "#FFB547", l: "Low Stock" }, critical: { bg: "#FF4D6D20", c: "#FF4D6D", l: "Critical" }, out: { bg: "#6B6B8020", c: A.muted, l: "Out of Stock" } };
  const s = m[status] || m.active;
  return <span style={{ background: s.bg, color: s.c, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{s.l}</span>;
};
const TagBadge = ({ tag }) => {
  const m = { VIP: { bg: "#6C63FF20", c: "#6C63FF" }, Regular: { bg: "#00D4AA20", c: "#00D4AA" }, Inactive: { bg: "#6B6B8020", c: A.muted } };
  const s = m[tag] || m.Regular;
  return <span style={{ background: s.bg, color: s.c, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{tag}</span>;
};
const UrgBadge = ({ urg }) => {
  const m = { critical: { bg: "#FF4D6D20", c: "#FF4D6D", l: "Critical" }, high: { bg: "#FFB54720", c: "#FFB547", l: "High" }, medium: { bg: "#6C63FF20", c: "#6C63FF", l: "Medium" }, low: { bg: "#00D4AA20", c: "#00D4AA", l: "Low" } };
  const s = m[urg] || m.medium;
  return <span style={{ background: s.bg, color: s.c, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{s.l}</span>;
};
const KPI = ({ label, value, delta, icon: Icon, color, prefix = "₹" }) => (
  <div style={{
    background: "rgba(17,19,34,0.9)",
    backdropFilter: "blur(20px)",
    border: `1px solid rgba(255,255,255,0.08)`,
    borderRadius: 20,
    padding: "24px 28px",
    flex: 1, minWidth: 180,
    position: "relative",
    overflow: "hidden",
    transition: "all 0.3s ease",
    cursor: "default",
  }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(123,97,255,0.4)"; e.currentTarget.style.boxShadow = "0 8px 40px rgba(123,97,255,0.15)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
  >
    {/* ambient glow corner */}
    <div style={{ position:"absolute", top:-30, right:-30, width:80, height:80, borderRadius:"50%", background:`${color}25`, filter:"blur(20px)", pointerEvents:"none" }} />
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
      <span style={{ color: A.muted, fontSize: 11, letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600 }}>{label}</span>
      <div style={{ background:`${color}18`, border:`1px solid ${color}35`, borderRadius:12, padding:"8px 10px", display:"flex", boxShadow:`0 0 14px ${color}30` }}>
        <Icon size={16} color={color} />
      </div>
    </div>
    <div style={{ color: A.text, fontSize: 32, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", letterSpacing:"-0.02em", lineHeight:1 }}>
      {prefix}{typeof value === "number" ? value.toLocaleString("en-IN") : value}
    </div>
    <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:5 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background: A.cyan, boxShadow:`0 0 6px ${A.cyan}` }} />
      <span style={{ color: A.muted, fontSize: 11, fontFamily: A.mono }}>Live · Firebase</span>
    </div>
  </div>
);

const Spinner = () => <div style={{ width: 18, height: 18, border: `2px solid ${A.border}`, borderTop: `2px solid ${A.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />;
const ProdImg = ({ img, e, size = 52 }) => {
  const [err, setErr] = useState(false);
  if (!img || err) return <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{e}</span>;
  return <img src={img} onError={() => setErr(true)} alt="" style={{ width: size, height: size, objectFit: "contain", borderRadius: 6 }} />;
};

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "products", label: "Products", icon: Package },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "ai", label: "AI Forecast", icon: Brain },
  { id: "customers", label: "Customers", icon: Users },
  { id: "staff", label: "Staff", icon: UserCog },
  { id: "banners", label: "Banners", icon: Image },
  { id: "settings", label: "Settings", icon: Settings },
];
const Sidebar = ({ sec, setSec, onLogout, pinned, setPinned, hovered, setHovered }) => {
  const expanded = pinned || hovered;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: expanded ? 240 : 72,
        height: "100vh",
        background: "rgba(10,12,26,0.97)",
        backdropFilter: "blur(24px)",
        borderRight: `1px solid ${expanded ? "rgba(123,97,255,0.2)" : "rgba(255,255,255,0.06)"}`,
        boxShadow: expanded ? "6px 0 40px rgba(0,0,0,0.6), 2px 0 20px rgba(123,97,255,0.06)" : "2px 0 12px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        left: 0, top: 0,
        zIndex: 200,
        transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease, box-shadow 0.4s ease",
        willChange: "width",
        overflowX: "hidden",
        overflowY: "hidden",
      }}
    >
      {/* Logo row */}
      <div style={{
        padding: "20px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 74,
        overflow: "hidden",
      }}>
        {/* Zap icon always centered in the 72px space */}
        <div style={{
          width: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: "linear-gradient(135deg, #7B61FF, #4DA3FF)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(123,97,255,0.5)",
            animation: "glowPulse 3s ease infinite",
            flexShrink: 0,
          }}><Zap size={20} color="#fff" /></div>
        </div>
        {/* Brand text — fades in when expanded */}
        <div style={{
          flex: 1,
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateX(0)" : "translateX(-8px)",
          transition: "opacity 0.25s ease, transform 0.25s ease",
          pointerEvents: expanded ? "auto" : "none",
          minWidth: 0,
        }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>SuperMart</div>
          <div style={{ color: A.muted, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>AI Retail OS</div>
        </div>
        {/* Pin toggle — only when expanded */}
        <div style={{
          width: expanded ? 44 : 0,
          overflow: "hidden",
          flexShrink: 0,
          transition: "width 0.3s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); const next = !pinned; setPinned(next); try { localStorage.setItem("supermart_sidebar_pinned", String(next)); } catch {} }}
            title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            style={{
              background: pinned ? "rgba(123,97,255,0.2)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${pinned ? "rgba(123,97,255,0.4)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8,
              width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              color: pinned ? "#7B61FF" : "#fff",
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = pinned ? "rgba(123,97,255,0.3)" : "rgba(255,255,255,0.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = pinned ? "rgba(123,97,255,0.2)" : "rgba(255,255,255,0.05)"; }}
          >
            {pinned ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "10px 0", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = sec === id;
          return (
            <button key={id} onClick={() => setSec(id)} style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 0,
              padding: 0,
              background: active ? "rgba(123,97,255,0.15)" : "transparent",
              border: "none",
              borderLeft: active ? "3px solid #7B61FF" : "3px solid transparent",
              borderRadius: 0,
              cursor: "pointer",
              color: active ? "#fff" : A.muted,
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              transition: "all 0.18s ease",
              boxShadow: "none",
              textAlign: "left",
              position: "relative",
              minHeight: 44,
            }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#fff"; }}}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = A.muted; }}}
            >
              {/* Icon always in 72px center zone */}
              <span style={{
                width: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={18} color={active ? "#7B61FF" : "currentColor"} />
              </span>
              {/* Label fades in when expanded */}
              <span style={{
                opacity: expanded ? 1 : 0,
                transform: expanded ? "translateX(0)" : "translateX(-6px)",
                transition: "opacity 0.2s ease, transform 0.2s ease",
                whiteSpace: "nowrap",
                flex: 1,
                pointerEvents: "none",
              }}>{label}</span>
              {/* Active dot */}
              {active && expanded && (
                <span style={{ marginRight: 14, width: 5, height: 5, borderRadius: "50%", background: "#7B61FF", boxShadow: "0 0 8px #7B61FF", flexShrink: 0 }} />
              )}
              {/* Tooltip on collapsed state */}
              {!expanded && (
                <span style={{
                  position: "absolute",
                  left: 76,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(20,22,40,0.96)",
                  border: "1px solid rgba(123,97,255,0.3)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "5px 10px",
                  borderRadius: 8,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  opacity: 0,
                  zIndex: 300,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                  transition: "opacity 0.15s ease",
                }}
                  className={`sb-tooltip-${id}`}
                >{label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Profile + logout */}
      <div style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 0, flexShrink: 0, overflowX: "hidden" }}>
        {/* Admin avatar row */}
        <div style={{ display: "flex", alignItems: "center", minHeight: 56, overflow: "hidden" }}>
          <span style={{ width: 72, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#7B61FF,#4DA3FF)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px rgba(123,97,255,0.4)" }}>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>A</span>
            </div>
          </span>
          <div style={{
            opacity: expanded ? 1 : 0,
            transform: expanded ? "translateX(0)" : "translateX(-8px)",
            transition: "opacity 0.22s ease, transform 0.22s ease",
            pointerEvents: "none",
            minWidth: 0,
          }}>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Admin</div>
            <div style={{ color: A.muted, fontSize: 10, whiteSpace: "nowrap" }}>SuperMart</div>
          </div>
        </div>

        {/* Sign out */}
        <button onClick={onLogout} style={{
          display: "flex", alignItems: "center", gap: 0,
          padding: 0,
          background: "transparent",
          border: "none",
          borderLeft: "3px solid transparent",
          borderRadius: 0,
          color: A.danger,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          transition: "all 0.18s ease",
          width: "100%",
          minHeight: 44,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,79,216,0.1)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ width: 72, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <LogOut size={17} />
          </span>
          <span style={{
            opacity: expanded ? 1 : 0,
            transform: expanded ? "translateX(0)" : "translateX(-6px)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}>Sign out</span>
        </button>
      </div>
    </div>
  );
}





// ─── TOPBAR ──────────────────────────────────────────────────────────────────
const TopBar = ({ sec, notifs, setNotifs, showN, setShowN, goPos, onSearch, searchQ, dbLoaded, onRefresh, isDark, toggleTheme, products = [], customers = [], staff = [], onNavigate }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const handleRefresh = async () => { setRefreshing(true); await onRefresh?.(); setRefreshing(false); toast("Data synced", "info"); };
  const unread = notifs.filter(n => !n.read).length;
  const markAll = (e) => { e.stopPropagation(); setNotifs(p => p.map(n => ({ ...n, read: true }))); };
  const sectionTitle = { dashboard:"Dashboard", products:"Products", analytics:"Analytics", ai:"AI Forecast", customers:"Customers", staff:"Staff Management", settings:"Settings" };

  // ── Global search: match across all tables ──────────────────────────────
  const q = searchQ.trim().toLowerCase();
  const prodResults  = q.length > 0 ? products.filter(p =>
    p.name?.toLowerCase().includes(q) ||
    p.cat?.toLowerCase().includes(q) ||
    String(p.barcode || "").includes(q)
  ).slice(0, 5) : [];
  const custResults  = q.length > 0 ? customers.filter(c =>
    c.name?.toLowerCase().includes(q) ||
    String(c.phone || "").includes(q) ||
    c.tag?.toLowerCase().includes(q)
  ).slice(0, 5) : [];
  const staffResults = q.length > 0 ? staff.filter(s =>
    s.name?.toLowerCase().includes(q) ||
    s.role?.toLowerCase().includes(q) ||
    s.counter?.toLowerCase().includes(q)
  ).slice(0, 5) : [];
  const totalResults = prodResults.length + custResults.length + staffResults.length;

  const handleInput = (val) => { onSearch(val); setShowResults(true); };
  const handleSelect = (section, searchTerm) => { onNavigate?.(section); onSearch(searchTerm); setShowResults(false); };
  const clearSearch = () => { onSearch(""); setShowResults(false); };

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setShowResults(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={{
      height: 68,
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 32px",
      background: "rgba(7,7,17,0.85)",
      backdropFilter: "blur(20px)",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <span style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"-0.02em" }}>
        {sectionTitle[sec] || sec}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

        {/* ── Global Search with Live Dropdown ── */}
        <div style={{ position: "relative" }} ref={searchRef}>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.05)", border:`1px solid ${showResults && q ? "rgba(123,97,255,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius:12, padding:"9px 16px", transition:"all 0.2s", width: 280 }}>
            <Search size={14} color={A.muted} />
            <input
              value={searchQ}
              onChange={e => handleInput(e.target.value)}
              onFocus={() => setShowResults(true)}
              placeholder="Search products, customers, staff…"
              style={{ background:"none", border:"none", outline:"none", color:"#fff", fontSize:13, flex:1, fontFamily:"'Inter',sans-serif" }}
            />
            {searchQ && <button onClick={clearSearch} style={{ background:"none", border:"none", cursor:"pointer", color:A.muted, display:"flex", padding:0 }}><X size={12} /></button>}
          </div>

          {/* Live Results Dropdown */}
          {showResults && q.length > 0 && (
            <div style={{ position:"absolute", top:"calc(100% + 8px)", left:0, width:420, background:"rgba(13,16,32,0.98)", backdropFilter:"blur(24px)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, overflow:"hidden", zIndex:300, boxShadow:"0 24px 60px rgba(0,0,0,0.7)", animation:"fadeinfast 0.15s ease" }}>
              {totalResults === 0 ? (
                <div style={{ padding:"24px 20px", textAlign:"center", color:A.muted, fontSize:13 }}>No results for &ldquo;<strong style={{color:"#fff"}}>{searchQ}</strong>&rdquo;</div>
              ) : (
                <>
                  <div style={{ padding:"10px 16px 6px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color:A.muted, fontSize:11, fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase" }}>Search Results</span>
                    <span style={{ color:A.accent, fontSize:11, fontWeight:700 }}>{totalResults} found</span>
                  </div>

                  {/* Products */}
                  {prodResults.length > 0 && (
                    <div>
                      <div style={{ padding:"8px 16px 4px", display:"flex", alignItems:"center", gap:6 }}>
                        <Package size={11} color={A.accent} />
                        <span style={{ color:A.accent, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>Products ({prodResults.length})</span>
                      </div>
                      {prodResults.map((p, i) => (
                        <div key={i} onClick={() => handleSelect("products", p.name)}
                          style={{ padding:"9px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", transition:"background 0.15s", borderBottom:"1px solid rgba(255,255,255,0.04)" }}
                          onMouseEnter={e => e.currentTarget.style.background="rgba(123,97,255,0.1)"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          <div style={{ width:32, height:32, borderRadius:8, background:"rgba(123,97,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{p.e || "📦"}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ color:"#fff", fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
                            <div style={{ color:A.muted, fontSize:11, marginTop:1 }}>{p.cat} · ₹{Number(p.price).toLocaleString("en-IN")}</div>
                          </div>
                          <span style={{ fontSize:11, fontWeight:600, color: p.stock === 0 ? A.danger : p.stock < 5 ? A.warn : A.alt, flexShrink:0 }}>{p.stock === 0 ? "Out" : `${p.stock} left`}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Customers */}
                  {custResults.length > 0 && (
                    <div>
                      <div style={{ padding:"8px 16px 4px", display:"flex", alignItems:"center", gap:6, borderTop: prodResults.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                        <Users size={11} color="#4DA3FF" />
                        <span style={{ color:"#4DA3FF", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>Customers ({custResults.length})</span>
                      </div>
                      {custResults.map((c, i) => (
                        <div key={i} onClick={() => handleSelect("customers", c.phone || c.name)}
                          style={{ padding:"9px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", transition:"background 0.15s", borderBottom:"1px solid rgba(255,255,255,0.04)" }}
                          onMouseEnter={e => e.currentTarget.style.background="rgba(77,163,255,0.1)"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(77,163,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ color:"#4DA3FF", fontSize:13, fontWeight:700 }}>{(c.name||"?")[0].toUpperCase()}</span>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ color:"#fff", fontSize:13, fontWeight:600 }}>{c.name}</div>
                            <div style={{ color:A.muted, fontSize:11, marginTop:1, fontFamily:A.mono }}>{c.phone || "No phone"}</div>
                          </div>
                          <span style={{ fontSize:11, color:A.muted, flexShrink:0 }}>₹{Number(c.spend||0).toLocaleString("en-IN")}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Staff */}
                  {staffResults.length > 0 && (
                    <div>
                      <div style={{ padding:"8px 16px 4px", display:"flex", alignItems:"center", gap:6, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                        <UserCog size={11} color="#00FFD1" />
                        <span style={{ color:"#00FFD1", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>Staff ({staffResults.length})</span>
                      </div>
                      {staffResults.map((s, i) => (
                        <div key={i} onClick={() => handleSelect("staff", s.name)}
                          style={{ padding:"9px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", transition:"background 0.15s", borderBottom: i < staffResults.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                          onMouseEnter={e => e.currentTarget.style.background="rgba(0,255,209,0.08)"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(0,255,209,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ color:"#00FFD1", fontSize:13, fontWeight:700 }}>{(s.name||"?")[0].toUpperCase()}</span>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ color:"#fff", fontSize:13, fontWeight:600 }}>{s.name}</div>
                            <div style={{ color:A.muted, fontSize:11, marginTop:1 }}>{s.role} · {s.counter}</div>
                          </div>
                          <span style={{ fontSize:11, fontWeight:600, color: s.status==="active" ? A.alt : A.warn }}>{s.status==="active" ? "On Shift" : "On Break"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ padding:"8px 16px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"flex-end" }}>
                    <span onClick={() => setShowResults(false)} style={{ color:A.muted, fontSize:11, cursor:"pointer" }}>Press Esc to close</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Backdrop to close dropdown */}
          {showResults && q.length > 0 && (
            <div style={{ position:"fixed", inset:0, zIndex:299 }} onClick={() => setShowResults(false)} />
          )}
        </div>

        {/* Sync / Live */}
        <button onClick={handleRefresh} disabled={refreshing} style={{ padding:"8px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:A.muted, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
          <RefreshCw size={13} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
          <div style={{ width:6, height:6, borderRadius:"50%", background: dbLoaded ? A.cyan : A.warn, boxShadow: dbLoaded ? `0 0 8px ${A.cyan}` : "none" }} />
          <span style={{ fontSize:11, color: dbLoaded ? A.cyan : A.warn, fontWeight:600 }}>{dbLoaded ? "Live" : "Syncing…"}</span>
        </button>
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          style={{
            padding:"8px 10px",
            background: isDark ? "rgba(255,181,71,0.08)" : "rgba(123,97,255,0.08)",
            border: isDark ? "1px solid rgba(255,181,71,0.25)" : "1px solid rgba(123,97,255,0.25)",
            borderRadius:10, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"all 0.25s ease",
            boxShadow: isDark ? "0 0 10px rgba(255,181,71,0.15)" : "0 0 10px rgba(123,97,255,0.15)",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform="scale(1.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform="scale(1)"; }}
        >
          {isDark ? <Sun size={16} color="#FFB547" /> : <Moon size={16} color="#7B61FF" />}
        </button>
        {/* Open POS */}
        <button onClick={goPos} style={{
          padding:"9px 18px",
          background:"linear-gradient(135deg, #7B61FF, #4DA3FF)",
          border:"none", borderRadius:12,
          color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer",
          boxShadow:"0 0 20px rgba(123,97,255,0.4)",
          fontFamily:"'Space Grotesk',sans-serif",
          transition:"all 0.2s ease",
          letterSpacing:"-0.01em",
        }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow="0 0 30px rgba(123,97,255,0.6)"; e.currentTarget.style.transform="translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow="0 0 20px rgba(123,97,255,0.4)"; e.currentTarget.style.transform="translateY(0)"; }}
        >Open POS →</button>
        {/* Notifications */}
        <div style={{ position:"relative" }}>
          <button onClick={(e) => { e.stopPropagation(); setShowN(p => !p); }} style={{ position:"relative", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"9px 10px", cursor:"pointer", display:"flex" }}>
            <Bell size={17} color={A.muted} />
            {unread > 0 && <span style={{ position:"absolute", top:-4, right:-4, background:"linear-gradient(135deg,#FF4FD8,#7B61FF)", color:"#fff", borderRadius:"50%", width:17, height:17, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700 }}>{unread}</span>}
          </button>
          {showN && (
            <div style={{ position:"absolute", right:0, top:"calc(100% + 10px)", width:340, background:"rgba(17,19,34,0.97)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:18, overflow:"hidden", zIndex:200, animation:"fadeinfast 0.15s ease", boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
              <div style={{ padding:"16px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ color:"#fff", fontWeight:700, fontSize:14, fontFamily:"'Space Grotesk',sans-serif" }}>Notifications</span>
                <span onClick={markAll} style={{ color:A.accent, fontSize:12, cursor:"pointer" }}>Mark all read</span>
              </div>
              {notifs.length === 0 && <div style={{ padding:24, textAlign:"center", color:A.muted, fontSize:13 }}>All caught up ✓</div>}
              {notifs.map(n => (
                <div key={n.id} style={{ padding:"13px 18px", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", gap:12, alignItems:"flex-start", background: n.read ? "transparent" : "rgba(123,97,255,0.05)", cursor:"pointer" }}
                  onClick={() => setNotifs(p => p.map(x => x.id === n.id ? { ...x, read: true } : x))}>
                  <div style={{ width:7, height:7, borderRadius:"50%", marginTop:5, flexShrink:0, background: n.t==="danger" ? A.danger : n.t==="warn" ? A.warn : n.t==="success" ? A.cyan : A.accent, boxShadow: n.read ? "none" : `0 0 6px ${n.t==="danger" ? A.danger : A.accent}`, opacity: n.read ? 0.3 : 1 }} />
                  <div style={{ flex:1 }}>
                    <p style={{ color: n.read ? A.muted : "#fff", fontSize:13 }}>{n.msg}</p>
                    <p style={{ color:A.muted, fontSize:11, marginTop:3 }}>{n.time} ago</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
const DashView = ({ products, transactions = [] }) => {
  const lowStock = products.filter(p => p.stock < 10 && p.stock > 0).length;
  const outStock = products.filter(p => p.stock === 0).length;

  // Robust timestamp parser — handles Firestore Timestamp, Unix ms, or fallback
  const getTs = t => {
    if (t.createdAt?.seconds) return new Date(t.createdAt.seconds * 1000);
    if (typeof t.createdAt === "number") return new Date(t.createdAt);
    return new Date();
  };

  // Live KPIs from real transactions
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayTx  = transactions.filter(t => getTs(t) >= todayStart);
  const todayRev  = todayTx.reduce((s, t) => s + Number(t.total || 0), 0);
  const totalTx   = transactions.length;
  const avgBasket = totalTx > 0 ? transactions.reduce((s, t) => s + Number(t.total || 0), 0) / totalTx : 0;

  // Revenue chart — last 7 days
  const revByDay = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const label = d.toLocaleDateString("en-IN", { weekday:"short", day:"numeric" });
    revByDay[label] = 0;
  }
  transactions.forEach(t => {
    const ts = getTs(t); ts.setHours(0,0,0,0);
    const label = ts.toLocaleDateString("en-IN", { weekday:"short", day:"numeric" });
    if (revByDay[label] !== undefined) revByDay[label] += Number(t.total || 0);
  });
  const chartData = Object.entries(revByDay).map(([d, rev]) => ({ d, rev }));

  // Sales by category
  const catSales = {};
  transactions.forEach(t => {
    try {
      const items = typeof t.items === "string" ? JSON.parse(t.items) : (t.items || []);
      items.forEach(item => {
        const prod = products.find(p => p.id === item.id || p.name === item.name);
        const cat = prod?.cat || item.cat || "Other";
        catSales[cat] = (catSales[cat] || 0) + Number(item.price || 0) * Number(item.qty || 1);
      });
    } catch {}
  });
  const catData = Object.entries(catSales).map(([n, v], i) => ({ n, v, fill: CATC[i % CATC.length] }));

  // ── Profit by Product ───────────────────────────────────────────────────────
  const prodProfit = {};
  transactions.forEach(t => {
    try {
      const items = typeof t.items === "string" ? JSON.parse(t.items) : (t.items || []);
      items.forEach(item => {
        const prod = products.find(p => p.id === item.id || p.name === item.name);
        const cost = Number(prod?.cost || 0);
        const price = Number(item.price || 0);
        const qty = Number(item.qty || 1);
        const profit = (price - cost) * qty;
        const name = item.name || "Unknown";
        if (!prodProfit[name]) prodProfit[name] = 0;
        prodProfit[name] += profit;
      });
    } catch {}
  });
  const prodProfitData = Object.entries(prodProfit)
    .map(([n, profit], i) => ({ n: n.length > 14 ? n.slice(0,12)+"…" : n, profit: parseFloat(profit.toFixed(2)), fill: CATC[i % CATC.length] }))
    .sort((a, b) => b.profit - a.profit).slice(0, 8);

  // ── Profit by Category ──────────────────────────────────────────────────────
  const catProfit = {};
  transactions.forEach(t => {
    try {
      const items = typeof t.items === "string" ? JSON.parse(t.items) : (t.items || []);
      items.forEach(item => {
        const prod = products.find(p => p.id === item.id || p.name === item.name);
        const cat = prod?.cat || "Other";
        const cost = Number(prod?.cost || 0);
        const price = Number(item.price || 0);
        const qty = Number(item.qty || 1);
        catProfit[cat] = (catProfit[cat] || 0) + (price - cost) * qty;
      });
    } catch {}
  });
  const catProfitData = Object.entries(catProfit)
    .map(([n, profit], i) => ({ n, profit: parseFloat(profit.toFixed(2)), fill: CATC[i % CATC.length] }))
    .sort((a, b) => b.profit - a.profit);

  const EmptyCard = ({ title, msg }) => (
    <div style={{ background:"rgba(17,19,34,0.8)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:48, textAlign:"center" }}>
      <div style={{ width:52, height:52, borderRadius:16, background:"rgba(123,97,255,0.1)", border:"1px solid rgba(123,97,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
        <Activity size={24} color="rgba(123,97,255,0.6)" />
      </div>
      <h3 style={{ color:"#fff", fontSize:15, fontWeight:600, marginBottom:8, fontFamily:"'Space Grotesk',sans-serif" }}>{title}</h3>
      <p style={{ color:A.muted, fontSize:13 }}>{msg}</p>
    </div>
  );

  return (
    <div style={{ padding:"32px 32px", display:"flex", flexDirection:"column", gap:24, animation:"fadein 0.25s ease" }}>
      {/* Header */}
      <div style={{ marginBottom:4 }}>
        <h1 style={{ color:"#fff", fontSize:26, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:"-0.02em", lineHeight:1.1 }}>Operations Dashboard</h1>
        <p style={{ color:A.muted, fontSize:13, marginTop:6 }}>Real-time analytics powered by Firebase · {new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
        <KPI label="Today's Revenue"   value={todayRev}  delta={0} icon={Zap}          color="#7B61FF" />
        <KPI label="Total Transactions" value={totalTx}  delta={0} icon={Receipt}       color="#4DA3FF" prefix="" />
        <KPI label="Avg Basket Value"  value={Math.round(avgBasket)} delta={0} icon={ShoppingCart} color="#00FFD1" />
        <KPI label="Total Products"    value={products.length} delta={0} icon={Package} color="#FF4FD8" prefix="" />
      </div>

      {/* Stock Alert */}
      {(lowStock > 0 || outStock > 0) && (
        <div style={{ background:"rgba(255,181,71,0.08)", border:"1px solid rgba(255,181,71,0.25)", borderRadius:14, padding:"14px 20px", display:"flex", gap:14, alignItems:"center" }}>
          <div style={{ width:34, height:34, borderRadius:10, background:"rgba(255,181,71,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <AlertTriangle size={17} color={A.warn} />
          </div>
          <span style={{ color:"#fff", fontSize:13 }}>
            <strong style={{ color:A.warn }}>{lowStock} products</strong> with low stock ·{" "}
            <strong style={{ color:A.danger }}>{outStock}</strong> out of stock — check inventory.
          </span>
        </div>
      )}

      {/* ── Revenue Trend: Gradient Area + Line combo ──────────────────── */}
      {chartData.length > 0 ? (
        <div style={{ background:"rgba(17,19,34,0.8)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"28px 28px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
            <div>
              <h3 style={{ color:"#fff", fontSize:16, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif" }}>📈 Revenue Trend — Last 7 Days</h3>
              <p style={{ color:A.muted, fontSize:12, marginTop:3 }}>Live area + line overlay from Firebase</p>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(0,255,209,0.08)", border:"1px solid rgba(0,255,209,0.2)", borderRadius:20, padding:"5px 12px" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:A.cyan, boxShadow:`0 0 6px ${A.cyan}`, animation:"glowPulse 2s ease infinite" }} />
              <span style={{ color:A.cyan, fontSize:11, fontWeight:600 }}>LIVE</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top:5, right:10, bottom:0, left:0 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7B61FF" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#4DA3FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="d" tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v>=1000?(v/1000).toFixed(0)+"k":v}`} />
              <Tooltip contentStyle={{ background:"rgba(17,19,34,0.97)", border:"1px solid rgba(123,97,255,0.4)", borderRadius:10, color:"#fff" }} formatter={v => [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]} />
              <Area type="monotone" dataKey="rev" stroke="#7B61FF" strokeWidth={3} fill="url(#gRev)" dot={{ r:4, fill:"#7B61FF", strokeWidth:2, stroke:"#fff" }} activeDot={{ r:7, fill:"#7B61FF", stroke:"#fff", strokeWidth:2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <EmptyCard title="Revenue Trend" msg="Complete your first sale to see live revenue data here." />}

      {/* ── Sales by Category: Interactive Donut Pie ─────────────────────── */}
      {catData.length > 0 ? (
        <div style={{ background:"rgba(17,19,34,0.8)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"28px 28px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <h3 style={{ color:"#fff", fontSize:16, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif" }}>🍩 Sales by Category</h3>
              <p style={{ color:A.muted, fontSize:12, marginTop:3 }}>Hover slices for detailed breakdown</p>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:32 }}>
            <ResponsiveContainer width={260} height={260}>
              <RPieChart>
                <defs>
                  {catData.map((d,i) => (
                    <radialGradient key={i} id={`cg${i}`} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={d.fill} stopOpacity={1} />
                      <stop offset="100%" stopColor={d.fill} stopOpacity={0.6} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={65} outerRadius={110} paddingAngle={4} dataKey="v" nameKey="n" animationBegin={0} animationDuration={800}>
                  {catData.map((d,i) => <Cell key={i} fill={`url(#cg${i})`} stroke={d.fill} strokeWidth={1} />)}
                </Pie>
                <Tooltip contentStyle={{ background:"rgba(17,19,34,0.97)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"#fff" }} formatter={v => [`₹${Number(v).toLocaleString("en-IN")}`, "Sales"]} />
              </RPieChart>
            </ResponsiveContainer>
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10 }}>
              {catData.map((d,i) => {
                const total = catData.reduce((s,x) => s+x.v, 0);
                const pct = total ? ((d.v/total)*100).toFixed(1) : 0;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:d.fill, boxShadow:`0 0 6px ${d.fill}`, flexShrink:0 }} />
                    <span style={{ color:A.muted, fontSize:13, flex:1 }}>{d.n}</span>
                    <span style={{ color:"#fff", fontSize:13, fontWeight:600, fontFamily:A.mono }}>₹{Number(d.v).toLocaleString("en-IN")}</span>
                    <span style={{ color:d.fill, fontSize:12, fontWeight:700, minWidth:40, textAlign:"right" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : <EmptyCard title="Sales by Category" msg="Sales data will appear here after your first transaction." />}

      {/* ── Profit Charts: Radar + RadialBar side by side ─────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

        {/* Profit by Product → Radar (Spider) Chart */}
        {prodProfitData.length > 0 ? (
          <div style={{ background:"rgba(17,19,34,0.8)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"28px 28px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <div style={{ width:32, height:32, borderRadius:10, background:"rgba(0,255,209,0.12)", border:"1px solid rgba(0,255,209,0.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <TrendingUp size={16} color={A.cyan} />
              </div>
              <div>
                <h3 style={{ color:"#fff", fontSize:15, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif" }}>🕸 Profit by Product</h3>
                <p style={{ color:A.muted, fontSize:11, marginTop:2 }}>Radar view · Top products</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={prodProfitData.slice(0,7)} margin={{ top:10, right:20, bottom:10, left:20 }}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="n" tick={{ fill:A.muted, fontSize:10 }} />
                <PolarRadiusAxis tick={{ fill:A.muted, fontSize:9 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v>=1000?(v/1000).toFixed(0)+"k":v}`} />
                <Radar name="Profit" dataKey="profit" stroke="#00FFD1" strokeWidth={2} fill="#00FFD1" fillOpacity={0.18} dot={{ r:3, fill:"#00FFD1" }} activeDot={{ r:5, fill:"#00FFD1" }} />
                <Tooltip contentStyle={{ background:"rgba(17,19,34,0.97)", border:"1px solid rgba(0,255,209,0.3)", borderRadius:10, color:"#fff" }} formatter={v => [`₹${Number(v).toLocaleString("en-IN")}`, "Profit"]} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyCard title="Profit by Product" msg="Add cost prices to products and complete sales to see profit data." />}

        {/* Profit by Category → RadialBar (Circular Progress) Chart */}
        {catProfitData.length > 0 ? (
          <div style={{ background:"rgba(17,19,34,0.8)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"28px 28px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <div style={{ width:32, height:32, borderRadius:10, background:"rgba(255,79,216,0.12)", border:"1px solid rgba(255,79,216,0.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <BarChart3 size={16} color="#FF4FD8" />
              </div>
              <div>
                <h3 style={{ color:"#fff", fontSize:15, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif" }}>🎯 Profit by Category</h3>
                <p style={{ color:A.muted, fontSize:11, marginTop:2 }}>Circular progress · Net profit</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="15%" outerRadius="90%" barSize={14} data={catProfitData.map((d,i) => ({ ...d, fill: CATC[i % CATC.length] }))}>
                <RadialBar background={{ fill:"rgba(255,255,255,0.04)" }} dataKey="profit" cornerRadius={8} label={false}>
                  {catProfitData.map((d,i) => <Cell key={i} fill={CATC[i % CATC.length]} />)}
                </RadialBar>
                <Tooltip contentStyle={{ background:"rgba(17,19,34,0.97)", border:"1px solid rgba(255,79,216,0.3)", borderRadius:10, color:"#fff" }} formatter={v => [`₹${Number(v).toLocaleString("en-IN")}`, "Profit"]} />
                <Legend iconSize={8} iconType="circle" formatter={(v, entry) => <span style={{ color:A.muted, fontSize:11 }}>{entry.payload.n}</span>} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyCard title="Profit by Category" msg="Add cost prices to products and complete sales to see category profit." />}
      </div>
    </div>
  );
};


// ─── PRODUCTS VIEW ────────────────────────────────────────────────────────────
const ProdsView = ({ products, setProducts, globalSearch }) => {
  const [q, setQ] = useState(globalSearch || "");
  const [filterCat, setFilterCat] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showFilter, setShowFilter] = useState(false);
  const [modal, setModal] = useState(null); // null | "add" | {edit: product}
  const [delTarget, setDelTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const cats = ["All", ...new Set(products.map(p => p.cat))];

  useEffect(() => { if (globalSearch) setQ(globalSearch); }, [globalSearch]);

  const filtered = products.filter(p => {
    const qm = !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode?.includes(q) || p.cat?.toLowerCase().includes(q.toLowerCase());
    const cm = filterCat === "All" || p.cat === filterCat;
    const sm = filterStatus === "All" || p.status === filterStatus;
    return qm && cm && sm;
  });

  const handleSave = async (data) => {
    setSaving(true);
    try {
      const status = Number(data.stock) === 0 ? "out" : Number(data.stock) < 3 ? "critical" : Number(data.stock) < 10 ? "low" : "active";
      const prod = { ...data, status, price: Number(data.price), cost: Number(data.cost), stock: Number(data.stock) };
      // img is now saved TO Firestore directly (compressed to <200KB) so it
      // persists permanently — no more re-uploading after refresh
      const { img } = prod;
      const prodForDb = { ...prod };  // keep img in the DB payload
      if (modal === "add") {
        const res = await sbInsert("products", prodForDb);
        if (!res) throw new Error("Firestore insert failed");
        const newId = res[0].id;
        // Also cache in localStorage for instant POS display
        if (img) { try { storeImg(newId, img); } catch { } }
        toast("✅ Product added & saved to database");
      } else {
        const id = modal.edit.id;
        // Cache locally first for instant feedback
        if (img) { try { storeImg(id, img); } catch { } }
        const ok = await sbUpdate("products", id, prodForDb);
        if (!ok) throw new Error("Firestore update failed");
        toast("✅ Product updated in database");
      }
    } catch (err) {
      console.error("handleSave error:", err);
      const msg = err?.message || String(err);
      toast(`❌ ${msg.includes("permission") ? "Permission denied — check Firestore rules" : msg.includes("offline") ? "Offline — check internet connection" : "Save failed: " + msg}`, "warn");
    } finally {
      setSaving(false);
      setModal(null);
    }
  };

  const handleDelete = async () => {
    try {
      await sbDelete("products", delTarget.id);
      try { storeImg(delTarget.id, ""); } catch { }
      setProducts(p => p.filter(x => x.id !== delTarget.id));
      toast("Product deleted", "warn");
    } catch (err) {
      toast(`❌ Delete failed: ${err?.message || err}`, "warn");
    } finally {
      setDelTarget(null);
    }
  };

  const exportCSV = () => {
    const headers = ["ID", "Name", "Category", "Price", "Cost", "Stock", "Barcode", "Expiry", "Status"];
    const rows = filtered.map(p => [p.id, p.name, p.cat, p.price, p.cost, p.stock, p.barcode, p.expiry, p.status]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "products.csv"; a.click();
    toast("Products exported as CSV");
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20, animation: "fadein 0.2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><h2 style={{ color: A.text, fontSize: 20, fontWeight: 700 }}>Product Catalogue</h2><p style={{ color: A.muted, fontSize: 13, marginTop: 4 }}>{products.length} products · {[...new Set(products.map(p => p.cat))].length} categories</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setModal("import")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: "none", border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Import CSV</button>
          <button onClick={exportCSV} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: "none", border: `1px solid ${A.border}`, borderRadius: 8, color: A.muted, fontSize: 13, cursor: "pointer" }}><Download size={15} />Export CSV</button>
          <button onClick={() => setModal("add")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: A.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}><Plus size={15} />Add Product</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: A.surf, border: `1px solid ${A.border}`, borderRadius: 8, padding: "10px 14px" }}>
            <Search size={15} color={A.muted} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, category, barcode…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: A.text, fontSize: 13 }} />
            {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: A.muted, display: "flex" }}><X size={13} /></button>}
          </div>
          <button onClick={() => setShowFilter(p => !p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: showFilter ? A.accent : A.surf, border: `1px solid ${showFilter ? A.accent : A.border}`, borderRadius: 8, color: showFilter ? "#fff" : A.muted, fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}><Filter size={15} />Filter {(filterCat !== "All" || filterStatus !== "All") && `(${[filterCat !== "All" ? filterCat : null, filterStatus !== "All" ? filterStatus : null].filter(Boolean).length})`}</button>
        </div>
        {showFilter && (
          <div style={{ display: "flex", gap: 10, padding: "14px 16px", background: A.surf, border: `1px solid ${A.border}`, borderRadius: 8, width: "100%", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: A.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>Category</label>
              <Select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="All">All Categories</option>
                {cats.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: A.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>Status</label>
              <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="All">All Status</option>
                <option value="active">Active</option>
                <option value="low">Low Stock</option>
                <option value="critical">Critical</option>
                <option value="out">Out of Stock</option>
              </Select>
            </div>
            <button onClick={() => { setFilterCat("All"); setFilterStatus("All"); }} style={{ padding: "10px 14px", background: "none", border: `1px solid ${A.border}`, borderRadius: 8, color: A.muted, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Clear</button>
          </div>
        )}
      </div>
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead><tr style={{ borderBottom: `1px solid ${A.border}`, background: A.bg }}>
            {["Product", "Category", "Price", "Cost", "Stock", "Barcode", "Expiry", "Status", "Actions"].map(h => <th key={h} style={{ color: A.muted, fontSize: 11, fontWeight: 600, padding: "14px 16px", textAlign: "left", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: A.muted, fontSize: 14 }}>No products found</td></tr>}
            {filtered.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${A.border}`, background: i % 2 === 1 ? A.surfAlt : "transparent" }}>
                <td style={{ padding: "13px 16px", color: A.text, fontSize: 13, fontWeight: 500 }}>{p.name}</td>
                <td style={{ padding: "13px 16px" }}><span style={{ color: A.muted, fontSize: 12, background: A.bg, padding: "3px 8px", borderRadius: 4 }}>{p.cat}</span></td>
                <td style={{ padding: "13px 16px", color: A.text, fontSize: 13, fontFamily: A.mono }}>₹{p.price}</td>
                <td style={{ padding: "13px 16px", color: A.muted, fontSize: 13, fontFamily: A.mono }}>₹{p.cost}</td>
                <td style={{ padding: "13px 16px", color: p.stock === 0 ? A.danger : p.stock < 10 ? A.warn : A.text, fontSize: 13, fontFamily: A.mono, fontWeight: 600 }}>{p.stock}</td>
                <td style={{ padding: "13px 16px", color: A.muted, fontSize: 11, fontFamily: A.mono }}>{p.barcode}</td>
                <td style={{ padding: "13px 16px", color: A.muted, fontSize: 12 }}>{p.expiry}</td>
                <td style={{ padding: "13px 16px" }}><Badge status={p.status} /></td>
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setModal({ edit: p })} style={{ background: "none", border: "none", cursor: "pointer", color: A.accent, display: "flex", padding: 4, borderRadius: 4, transition: "background 0.1s" }}><Edit2 size={15} /></button>
                    <button onClick={() => setDelTarget(p)} style={{ background: "none", border: "none", cursor: "pointer", color: A.danger, display: "flex", padding: 4, borderRadius: 4, transition: "background 0.1s" }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal === "import" ? (
        <CsvImportModule A={A} onClose={() => setModal(null)} onImportSuccess={() => {
          setModal(null);
          // Optional: trigger data refresh here if not automatically synced via real-time listener
        }} />
      ) : (
        modal && <ProductModal product={modal === "add" ? null : modal.edit} onSave={handleSave} onClose={() => setModal(null)} saving={saving} />
      )}
      {delTarget && <ConfirmModal msg={`Are you sure you want to delete "${delTarget.name}"? This action cannot be undone.`} onConfirm={handleDelete} onClose={() => setDelTarget(null)} />}
    </div>
  );
};

const ProductModal = ({ product, onSave, onClose, saving }) => {
  const [form, setForm] = useState(
    product ? { img:"", ...product } : { name:"", cat:"Dairy", price:"", cost:"", stock:"", barcode:"", expiry:"", img:"", status:"active" }
  );
  const fileRef = useRef(null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Compress image to max 400×400 JPEG at 65% quality — keeps it under
  // Firestore's 1 MB document limit while still looking sharp on product cards
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        let { width: w, height: h } = img;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.65);
        set("img", compressed);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <Modal title={product ? "Edit Product" : "Add New Product"} onClose={onClose} width={520}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Field label="Product Name" required><Input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Amul Gold Milk 1L"/></Field>

        {/* ── Image Upload ── */}
        <Field label="Product Image">
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            {/* Preview box */}
            <div style={{width:72,height:72,borderRadius:12,border:`2px dashed ${form.img?A.accent:A.border}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0,background:A.bg,transition:"border 0.2s"}}>
              {form.img
                ? <img src={form.img} alt="preview" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : <span style={{fontSize:28}}>📦</span>
              }
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
              {/* Hidden real file input */}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{display:"none"}}/>
              {/* Styled upload button */}
              <button
                type="button"
                onClick={()=>fileRef.current.click()}
                style={{padding:"9px 14px",background:A.surf,border:`1px solid ${A.border}`,borderRadius:8,color:A.text,fontSize:13,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:8,justifyContent:"center",transition:"all 0.15s"}}
              >
                <span style={{fontSize:16}}>📁</span> {form.img?"Change Image":"Upload from Device"}
              </button>
              {form.img && (
                <button
                  type="button"
                  onClick={()=>set("img","")}
                  style={{padding:"6px 14px",background:"none",border:`1px solid ${A.border}`,borderRadius:8,color:A.muted,fontSize:12,cursor:"pointer"}}
                >
                  ✕ Remove Image
                </button>
              )}
              <p style={{color:A.muted,fontSize:11,margin:0}}>JPG, PNG, WEBP · Updates POS instantly</p>
            </div>
          </div>
        </Field>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Category" required>
            <Select value={form.cat} onChange={e=>set("cat",e.target.value)}>
              {["Dairy","Snacks","Beverages","Staples","Personal Care","Frozen","Household"].map(c=><option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Stock Quantity" required><Input type="number" value={form.stock} onChange={e=>set("stock",e.target.value)} placeholder="0"/></Field>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Selling Price (₹)" required><Input type="number" value={form.price} onChange={e=>set("price",e.target.value)} placeholder="0.00"/></Field>
          <Field label="Cost Price (₹)"><Input type="number" value={form.cost} onChange={e=>set("cost",e.target.value)} placeholder="0.00"/></Field>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Barcode"><Input value={form.barcode} onChange={e=>set("barcode",e.target.value)} placeholder="Scan or enter barcode"/></Field>
          <Field label="Expiry Date"><Input type="date" value={form.expiry} onChange={e=>set("expiry",e.target.value)}/></Field>
        </div>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onClose} style={{flex:1,padding:12,background:"none",border:`1px solid ${A.border}`,borderRadius:8,color:A.text,fontSize:14,cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={()=>onSave(form)} disabled={!form.name||!form.price||saving} style={{flex:2,padding:12,background:A.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:(!form.name||!form.price)?0.5:1}}>
            {saving?<><Spinner/> Saving…</>:<><Save size={16}/>{product?"Save Changes":"Add Product"}</>}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── ANALYTICS VIEW ───────────────────────────────────────────────────────────
const AnalyView = ({ transactions = [] }) => {
  const [period, setPeriod] = useState("today");

  // Robust timestamp parser — handles Firestore Timestamp, Unix ms number, or fallback
  const getTs = t => {
    if (t.createdAt?.seconds) return new Date(t.createdAt.seconds * 1000);
    if (typeof t.createdAt === "number") return new Date(t.createdAt);
    return new Date();
  };

  // ── Today: hourly buckets (0–23h) ────────────────────────────────────
  const todayData = (() => {
    const result = [];
    const now = new Date(); const hr = now.getHours();
    for (let i = 0; i <= hr; i++) {
      const start = new Date(now); start.setHours(i,0,0,0);
      const end   = new Date(now); end.setHours(i,59,59,999);
      const label = `${i}:00`;
      const txs = transactions.filter(t => { const ts = getTs(t); return ts >= start && ts <= end; });
      const phones = new Set(txs.map(t => t.customer_phone).filter(Boolean));
      result.push({ label, revenue: txs.reduce((s,t)=>s+Number(t.total||0),0), customers: phones.size, transactions: txs.length });
    }
    return result;
  })();

  // ── Daily: last 7 days ──────────────────────────────────────────────────────
  const dailyData = (() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const label = d.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });
      const txs = transactions.filter(t => { const ts = getTs(t); return ts >= d && ts < next; });
      const phones = new Set(txs.map(t => t.customer_phone).filter(Boolean));
      result.push({ label, revenue: txs.reduce((s,t)=>s+Number(t.total||0),0), customers: phones.size, transactions: txs.length });
    }
    return result;
  })();

  // ── Weekly: last 8 weeks ────────────────────────────────────────────────────
  const weeklyData = (() => {
    const result = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(); start.setDate(start.getDate() - start.getDay() - i*7); start.setHours(0,0,0,0);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      const label = `${start.toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`;
      const txs = transactions.filter(t => { const ts = getTs(t); return ts >= start && ts < end; });
      const phones = new Set(txs.map(t => t.customer_phone).filter(Boolean));
      result.push({ label, revenue: txs.reduce((s,t)=>s+Number(t.total||0),0), customers: phones.size, transactions: txs.length });
    }
    return result;
  })();

  // ── Monthly: last 12 months ─────────────────────────────────────────────────
  const monthlyData = (() => {
    const result = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); d.setHours(0,0,0,0);
      const end = new Date(d); end.setMonth(end.getMonth() + 1);
      const label = d.toLocaleDateString("en-IN", { month:"short", year:"2-digit" });
      const txs = transactions.filter(t => { const ts = getTs(t); return ts >= d && ts < end; });
      const phones = new Set(txs.map(t => t.customer_phone).filter(Boolean));
      result.push({ label, revenue: txs.reduce((s,t)=>s+Number(t.total||0),0), customers: phones.size, transactions: txs.length });
    }
    return result;
  })();

  const data = period === "today" ? todayData : period === "daily" ? dailyData : period === "weekly" ? weeklyData : monthlyData;
  const totals = data.reduce((a,d) => ({ revenue: a.revenue+d.revenue, customers: a.customers+d.customers, transactions: a.transactions+d.transactions }), { revenue:0, customers:0, transactions:0 });
  const allTime = { rev: transactions.reduce((s,t)=>s+Number(t.total||0),0), tx: transactions.length, avg: transactions.length ? transactions.reduce((s,t)=>s+Number(t.total||0),0)/transactions.length : 0 };

  const periodLabel = period === "today" ? "Today" : period === "daily" ? "Last 7 Days" : period === "weekly" ? "Last 8 Weeks" : "Last 12 Months";

  const exportCSV = () => {
    if (!data.length) return toast("No data to export yet","warn");
    const csv = [["Period","Revenue","Customers","Transactions"],...data.map(d=>[d.label,d.revenue.toFixed(2),d.customers,d.transactions])].map(r=>r.join(",")).join("\n");
    const b = new Blob([csv],{type:"text/csv"}); const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href=u; a.download=`analytics_${period}.csv`; a.click();
    toast("Analytics exported");
  };

  const ChartCard = ({ title, children }) => (
    <div style={{ background: A.surf, border:`1px solid ${A.border}`, borderRadius:12, padding:24 }}>
      <h3 style={{ color:A.text, fontSize:15, fontWeight:600, marginBottom:20 }}>{title}</h3>
      {children}
    </div>
  );

  const EmptyChart = () => (
    <div style={{ textAlign:"center", padding:"40px 0" }}>
      <Activity size={28} color={A.muted} style={{ marginBottom:10 }} />
      <p style={{ color:A.muted, fontSize:13 }}>No transactions yet for this period</p>
    </div>
  );

  const hasData = data.some(d => d.transactions > 0);
  const COLORS = { revenue: A.accent, customers: "#00B87A", transactions: "#FFB547" };

  return (
    <div style={{ padding:28, display:"flex", flexDirection:"column", gap:22, animation:"fadein 0.2s ease" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:A.text, fontSize:20, fontWeight:700 }}>Sales Analytics</h2>
          <p style={{ color:A.muted, fontSize:13, marginTop:4 }}>Real-time · {periodLabel}</p>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {/* Period Tabs */}
          <div style={{ display:"flex", background:A.bg, border:`1px solid ${A.border}`, borderRadius:10, padding:3, gap:2 }}>
            {[["today","Today"],["daily","7 Days"],["weekly","Weekly"],["monthly","Monthly"]].map(([k,l]) => (
              <button key={k} onClick={()=>setPeriod(k)}
                style={{ padding:"7px 16px", borderRadius:8, border:"none", background: period===k ? A.accent : "none", color: period===k ? "#fff" : A.muted, fontSize:13, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"none", border:`1px solid ${A.border}`, borderRadius:8, color:A.muted, fontSize:13, cursor:"pointer" }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* All-time summary */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
        {[
          { l:"All-Time Revenue",    v:`₹${allTime.rev.toLocaleString("en-IN")}`,  c: A.accent },
          { l:"Total Transactions",  v: allTime.tx.toLocaleString("en-IN"),        c:"#00B87A" },
          { l:"Avg Order Value",     v:`₹${allTime.avg.toFixed(0)}`,              c:"#FFB547" },
          { l:"Unique Customers",    v: new Set(transactions.map(t=>t.customer_phone).filter(Boolean)).size, c:"#7B61FF" },
        ].map((s,i)=>(
          <div key={i} style={{ flex:1, minWidth:160, background:A.surf, border:`1px solid ${A.border}`, borderRadius:12, padding:"18px 20px" }}>
            <p style={{ color:A.muted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.l}</p>
            <p style={{ color:s.c, fontSize:24, fontWeight:800, marginTop:8, fontFamily:A.mono }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Period summary cards */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
        {[
          { l:`Revenue (${periodLabel})`,     v:`₹${totals.revenue.toLocaleString("en-IN",{maximumFractionDigits:0})}`, c:A.accent,  icon:"💰" },
          { l:`Customers (${periodLabel})`,   v: totals.customers,   c:"#00B87A", icon:"👥" },
          { l:`Transactions (${periodLabel})`,v: totals.transactions, c:"#FFB547", icon:"🧾" },
        ].map((s,i)=>(
          <div key={i} style={{ flex:1, minWidth:200, background:`${s.c}12`, border:`1px solid ${s.c}30`, borderRadius:12, padding:"18px 20px", display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ fontSize:28 }}>{s.icon}</span>
            <div>
              <p style={{ color:A.muted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.l}</p>
              <p style={{ color:s.c, fontSize:26, fontWeight:800, marginTop:4, fontFamily:A.mono }}>{s.v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      <ChartCard title={`💰 Revenue — ${periodLabel}`}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} barCategoryGap="30%">
              <XAxis dataKey="label" tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(1)+"k":v}`} />
              <Tooltip contentStyle={{ background:A.surf, border:`1px solid ${A.border}`, borderRadius:8, color:A.text }} formatter={v=>[`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]} />
              <Bar dataKey="revenue" fill={A.accent} radius={[5,5,0,0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartCard>

      {/* Customers & Transactions side by side */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <ChartCard title={`👥 Customers — ${periodLabel}`}>
          {hasData ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data} barCategoryGap="30%">
                <XAxis dataKey="label" tick={{ fill:A.muted, fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background:A.surf, border:`1px solid ${A.border}`, borderRadius:8, color:A.text }} formatter={v=>[v,"Customers"]} />
                <Bar dataKey="customers" fill="#00B87A" radius={[5,5,0,0]} name="Customers" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title={`🧾 Transactions — ${periodLabel}`}>
          {hasData ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data} barCategoryGap="30%">
                <XAxis dataKey="label" tick={{ fill:A.muted, fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background:A.surf, border:`1px solid ${A.border}`, borderRadius:8, color:A.text }} formatter={v=>[v,"Transactions"]} />
                <Bar dataKey="transactions" fill="#FFB547" radius={[5,5,0,0]} name="Transactions" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Combined trend line chart */}
      <ChartCard title={`📈 Combined Trend — ${periodLabel}`}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
              <XAxis dataKey="label" tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(1)+"k":v}`} />
              <YAxis yAxisId="c" orientation="right" tick={{ fill:A.muted, fontSize:11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background:A.surf, border:`1px solid ${A.border}`, borderRadius:8, color:A.text }} />
              <Legend wrapperStyle={{ color:A.muted, fontSize:12 }} />
              <Line yAxisId="r" type="monotone" dataKey="revenue" stroke={A.accent} strokeWidth={2.5} dot={{ fill:A.accent, r:4 }} name="Revenue (₹)" />
              <Line yAxisId="c" type="monotone" dataKey="customers" stroke="#00B87A" strokeWidth={2.5} dot={{ fill:"#00B87A", r:4 }} name="Customers" />
              <Line yAxisId="c" type="monotone" dataKey="transactions" stroke="#FFB547" strokeWidth={2.5} dot={{ fill:"#FFB547", r:4 }} name="Transactions" />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartCard>
    </div>
  );
};



// ─── AI FORECAST VIEW ─────────────────────────────────────────────────────────
const AIView = ({ products }) => {
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchInsights = useCallback(async () => {
    if (products.length === 0) { toast("Add products first before generating insights", "warn"); return; }
    setLoading(true);
    setInsight("");

    const critical = products.filter(p => p.stock < 10).map(p => `${p.name}: ${p.stock} units`).join(", ") || "None";
    const low      = products.filter(p => p.stock >= 10 && p.stock < 30).map(p => `${p.name}: ${p.stock} units`).join(", ") || "None";
    const healthy  = products.filter(p => p.stock >= 30).length;
    const prompt = `You are an AI inventory analyst for SuperMart grocery supermarket. Analyze the live inventory and return EXACTLY 5 bullet points. Each bullet MUST start with one of these exact labels followed by a colon: [URGENT], [WARNING], [TIP], [INSIGHT], [ACTION]. Keep each bullet under 20 words. No intro text, no paragraph, no markdown, just the 5 bullets on separate lines.

INVENTORY DATA:
- Critical stock (<10 units): ${critical}
- Low stock (10-30 units): ${low}
- Healthy stock (30+ units): ${healthy} products
- Total products: ${products.length}

Example format:
[URGENT]: Reorder Lay's Classic Salted immediately — only 2 units remaining.
[WARNING]: Colgate MaxFresh stock at 8 units, reorder within 48 hours.
[TIP]: Promote high-stock items with bundles to accelerate turnover.
[INSIGHT]: 3 of ${products.length} products need restocking attention this week.
[ACTION]: Schedule supplier call for critical items before next business day.`;

    const result = await askGroq(prompt);

    if (result && result.startsWith("__ERROR__:")) {
      // API key or request issue — show specific error
      setInsight(`⚠️ ${result.replace("__ERROR__: ", "")}`);
    } else if (result) {
      setInsight(result);
    } else {
      // Groq AI unavailable — generate structured local insight from live data
      const critArr = products.filter(p => p.stock < 10).sort((a, b) => a.stock - b.stock);
      const lowArr  = products.filter(p => p.stock >= 10 && p.stock < 30);
      const lines = [];
      if (critArr.length > 0)
        lines.push(`[URGENT]: Reorder ${critArr.map(p => `${p.name} (${p.stock} left)`).join(", ")} immediately.`);
      else
        lines.push(`[INSIGHT]: No critical stock items — all products have at least 10 units.`);
      if (lowArr.length > 0)
        lines.push(`[WARNING]: ${lowArr.map(p => `${p.name} (${p.stock} units)`).join(", ")} are running low — plan reorder soon.`);
      else
        lines.push(`[INSIGHT]: Low-stock zone is clear — no items between 10–30 units threshold.`);
      lines.push(`[INSIGHT]: ${healthy} of ${products.length} products are well-stocked (30+ units).`);
      lines.push(critArr.length === 0 && lowArr.length === 0
        ? `[TIP]: All inventory levels are healthy. Consider running promotions to boost turnover.`
        : `[ACTION]: Schedule a supplier restock for ${critArr.length + lowArr.length} products requiring attention.`);
      lines.push(`[TIP]: Review pricing on top-stocked products to drive volume and clear slow-movers.`);
      setInsight(lines.join("\n"));
    }

    setLastUpdated(new Date().toLocaleTimeString());
    setLoading(false);
  }, [products]);

  // Live stock alert list from real products
  const alerts = products.filter(p => p.stock < 10).sort((a, b) => a.stock - b.stock);

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22, animation: "fadein 0.2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><h2 style={{ color: A.text, fontSize: 20, fontWeight: 700 }}>AI Inventory Insights</h2><p style={{ color: A.muted, fontSize: 13, marginTop: 4 }}>Powered by Groq AI{lastUpdated ? ` · Updated at ${lastUpdated}` : ""}</p></div>
        <button onClick={fetchInsights} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: A.surf, border: `1px solid ${A.border}`, borderRadius: 8, color: loading ? A.muted : A.text, fontSize: 13, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
          <RefreshCw size={15} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />{loading ? "Analyzing…" : "Generate Insights"}
        </button>
      </div>
      <div style={{ background: `${A.accent}08`, border: `1px solid ${A.accent}25`, borderRadius: 16, padding: "20px 22px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: loading || !insight ? 12 : 16 }}>
          <div style={{ background: `linear-gradient(135deg, ${A.accent}, ${A.accentB})`, borderRadius: 10, padding: 9, display: "flex", flexShrink: 0, boxShadow: `0 0 16px ${A.accent}40` }}>
            <Cpu size={18} color="#fff" />
          </div>
          <div>
            <h4 style={{ color: A.accent, fontSize: 14, fontWeight: 700, margin: 0 }}>Groq AI Insights</h4>
            <span style={{ color: A.muted, fontSize: 11 }}>Powered by llama-3.3-70b · Live inventory analysis</span>
          </div>
        </div>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
            <Spinner />
            <span style={{ color: A.muted, fontSize: 14 }}>Analyzing your inventory data…</span>
          </div>
        ) : !insight ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: A.muted, fontSize: 13 }}>
            Click <strong style={{ color: A.text }}>"Generate Insights"</strong> to analyze your live inventory.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {insight.split("\n").filter(line => line.trim()).map((line, i) => {
              const tagMatch = line.match(/^\[(URGENT|WARNING|TIP|INSIGHT|ACTION)\]:\s*/i);
              const tag = tagMatch ? tagMatch[1].toUpperCase() : null;
              const text = tagMatch ? line.replace(tagMatch[0], "").trim() : line.trim();
              const tagStyles = {
                URGENT:  { bg: "rgba(255,77,109,0.12)", border: "rgba(255,77,109,0.3)",  dot: "#FF4D6D", label: "🔴 URGENT",  labelColor: "#FF4D6D"  },
                WARNING: { bg: "rgba(255,181,71,0.10)", border: "rgba(255,181,71,0.3)",  dot: "#FFB547", label: "🟡 WARNING", labelColor: "#FFB547"  },
                TIP:     { bg: "rgba(0,212,170,0.10)",  border: "rgba(0,212,170,0.3)",   dot: "#00D4AA", label: "💡 TIP",     labelColor: "#00D4AA"  },
                INSIGHT: { bg: `rgba(123,97,255,0.10)`, border: `rgba(123,97,255,0.3)`,  dot: A.accent,  label: "📊 INSIGHT", labelColor: A.accent   },
                ACTION:  { bg: "rgba(77,163,255,0.10)", border: "rgba(77,163,255,0.3)",  dot: "#4DA3FF", label: "⚡ ACTION",  labelColor: "#4DA3FF"  },
              };
              const s = tagStyles[tag] || tagStyles.INSIGHT;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  background: s.bg, border: `1px solid ${s.border}`,
                  borderRadius: 10, padding: "12px 16px",
                  animation: `fadein 0.2s ease ${i * 0.06}s both`,
                }}>
                  <div style={{ flexShrink: 0, marginTop: 1 }}>
                    <span style={{
                      display: "inline-block",
                      background: `${s.dot}20`, border: `1px solid ${s.dot}50`,
                      color: s.labelColor, fontSize: 10, fontWeight: 800,
                      borderRadius: 6, padding: "2px 8px", letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}>{s.label}</span>
                  </div>
                  <p style={{ color: A.text, fontSize: 13.5, lineHeight: 1.6, margin: 0, flex: 1 }}>{text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, padding: 24 }}>
        <h3 style={{ color: A.text, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Live Stock Alerts</h3>
        {alerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <CheckCircle2 size={32} color={A.alt} style={{ marginBottom: 12 }} />
            <p style={{ color: A.muted, fontSize: 14 }}>{products.length === 0 ? "No products yet. Add products from the Products section." : "All products are well-stocked ✅"}</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${A.border}` }}>
              {["Product", "Category", "Stock", "Status"].map(h => <th key={h} style={{ color: A.muted, fontSize: 11, fontWeight: 600, padding: "8px 0", textAlign: "left", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {alerts.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${A.border}`, background: i % 2 === 1 ? A.surfAlt : "transparent" }}>
                  <td style={{ padding: "12px 0", color: A.text, fontSize: 13, fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: "12px 0", color: A.muted, fontSize: 13 }}>{p.cat}</td>
                  <td style={{ padding: "12px 0", color: p.stock === 0 ? A.danger : A.warn, fontSize: 13, fontFamily: A.mono, fontWeight: 700 }}>{p.stock}</td>
                  <td style={{ padding: "12px 0" }}><Badge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── CUSTOMERS VIEW
const CustView = ({ customers, setCustomers, globalSearch }) => {
  const [q, setQ] = useState(globalSearch || "");
  const [modal, setModal] = useState(null); // null | "add" | {edit: customer}
  const [delTarget, setDelTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  useEffect(() => { if (globalSearch) setQ(globalSearch); }, [globalSearch]);
  const filtered = customers.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone?.includes(q) || c.tag?.toLowerCase().includes(q.toLowerCase()));

  const handleAdd = async (form) => {
    setSaving(true);
    const cust = { ...form, spend: 0, visits: 0, points: 0, tag: "Regular" };
    const res = await sbInsert("customers", cust);
    const newCust = res?.[0] ? res[0] : { ...cust, id: Date.now() };
    setCustomers(p => [...p, newCust]);
    toast("Customer added successfully");
    setSaving(false); setModal(null);
  };

  const handleEdit = async (form) => {
    setSaving(true);
    const id = modal.edit.id;
    await sbUpdate("customers", id, form);
    setCustomers(p => p.map(x => x.id === id ? { ...x, ...form } : x));
    toast("Customer updated");
    setSaving(false); setModal(null);
  };

  const handleDelete = async () => {
    await sbDelete("customers", delTarget.id);
    setCustomers(p => p.filter(x => x.id !== delTarget.id));
    toast("Customer deleted", "warn"); setDelTarget(null);
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20, animation: "fadein 0.2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><h2 style={{ color: A.text, fontSize: 20, fontWeight: 700 }}>Customer Management</h2><p style={{ color: A.muted, fontSize: 13, marginTop: 4 }}>{customers.length} registered customers</p></div>
        <button onClick={() => setModal("add")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: A.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}><Plus size={15} />Add Customer</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: A.surf, border: `1px solid ${A.border}`, borderRadius: 8, padding: "10px 14px" }}>
        <Search size={15} color={A.muted} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, phone, or segment…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: A.text, fontSize: 13 }} />
        {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: A.muted, display: "flex" }}><X size={13} /></button>}
      </div>
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${A.border}`, background: A.bg }}>
            {["Name", "Phone", "Total Spend", "Visits", "Loyalty Points", "Segment", "Actions"].map(h => <th key={h} style={{ color: A.muted, fontSize: 11, fontWeight: 600, padding: "14px 16px", textAlign: "left", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: A.muted, fontSize: 14 }}>No customers found</td></tr>}
            {filtered.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${A.border}`, background: i % 2 === 1 ? A.surfAlt : "transparent", cursor: "pointer" }} onClick={() => setSelectedCustomer(c)}>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${A.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", color: A.accent, fontSize: 14, fontWeight: 700 }}>{c.name[0]}</div>
                    <span style={{ color: A.text, fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                  </div>
                </td>
                <td style={{ padding: "14px 16px", color: A.muted, fontSize: 13, fontFamily: A.mono }}>{c.phone}</td>
                <td style={{ padding: "14px 16px", color: A.text, fontSize: 13, fontFamily: A.mono, fontWeight: 600 }}>₹{Number(c.spend).toLocaleString("en-IN")}</td>
                <td style={{ padding: "14px 16px", color: A.text, fontSize: 13, fontFamily: A.mono }}>{c.visits}</td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Star size={12} color={A.warn} fill={A.warn} /><span style={{ color: A.text, fontSize: 13, fontFamily: A.mono, fontWeight: 600 }}>{c.points}</span></div>
                </td>
                <td style={{ padding: "14px 16px" }}><TagBadge tag={c.tag} /></td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={e => { e.stopPropagation(); setModal({ edit: c }); }} style={{ background: "none", border: "none", cursor: "pointer", color: A.accent, display: "flex", padding: 4 }}><Edit2 size={15} /></button>
                    <button onClick={e => { e.stopPropagation(); setDelTarget(c); }} style={{ background: "none", border: "none", cursor: "pointer", color: A.danger, display: "flex", padding: 4 }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal === "add" && <CustomerModal onSave={handleAdd} onClose={() => setModal(null)} saving={saving} />}
      {modal?.edit && <CustomerModal initial={modal.edit} onSave={handleEdit} onClose={() => setModal(null)} saving={saving} />}
      {delTarget && <ConfirmModal msg={`Delete "${delTarget.name}"? This cannot be undone.`} onConfirm={handleDelete} onClose={() => setDelTarget(null)} />}
      {selectedCustomer && (
        <Modal title="Customer Details" onClose={() => setSelectedCustomer(null)} width={400}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `${A.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", color: A.accent, fontSize: 22, fontWeight: 800 }}>{selectedCustomer.name[0]}</div>
              <div><h3 style={{ color: A.text, fontSize: 18, fontWeight: 700 }}>{selectedCustomer.name}</h3><p style={{ color: A.muted, fontSize: 13, marginTop: 2 }}>{selectedCustomer.phone}</p></div>
              <div style={{ marginLeft: "auto" }}><TagBadge tag={selectedCustomer.tag} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[{ l: "Total Spend", v: `₹${Number(selectedCustomer.spend).toLocaleString("en-IN")}` }, { l: "Visits", v: selectedCustomer.visits }, { l: "Points", v: selectedCustomer.points }].map((s, i) => (
                <div key={i} style={{ background: A.bg, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                  <p style={{ color: A.muted, fontSize: 11, textTransform: "uppercase" }}>{s.l}</p>
                  <p style={{ color: A.text, fontSize: 20, fontWeight: 700, marginTop: 4, fontFamily: A.mono }}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const CustomerModal = ({ initial, onSave, onClose, saving }) => {
  const [form, setForm] = useState(initial || { name: "", phone: "", spend: 0, visits: 0, points: 0, tag: "Regular" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isEdit = !!initial;
  return (
    <Modal title={isEdit ? "Edit Customer" : "Add New Customer"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Full Name" required><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Customer's full name" /></Field>
        <Field label="Phone Number"><Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="10-digit mobile number" /></Field>
        {isEdit && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Total Spend (₹)"><Input type="number" value={form.spend} onChange={e => set("spend", e.target.value)} /></Field>
              <Field label="Visits"><Input type="number" value={form.visits} onChange={e => set("visits", e.target.value)} /></Field>
              <Field label="Points"><Input type="number" value={form.points} onChange={e => set("points", e.target.value)} /></Field>
            </div>
            <Field label="Segment">
              <Select value={form.tag} onChange={e => set("tag", e.target.value)}>
                <option value="Regular">Regular</option>
                <option value="VIP">VIP</option>
                <option value="Inactive">Inactive</option>
              </Select>
            </Field>
          </>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "none", border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={() => form.name && onSave(form)} disabled={!form.name || saving} style={{ flex: 2, padding: 12, background: A.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: !form.name ? 0.5 : 1 }}>
            {saving ? <><Spinner /> Saving…</> : isEdit ? <><Save size={16} />Save Changes</> : <><Plus size={16} />Add Customer</>}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── STAFF VIEW ───────────────────────────────────────────────────────────────
const StaffView = ({ staff, setStaff }) => {
  const [modal, setModal] = useState(null); // null | "add" | {edit: member}
  const [delTarget, setDelTarget] = useState(null); // staff to delete
  const [saving, setSaving] = useState(false);

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      await sbDelete("staff", delTarget.id);
      setStaff(p => p.filter(x => x.id !== delTarget.id));
      toast("Staff member removed", "warn");
    } catch {
      toast("❌ Delete failed — check Firebase connection", "warn");
    } finally {
      setDelTarget(null);
    }
  };

  const handleAdd = async (form) => {
    setSaving(true);
    try {
      const member = { ...form, sales: 0, rev: 0, status: form.status || "active" };
      const res = await sbInsert("staff", member);
      if (!res) throw new Error("Firestore insert failed");
      const newMember = { ...res[0] };
      setStaff(p => [...p, newMember]);
      toast("✅ Staff member added & saved to database");
    } catch (err) {
      console.error("handleAdd staff error:", err);
      toast("❌ Failed to add staff — check Firebase connection", "warn");
    } finally {
      setSaving(false); setModal(null);
    }
  };

  const handleEdit = async (form) => {
    setSaving(true);
    try {
      const id = modal.edit.id;
      const ok = await sbUpdate("staff", id, form);
      if (!ok) throw new Error("Firestore update failed");
      setStaff(p => p.map(x => x.id === id ? { ...x, ...form } : x));
      toast("✅ Staff details updated in database");
    } catch (err) {
      console.error("handleEdit staff error:", err);
      toast("❌ Failed to update staff — check Firebase connection", "warn");
    } finally {
      setSaving(false); setModal(null);
    }
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20, animation: "fadein 0.2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><h2 style={{ color: A.text, fontSize: 20, fontWeight: 700 }}>Staff Management</h2><p style={{ color: A.muted, fontSize: 13, marginTop: 4 }}>Cashiers and admin users</p></div>
        <button onClick={() => setModal("add")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: A.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}><Plus size={15} />Add Staff</button>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {staff.map((s, i) => (
          <div key={s.id || i} style={{ flex: "1 1 220px", background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, padding: 20, position: "relative" }}>
            <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
              <button onClick={() => setModal({ edit: s })} title="Edit staff" style={{ background: "none", border: `1px solid ${A.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: A.accent, display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <Edit2 size={11} />Edit
              </button>
              <button onClick={() => setDelTarget(s)} title="Delete staff" style={{ background: "none", border: `1px solid ${A.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: A.danger, display: "flex", alignItems: "center", fontSize: 11 }}>
                <Trash2 size={11} />
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, paddingRight: 50 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${A.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", color: A.accent, fontSize: 18, fontWeight: 700 }}>{s.name[0]}</div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, height: "fit-content", background: s.status === "active" ? `${A.alt}20` : `${A.warn}20`, color: s.status === "active" ? A.alt : A.warn }}>
                {s.status === "active" ? "On Shift" : "On Break"}
              </span>
            </div>
            <h4 style={{ color: A.text, fontSize: 14, fontWeight: 600 }}>{s.name}</h4>
            <p style={{ color: A.muted, fontSize: 12, marginTop: 4 }}>{s.role} · {s.counter || "—"}</p>
            {Number(s.sales) > 0 && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${A.border}`, display: "flex", justifyContent: "space-between" }}>
              <div><p style={{ color: A.muted, fontSize: 11 }}>Transactions</p><p style={{ color: A.text, fontSize: 16, fontWeight: 700, fontFamily: A.mono, marginTop: 2 }}>{s.sales}</p></div>
              <div><p style={{ color: A.muted, fontSize: 11 }}>Revenue</p><p style={{ color: A.text, fontSize: 16, fontWeight: 700, fontFamily: A.mono, marginTop: 2 }}>₹{(Number(s.rev) / 1000).toFixed(1)}k</p></div>
            </div>}
          </div>
        ))}
      </div>
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${A.border}`, background: A.bg }}>
          <h3 style={{ color: A.text, fontSize: 14, fontWeight: 600 }}>Activity Log</h3>
        </div>
        <div style={{ padding: "24px 20px", textAlign: "center", color: A.muted, fontSize: 13 }}>
          No activity recorded yet.
        </div>
      </div>
      {modal === "add" && (
        <Modal title="Add Staff Member" onClose={() => setModal(null)}>
          <StaffForm onSave={handleAdd} onClose={() => setModal(null)} saving={saving} />
        </Modal>
      )}
      {modal?.edit && (
        <Modal title="Edit Staff Member" onClose={() => setModal(null)}>
          <StaffForm initial={modal.edit} onSave={handleEdit} onClose={() => setModal(null)} saving={saving} />
        </Modal>
      )}
      {delTarget && <ConfirmModal msg={`Remove "${delTarget.name}" from staff? This cannot be undone.`} onConfirm={handleDelete} onClose={() => setDelTarget(null)} />}
    </div>
  );
};
const StaffForm = ({ initial, onSave, onClose, saving }) => {
  const [form, setForm] = useState(initial || { name: "", role: "Cashier", counter: "Counter 1", pin: "1234", status: "active" });
  const [showPin, setShowPin] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Full Name" required><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Staff member name" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Role"><Select value={form.role} onChange={e => set("role", e.target.value)}><option>Cashier</option><option>Admin</option><option>Supervisor</option></Select></Field>
        <Field label="Counter"><Select value={form.counter} onChange={e => set("counter", e.target.value)}><option>Counter 1</option><option>Counter 2</option><option>Counter 3</option><option>—</option></Select></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="POS PIN (4 digits)">
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type={showPin ? "text" : "password"}
              value={form.pin}
              onChange={e => set("pin", e.target.value.slice(0, 4))}
              placeholder="4-digit PIN"
              maxLength={4}
              style={{ width: "100%", padding: "10px 40px 10px 12px", background: A.bg, border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 13, outline: "none", letterSpacing: showPin ? "normal" : "0.3em", fontFamily: A.mono }}
            />
            <button
              type="button"
              onClick={() => setShowPin(p => !p)}
              style={{ position: "absolute", right: 10, background: "none", border: "none", cursor: "pointer", color: A.muted, display: "flex", alignItems: "center", padding: 0, transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = A.accent}
              onMouseLeave={e => e.currentTarget.style.color = A.muted}
              title={showPin ? "Hide PIN" : "Show PIN"}
            >
              {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
        <Field label="Status"><Select value={form.status || "active"} onChange={e => set("status", e.target.value)}><option value="active">On Shift</option><option value="break">On Break</option></Select></Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 12, background: "none", border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
        <button onClick={() => form.name && onSave(form)} disabled={!form.name || saving} style={{ flex: 2, padding: 12, background: A.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: !form.name ? 0.5 : 1 }}>
          {saving ? <><Spinner /> Saving…</> : initial ? <><Save size={16} />Save Changes</> : <><Plus size={16} />Add Staff Member</>}
        </button>
      </div>
    </div>
  );
};

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────
const SetView = () => {
  const DEFAULTS = {
    storeName: "SuperMart Thanjavur", address: "152, Big Street, Thanjavur - 613001",
    gstin: "33AABCU9603R1ZX", phone: "+91 98765 43210",
    defaultGST: "18%", foodGST: "5%", personalCareGST: "12%",
    lowStockAlert: "10", criticalStockAlert: "3", highTxAlert: "10000",
  };
  const [settings, setSettings] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [dbId, setDbId] = useState(null);   // existing Firestore doc ID
  const [synced, setSynced] = useState(false); // true once first read done
  const [dirty, setDirty] = useState(false);   // unsaved local changes

  // ── Real-time Firestore listener ──────────────────────────────────────────
  useEffect(() => {
    let unsub;
    import("firebase/firestore").then(({ onSnapshot, collection }) => {
      import("./firebase.js").then(({ db }) => {
        unsub = onSnapshot(collection(db, "settings"), snap => {
          if (!snap.empty) {
            const d = snap.docs[0];
            setDbId(d.id);
            setSettings(prev => ({ ...DEFAULTS, ...d.data() }));
          }
          setSynced(true);
          setDirty(false);
        }, err => { console.warn("settings onSnapshot:", err); setSynced(true); });
      });
    });
    return () => unsub?.();
  }, []);

  // ── Save to Firestore ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      if (dbId) {
        await sbUpdate("settings", dbId, settings);
      } else {
        await sbInsert("settings", settings);
      }
      toast("✅ Settings saved & synced to Firebase");
      setDirty(false);
    } catch (e) {
      console.warn("Settings save error:", e);
      localStorage.setItem("supermart_settings", JSON.stringify(settings));
      toast("Saved locally — Firebase unavailable", "warn");
    }
    setSaving(false);
  };

  const setV = (k, v) => { setSettings(p => ({ ...p, [k]: v })); setDirty(true); };

  const sections = [
    { sec: "🏪 Store Information", icon: "🏪", fields: [
      { l: "Store Name", k: "storeName", ph: "Your store name" },
      { l: "Address", k: "address", ph: "Full address" },
      { l: "GSTIN", k: "gstin", ph: "GST Identification Number" },
      { l: "Phone", k: "phone", ph: "+91 XXXXX XXXXX" },
    ]},
    { sec: "📊 Tax Configuration", icon: "📊", fields: [
      { l: "Default GST Slab", k: "defaultGST", ph: "e.g. 18%" },
      { l: "Food Items GST", k: "foodGST", ph: "e.g. 5%" },
      { l: "Personal Care GST", k: "personalCareGST", ph: "e.g. 12%" },
    ]},
    { sec: "🔔 Notification Thresholds", icon: "🔔", fields: [
      { l: "Low Stock Alert (units)", k: "lowStockAlert", ph: "e.g. 10", type: "number" },
      { l: "Critical Stock Alert (units)", k: "criticalStockAlert", ph: "e.g. 3", type: "number" },
      { l: "High Transaction Alert (₹)", k: "highTxAlert", ph: "e.g. 10000", type: "number" },
    ]},
  ];

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22, animation: "fadein 0.2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ color: A.text, fontSize: 20, fontWeight: 700 }}>Settings</h2>
          <p style={{ color: A.muted, fontSize: 13, marginTop: 4 }}>Store configuration and preferences</p>
        </div>
        {/* Sync Status Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dirty && <span style={{ fontSize: 12, color: A.warn, fontWeight: 600 }}>● Unsaved changes</span>}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: synced ? `${A.alt}15` : `${A.warn}15`, border: `1px solid ${synced ? A.alt : A.warn}40`, borderRadius: 20, padding: "5px 12px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: synced ? A.alt : A.warn, boxShadow: `0 0 6px ${synced ? A.alt : A.warn}` }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: synced ? A.alt : A.warn }}>{synced ? (dbId ? "Synced with Firebase" : "Not saved yet") : "Connecting…"}</span>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      {sections.map((s, i) => (
        <div key={i} style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${A.border}`, background: A.bg, display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ color: A.text, fontSize: 14, fontWeight: 600 }}>{s.sec}</h3>
          </div>
          <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {s.fields.map((f, j) => (
              <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <label style={{ color: A.muted, fontSize: 13, minWidth: 200 }}>{f.l}</label>
                <input
                  type={f.type || "text"}
                  value={settings[f.k] || ""}
                  onChange={e => setV(f.k, e.target.value)}
                  placeholder={f.ph}
                  style={{ flex: 1, maxWidth: 320, background: A.bg, border: `1px solid ${A.border}`, borderRadius: 8, padding: "9px 12px", color: A.text, fontSize: 13, outline: "none", textAlign: "right", transition: "border 0.15s" }}
                  onFocus={e => e.target.style.borderColor = A.accent}
                  onBlur={e => e.target.style.borderColor = A.border}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Integration Status */}
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, padding: 20 }}>
        <h3 style={{ color: A.text, fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Integration Status</h3>
        {[
          { l: "Firebase Firestore", v: synced ? "Connected" : "Connecting…", ok: synced },
          { l: "Gemini AI", v: "Connected", ok: true },
          { l: "Payment Gateway", v: "Not configured", ok: false },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? `1px solid ${A.border}` : "none" }}>
            <span style={{ color: A.text, fontSize: 13 }}>{r.l}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: r.ok ? A.alt : A.warn, display: "flex", alignItems: "center", gap: 6 }}>
              {r.ok ? <Check size={13} /> : <AlertTriangle size={13} />}{r.v}
            </span>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "11px 24px", background: dirty ? A.accent : A.surf, border: `1px solid ${dirty ? A.accent : A.border}`, borderRadius: 10, color: dirty ? "#fff" : A.muted, fontSize: 13, cursor: saving ? "wait" : "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}>
          {saving ? <><Spinner /> Saving to Firebase…</> : <><Save size={15} />Save All Changes</>}
        </button>
        {dirty && (
          <button onClick={() => { setSettings(DEFAULTS); setDirty(false); }} style={{ padding: "11px 20px", background: "none", border: `1px solid ${A.border}`, borderRadius: 10, color: A.muted, fontSize: 13, cursor: "pointer" }}>
            Reset to Defaults
          </button>
        )}
      </div>
    </div>
  );
};

// ─── BANNER SLIDER (shared — used in POS and customer page) ──────────────────
const BannerSlider = ({ banners = [], height = 180 }) => {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);
  const active = banners.filter(b => b.active !== false);

  const goTo = (i) => setIdx((i + active.length) % active.length);

  useEffect(() => {
    if (active.length < 2) return;
    timerRef.current = setInterval(() => setIdx(p => (p + 1) % active.length), 4000);
    return () => clearInterval(timerRef.current);
  }, [active.length]);

  if (!active.length) return (
    <div style={{ height, background: `linear-gradient(135deg, ${A.surf}, ${A.bg})`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${A.border}`, flexDirection: 'column', gap: 8 }}>
      <Image size={32} color={A.muted} />
      <span style={{ color: A.muted, fontSize: 13 }}>No banners configured — add from Admin → Banners</span>
    </div>
  );

  const cur = active[idx];
  return (
    <div style={{ position: 'relative', height, borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.35)', userSelect: 'none', flexShrink: 0 }}>
      {/* Slides */}
      {active.map((b, i) => (
        <div key={b.id || i} style={{
          position: 'absolute', inset: 0,
          transition: 'opacity 0.8s ease, transform 0.8s ease',
          opacity: i === idx ? 1 : 0,
          transform: i === idx ? 'scale(1)' : 'scale(1.03)',
          pointerEvents: i === idx ? 'auto' : 'none',
        }}>
          <img
            src={b.url}
            alt={b.title || 'Banner'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80&auto=format&fit=crop'; }}
          />
          {/* Gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)' }} />
          {b.title && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 20px' }}>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.6)', letterSpacing: '-0.01em' }}>{b.title}</div>
              {b.subtitle && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3 }}>{b.subtitle}</div>}
            </div>
          )}
        </div>
      ))}

      {/* Prev / Next arrows */}
      {active.length > 1 && (<>
        <button onClick={() => goTo(idx - 1)} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, backdropFilter: 'blur(4px)', transition: 'background 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.45)'}>
          <ChevronLeft size={18} color='#fff' />
        </button>
        <button onClick={() => goTo(idx + 1)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, backdropFilter: 'blur(4px)', transition: 'background 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.45)'}>
          <ChevronRight size={18} color='#fff' />
        </button>
      </>)}

      {/* Dot indicators */}
      {active.length > 1 && (
        <div style={{ position: 'absolute', bottom: 10, right: 16, display: 'flex', gap: 5, zIndex: 10 }}>
          {active.map((_, i) => (
            <div key={i} onClick={() => setIdx(i)} style={{ width: i === idx ? 20 : 6, height: 6, borderRadius: 3, background: i === idx ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.4s ease', cursor: 'pointer' }} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── BANNER VIEW (admin-only management panel) ────────────────────────────────
const BannerView = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [subtitleInput, setSubtitleInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [imgOk, setImgOk] = useState(null); // null | true | false

  // ── Real-time listener ──
  useEffect(() => {
    let unsub;
    import('firebase/firestore').then(({ onSnapshot, collection, query, orderBy }) => {
      import('./firebase.js').then(({ db }) => {
        const q = query(collection(db, 'banners'), orderBy('order', 'asc'));
        unsub = onSnapshot(q, snap => {
          setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        }, () => {
          // fallback without ordering if index not built yet
          import('firebase/firestore').then(({ onSnapshot: os2, collection: col2 }) => {
            import('./firebase.js').then(({ db: db2 }) => {
              os2(col2(db2, 'banners'), s2 => {
                setBanners(s2.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
              });
            });
          });
        });
      });
    });
    return () => unsub?.();
  }, []);

  const validateImg = (url) => {
    if (!url) { setImgOk(null); return; }
    const img = new window.Image();
    img.onload = () => setImgOk(true);
    img.onerror = () => setImgOk(false);
    img.src = url;
  };

  const handleAdd = async () => {
    if (!urlInput.trim()) { toast('Please enter an image URL', 'warn'); return; }
    setSaving(true);
    try {
      await sbInsert('banners', {
        url: urlInput.trim(),
        title: titleInput.trim(),
        subtitle: subtitleInput.trim(),
        order: banners.length,
        active: true,
      });
      setUrlInput(''); setTitleInput(''); setSubtitleInput(''); setPreviewUrl(''); setImgOk(null);
      toast('✅ Banner added & live across POS and Customer site');
    } catch (e) { toast('❌ Failed to add banner: ' + e.message, 'warn'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await import('firebase/firestore').then(({ deleteDoc, doc }) =>
        import('./firebase.js').then(({ db }) => deleteDoc(doc(db, 'banners', id)))
      );
      toast('Banner removed', 'warn');
    } catch (e) { toast('❌ Delete failed', 'warn'); }
  };

  const toggleActive = async (b) => {
    try {
      await sbUpdate('banners', b.id, { active: !b.active });
    } catch (e) { toast('Failed to toggle banner', 'warn'); }
  };

  const moveUp = async (i) => {
    if (i === 0) return;
    const a = banners[i], b = banners[i - 1];
    await sbUpdate('banners', a.id, { order: i - 1 });
    await sbUpdate('banners', b.id, { order: i });
  };

  const moveDown = async (i) => {
    if (i === banners.length - 1) return;
    const a = banners[i], b = banners[i + 1];
    await sbUpdate('banners', a.id, { order: i + 1 });
    await sbUpdate('banners', b.id, { order: i });
  };

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 22, animation: 'fadein 0.2s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: A.text, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Image size={22} color={A.accent} /> Banner Management
          </h2>
          <p style={{ color: A.muted, fontSize: 13, marginTop: 4 }}>Banners appear live on POS screen &amp; Customer Website — no refresh needed</p>
        </div>
        <div style={{ background: `${A.alt}15`, border: `1px solid ${A.alt}40`, borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.alt, boxShadow: `0 0 6px ${A.alt}` }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: A.alt }}>Real-time Firebase sync</span>
        </div>
      </div>

      {/* Live Preview */}
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ color: A.text, fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={16} color={A.accent} /> Live Preview
          <span style={{ fontSize: 11, color: A.muted, fontWeight: 400 }}>— how it looks in POS &amp; Customer site</span>
        </div>
        <BannerSlider banners={banners} height={200} />
      </div>

      {/* Add Banner Form */}
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${A.border}`, background: A.bg, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Plus size={16} color={A.accent} />
          <h3 style={{ color: A.text, fontSize: 14, fontWeight: 600 }}>Add New Banner</h3>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* URL input */}
          <div>
            <label style={{ color: A.muted, fontSize: 12, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Image URL *</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type='url'
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); }}
                  onBlur={e => { const v = e.target.value.trim(); setPreviewUrl(v); validateImg(v); }}
                  placeholder='https://images.unsplash.com/photo-...' 
                  style={{ width: '100%', background: A.bg, border: `1px solid ${imgOk === false ? '#ff5555' : imgOk === true ? A.alt : A.border}`, borderRadius: 8, padding: '10px 12px', color: A.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s' }}
                  onFocus={e => e.target.style.borderColor = A.accent}
                />
                {imgOk !== null && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>
                    {imgOk ? '✅' : '❌'}
                  </span>
                )}
              </div>
              {previewUrl && imgOk && (
                <img src={previewUrl} alt='' style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 8, border: `1px solid ${A.border}`, flexShrink: 0 }} onError={() => setImgOk(false)} />
              )}
            </div>
            <p style={{ color: A.muted, fontSize: 11, marginTop: 5 }}>Use any public image URL — Unsplash, your CDN, or Firebase Storage link.</p>
          </div>
          {/* Title & Subtitle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ color: A.muted, fontSize: 12, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Title (optional)</label>
              <input type='text' value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder='e.g. Weekend Mega Sale' style={{ width: '100%', background: A.bg, border: `1px solid ${A.border}`, borderRadius: 8, padding: '10px 12px', color: A.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = A.accent} onBlur={e => e.target.style.borderColor = A.border} />
            </div>
            <div>
              <label style={{ color: A.muted, fontSize: 12, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subtitle (optional)</label>
              <input type='text' value={subtitleInput} onChange={e => setSubtitleInput(e.target.value)} placeholder='e.g. Up to 50% off all items' style={{ width: '100%', background: A.bg, border: `1px solid ${A.border}`, borderRadius: 8, padding: '10px 12px', color: A.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = A.accent} onBlur={e => e.target.style.borderColor = A.border} />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !urlInput.trim()}
            style={{ alignSelf: 'flex-start', padding: '10px 22px', background: (saving || !urlInput.trim()) ? A.surf : A.accent, border: `1px solid ${A.accent}`, borderRadius: 10, color: (saving || !urlInput.trim()) ? A.muted : '#fff', fontSize: 13, fontWeight: 700, cursor: (saving || !urlInput.trim()) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
            {saving ? <><RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Adding…</> : <><Plus size={14} /> Add Banner</>}
          </button>
        </div>
      </div>

      {/* Banner List */}
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${A.border}`, background: A.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: A.text, fontSize: 14, fontWeight: 600 }}>Current Banners ({banners.length})</h3>
          <span style={{ fontSize: 12, color: A.muted }}>Drag order ↕ or use arrows · Toggle active/inactive</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: A.muted }}>Loading…</div>
        ) : banners.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: A.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Image size={40} color={A.border} />
            <p>No banners yet. Add your first one above!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {banners.map((b, i) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < banners.length - 1 ? `1px solid ${A.border}` : 'none', background: b.active ? 'transparent' : `${A.bg}88`, opacity: b.active ? 1 : 0.6, transition: 'all 0.2s' }}>
                {/* Thumbnail */}
                <div style={{ width: 90, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${A.border}` }}>
                  <img src={b.url} alt={b.title || 'Banner'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&q=70'; }} />
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: A.text, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title || <em style={{ color: A.muted }}>No title</em>}</div>
                  {b.subtitle && <div style={{ color: A.muted, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.subtitle}</div>}
                  <div style={{ color: A.muted, fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Link size={10} /> {b.url.substring(0, 60)}{b.url.length > 60 ? '…' : ''}</div>
                </div>
                {/* Order arrows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => moveUp(i)} disabled={i === 0} style={{ background: 'none', border: `1px solid ${A.border}`, borderRadius: 4, padding: '3px 6px', cursor: i === 0 ? 'not-allowed' : 'pointer', color: i === 0 ? A.border : A.muted, display: 'flex' }}><ChevronLeft size={12} style={{ transform: 'rotate(90deg)' }} /></button>
                  <button onClick={() => moveDown(i)} disabled={i === banners.length - 1} style={{ background: 'none', border: `1px solid ${A.border}`, borderRadius: 4, padding: '3px 6px', cursor: i === banners.length - 1 ? 'not-allowed' : 'pointer', color: i === banners.length - 1 ? A.border : A.muted, display: 'flex' }}><ChevronRight size={12} style={{ transform: 'rotate(90deg)' }} /></button>
                </div>
                {/* Active toggle */}
                <button onClick={() => toggleActive(b)} style={{ background: b.active ? `${A.alt}18` : `${A.border}40`, border: `1px solid ${b.active ? A.alt : A.border}`, borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: b.active ? A.alt : A.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                  {b.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  {b.active ? 'Active' : 'Inactive'}
                </button>
                {/* Delete */}
                <button onClick={() => handleDelete(b.id)} style={{ background: 'none', border: `1px solid ${A.border}`, borderRadius: 8, padding: '7px', cursor: 'pointer', color: A.danger, display: 'flex', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${A.danger}15`; e.currentTarget.style.borderColor = A.danger; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = A.border; }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick-add popular banner URLs */}
      <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 14, padding: 20 }}>
        <h3 style={{ color: A.text, fontSize: 14, fontWeight: 600, marginBottom: 14 }}>🎨 Quick-Add Sample Banners</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { title: 'Weekend Sale', subtitle: 'Up to 50% off', url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&q=85&auto=format&fit=crop' },
            { title: 'Fresh Arrivals', subtitle: 'New products this week', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=85&auto=format&fit=crop' },
            { title: 'Grocery Deals', subtitle: 'Best prices guaranteed', url: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=1200&q=85&auto=format&fit=crop' },
            { title: 'Beverages & Drinks', subtitle: 'Cool down with our picks', url: 'https://images.unsplash.com/photo-1628557011490-cf30d7e2f4d7?w=1200&q=85&auto=format&fit=crop' },
            { title: 'Organic & Fresh', subtitle: 'Farm to table freshness', url: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=1200&q=85&auto=format&fit=crop' },
            { title: 'Special Offers', subtitle: 'Limited time deals', url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=85&auto=format&fit=crop' },
          ].map((s, i) => (
            <button key={i} onClick={async () => {
              try {
                await sbInsert('banners', { url: s.url, title: s.title, subtitle: s.subtitle, order: banners.length + i, active: true });
                toast(`✅ "${s.title}" banner added`);
              } catch { toast('Failed to add sample banner', 'warn'); }
            }} style={{ background: 'none', border: `1px solid ${A.border}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0, transition: 'border-color 0.2s, box-shadow 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = A.accent; e.currentTarget.style.boxShadow = `0 0 12px ${A.accent}30`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = A.border; e.currentTarget.style.boxShadow = 'none'; }}>
              <img src={s.url} alt={s.title} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '8px 10px' }}>
                <div style={{ color: A.text, fontSize: 12, fontWeight: 600 }}>{s.title}</div>
                <div style={{ color: A.muted, fontSize: 11 }}>{s.subtitle}</div>
                <div style={{ color: A.accent, fontSize: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={10} /> Click to add</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── POS CARD ─────────────────────────────────────────────────────────────────
const PosCard = ({ pr, inC, onAdd }) => {
  const [imgErr, setImgErr] = useState(false);
  // Reset error state whenever the image src changes so a newly-added image
  // always has a fresh attempt (fixes "image gone after re-render" bug)
  useEffect(() => { setImgErr(false); }, [pr.img]);
  return (
    <button onClick={() => onAdd(pr)} style={{ background: P.surf, border: `1.5px solid ${pr.stock === 0 ? P.border : inC ? P.accent : P.border}`, borderRadius: 12, padding: 14, cursor: pr.stock === 0 ? "not-allowed" : "pointer", opacity: pr.stock === 0 ? 0.5 : 1, transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, boxShadow: inC ? `0 0 0 2px ${P.accent}30` : "none" }}>
      <div style={{ width: 60, height: 60, borderRadius: 10, background: P.bg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, alignSelf: "center" }}>
        {pr.img && !imgErr
          ? <img src={pr.img} alt={pr.n} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <span style={{ fontSize: 30, lineHeight: 1 }}>{pr.e || "📦"}</span>
        }
      </div>
      <div style={{ width: "100%" }}>
        <p style={{ color: P.text, fontSize: 12, fontWeight: 600, textAlign: "left", lineHeight: 1.3 }}>{pr.n}</p>
        <p style={{ color: P.accent, fontSize: 16, fontWeight: 800, marginTop: 4, fontFamily: P.mono }}>₹{pr.price}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: pr.stock === 0 ? P.muted : pr.stock < 10 ? "#F59E0B" : P.muted }}>{pr.stock === 0 ? "Out of stock" : `${pr.stock} in stock`}</span>
        {inC && <span style={{ background: P.accent, color: "#fff", borderRadius: "50%", width: 20, height: 20, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{inC.qty}</span>}
      </div>
    </button>
  );
};

// ─── POS TERMINAL ─────────────────────────────────────────────────────────────
const POS = ({ onBack, onSignOut, products, setProducts, cashier, customers, setCustomers }) => {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [activecat, setActivecat] = useState("All");
  const [q, setQ] = useState("");
  const [pay, setPay] = useState("cash");
  const [cash, setCash] = useState("");
  const [done, setDone] = useState(false);
  const [billNo] = useState(() => Math.floor(1000 + Math.random() * 9000));
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [custModal, setCustModal] = useState(false);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custSaving, setCustSaving] = useState(false);
  const [storeSettings, setStoreSettings] = useState(null);
  const [posBanners, setPosBanners] = useState([]);

  // Fetch real-time store settings for receipt printing
  useEffect(() => {
    let unsub;
    import("firebase/firestore").then(({ onSnapshot, collection }) => {
      import("./firebase.js").then(({ db }) => {
        unsub = onSnapshot(collection(db, "settings"), snap => {
          if (!snap.empty) setStoreSettings(snap.docs[0].data());
        });
      });
    });
    return () => unsub && unsub();
  }, []);

  // Real-time banners listener for POS display
  useEffect(() => {
    let unsub;
    import("firebase/firestore").then(({ onSnapshot, collection, query, orderBy }) => {
      import("./firebase.js").then(({ db }) => {
        try {
          const q = query(collection(db, "banners"), orderBy("order", "asc"));
          unsub = onSnapshot(q, snap => setPosBanners(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            () => {
              // fallback without ordering
              unsub = onSnapshot(collection(db, "banners"), snap => setPosBanners(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
            });
        } catch {
          unsub = onSnapshot(collection(db, "banners"), snap => setPosBanners(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        }
      });
    });
    return () => unsub?.();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const breakTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    try {
      if (cashier?.id) await sbUpdate("staff", cashier.id, { status: "break" });
      await sbInsert("notifications", {
        msg: `${cashier?.name || "Staff"} took a break at ${breakTime} · ${cashier?.counter || "Counter"}`,
        t: "warn", time: "just now", read: false,
        staffName: cashier?.name || "Staff", breakTime,
      });
    } catch (e) { console.warn("Sign-out error:", e); }
    setSigningOut(false);
    setConfirmSignOut(false);
    onSignOut(); // redirect to login screen
  };

  // Build live product list — always read localStorage images so the POS
  // never loses images due to Firestore snapshot race conditions
  const _storedImgs = (() => { try { return JSON.parse(localStorage.getItem("supermart_prod_imgs") || "{}"); } catch { return {}; } })();
  const POS_LIST = (products || []).map(p => ({
    id: p.id,
    n: p.name || p.n || "Unknown",
    price: Number(p.price) || 0,
    cat: p.cat || "General",
    stock: Number(p.stock) || 0,
    img: p.img || _storedImgs[String(p.id)] || "",  // localStorage fallback ensures image always shows
    e: p.e || "📦",
  }));
  const cats = ["All", ...new Set(POS_LIST.map(p => p.cat))];
  const list = POS_LIST.filter(p => (activecat === "All" || p.cat === activecat) && p.n.toLowerCase().includes(q.toLowerCase()));
  const add = (pr) => {
    if (pr.stock === 0) return;
    setCart(prev => {
      const ex = prev.find(i => i.id === pr.id);
      if (ex) {
        if (ex.qty >= pr.stock) { toast(`Only ${pr.stock} unit${pr.stock === 1 ? "" : "s"} available for ${pr.n}`, "warn"); return prev; }
        return prev.map(i => i.id === pr.id ? { ...i, qty: i.qty + 1 } : i);
      }
      // Auto-open cart on first item
      if (prev.length === 0) setCartOpen(true);
      return [...prev, { ...pr, qty: 1 }];
    });
    // Cart bounce animation on every add
    setCartBounce(true);
    setTimeout(() => setCartBounce(false), 400);
  };
  const upd = (id, d) => setCart(prev => prev.map(i => {
    if (i.id !== id) return i;
    const newQty = i.qty + d;
    if (newQty > i.stock) { toast(`Only ${i.stock} unit${i.stock === 1 ? "" : "s"} in stock for ${i.n}`, "warn"); return i; }
    return { ...i, qty: Math.max(0, newQty) };
  }).filter(i => i.qty > 0));
  const rem = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = sub * 0.05;
  const total = sub + tax;
  const change = parseFloat(cash || 0) - total;

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const completeSale = async (customer = null) => {
    // 1. Intercept Online payments using Razorpay
    if (pay === "online") {
      setSaving(true);
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        toast("Razorpay SDK failed to load. Check your internet connection.", "error");
        setSaving(false);
        return;
      }

      try {
        // Create order on backend Express server (hosted on Render)
        const orderRes = await fetch("https://supermart-backend-e0f0.onrender.com/api/payment/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: total,
            cashierName: cashier?.name || "Admin"
          }),
        });
        const orderData = await orderRes.json();

        if (!orderData.success) {
          toast("Failed to initialize payment order with backend.", "error");
          setSaving(false);
          return;
        }

        // Open Razorpay Checkout Widget
        const options = {
          key: orderData.key_id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "SuperMart Smart POS",
          description: "Register Checkout Bill - Mode: ONLINE PAYMENT",
          order_id: orderData.order_id,
          handler: async function (response) {
            try {
              // Verify Payment Signature on backend
              const verifyRes = await fetch("https://supermart-backend-e0f0.onrender.com/api/payment/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();

              if (verifyData.success) {
                toast("Payment authorized successfully!", "success");
                // Payment verified - execute core checkout commit
                await executeCheckoutCommit(customer);
              } else {
                toast("Payment verification failed! " + verifyData.error, "error");
                setSaving(false);
              }
            } catch (err) {
              console.error("Verification error:", err);
              toast("Verification request failed.", "error");
              setSaving(false);
            }
          },
          prefill: {
            name: customer?.name || "Walk-in Customer",
            email: "store@supermart.com",
            contact: customer?.phone || "9999999999",
          },
          theme: {
            color: "#C9A84C",
          },
          modal: {
            ondismiss: function () {
              toast("Payment cancelled by cashier.", "warn");
              setSaving(false);
            }
          }
        };

        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
      } catch (err) {
        console.error("Payment setup error:", err);
        toast("Failed to initialize payment process.", "error");
        setSaving(false);
      }
      return;
    }

    // Default cash checkout flow
    await executeCheckoutCommit(customer);
  };

  const executeCheckoutCommit = async (customer) => {
    setSaving(true);
    // 1. Save customer to Firestore if provided
    if (customer?.phone) {
      try {
        // Check if customer with this phone already exists
        const existing = (customers || []).find(c => c.phone === customer.phone);
        if (existing) {
          // Update visit count and last visit
          await sbUpdate("customers", existing.id, {
            name: customer.name || existing.name,
            visits: Number(existing.visits || 0) + 1,
            spend: (parseFloat(existing.spend || 0) + total).toFixed(2),
            lastVisit: new Date().toLocaleDateString("en-IN"),
          });
        } else {
          await sbInsert("customers", {
            name: customer.name || "Walk-in",
            phone: customer.phone,
            visits: 1,
            spend: total.toFixed(2),
            tier: "Silver",
            tag: "Regular",
            status: "active",
            lastVisit: new Date().toLocaleDateString("en-IN"),
          });
        }
      } catch (e) { console.warn("Customer save error:", e); }
    }

    // 2. Save transaction to DB
    await sbInsert("transactions", {
      items: JSON.stringify(cart.map(i => ({ id: i.id, name: i.n, price: i.price, qty: i.qty }))),
      subtotal: sub.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      payment_method: pay,
      cashier: cashier?.name || "Admin",
      bill_no: billNo,
      customer_name: customer?.name || "Walk-in",
      customer_phone: customer?.phone || "",
      createdAt: Date.now(),
    }).catch(() => {});

    // 2. Decrement stock for each sold product in DB + local state
    await Promise.all(cart.map(async item => {
      const current = products.find(p => p.id === item.id);
      if (!current) return;
      const newStock = Math.max(0, current.stock - item.qty);
      const newStatus = newStock === 0 ? "out" : newStock < 3 ? "critical" : newStock < 10 ? "low" : "active";
      await sbUpdate("products", item.id, { stock: newStock, status: newStatus });
    }));
    // Update local products state immediately
    setProducts(prev => prev.map(p => {
      const sold = cart.find(i => i.id === p.id);
      if (!sold) return p;
      const newStock = Math.max(0, p.stock - sold.qty);
      return { ...p, stock: newStock, status: newStock === 0 ? "out" : newStock < 3 ? "critical" : newStock < 10 ? "low" : "active" };
    }));

    setSaving(false);
    setDone(true);
  };

  const printReceipt = () => {
    const sName = storeSettings?.storeName || "Sales Analyzer";
    const sAddr = storeSettings?.address || "152, Big Street, Thanjavur";
    const sGst = storeSettings?.gstin || "33AABCU9603R1ZX";
    
    const receiptHTML = `
      <html><head><title>Receipt #${billNo}</title>
      <style>body{font-family:monospace;max-width:300px;margin:0 auto;padding:20px;font-size:13px}
      .header{text-align:center;margin-bottom:16px} .divider{border-top:1px dashed #000;margin:10px 0}
      .row{display:flex;justify-content:space-between} .total{font-size:16px;font-weight:bold}
      </style></head><body>
      <div class="header"><h2>${sName}</h2><p>${sAddr}</p><p>GSTIN: ${sGst}</p></div>
      <div class="divider"></div>
      <div class="row"><span>Bill #${billNo}</span><span>${new Date().toLocaleString()}</span></div>
      <div class="row"><span>Admin: ${cashier?.name||"Admin"}</span><span>${cashier?.counter||""}</span></div>
      ${custName || custPhone ? `<div class="row" style="margin-top:4px"><span>Customer: ${custName || "Walk-in"}</span><span>${custPhone || ""}</span></div>` : ""}
      <div class="divider"></div>
      ${cart.map(i => `<div class="row"><span>${i.n} × ${i.qty}</span><span>₹${(i.price * i.qty).toFixed(2)}</span></div>`).join("")}
      <div class="divider"></div>
      <div class="row"><span>Subtotal</span><span>₹${sub.toFixed(2)}</span></div>
      <div class="row"><span>GST (5%)</span><span>₹${tax.toFixed(2)}</span></div>
      <div class="divider"></div>
      <div class="row total"><span>TOTAL</span><span>₹${total.toFixed(2)}</span></div>
      <div class="row"><span>Payment</span><span>${pay.toUpperCase()}</span></div>
      ${pay === "cash" && change > 0 ? `<div class="row"><span>Change</span><span>₹${change.toFixed(2)}</span></div>` : ""}
      <div class="divider"></div>
      <div style="text-align:center;margin-top:12px"><p>Thank you for shopping!</p><p>Visit us again</p></div>
      </body></html>`;
    const w = window.open("", "_blank", "width=350,height=600");
    if (w) { w.document.write(receiptHTML); w.document.close(); w.print(); }
  };

  if (done) return (
    <>
      <PremiumEffects />
      <div style={{ height: "100vh", background: P.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, fontFamily: P.fontBody }}>
        {/* Ambient gold orbs */}
        <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(201,168,76,0.25)", animation: "glowPulse 2s ease-in-out infinite" }}>
          <CheckCircle2 size={42} color="#C9A84C" />
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: P.text, fontSize: 32, fontWeight: 300, fontFamily: P.fontDisplay, letterSpacing: "-0.01em", marginBottom: 6 }}>Transaction Complete</h2>
          <p style={{ color: P.muted, fontSize: 13, fontFamily: P.fontLabel, letterSpacing: "0.2em", textTransform: "uppercase" }}>Bill #{billNo} · ₹{total.toFixed(2)} · {pay.toUpperCase()}</p>
        </div>
        {pay === "cash" && change > 0 && (
          <div style={{ background: "rgba(26,22,16,0.85)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 14, padding: "20px 48px", textAlign: "center", backdropFilter: "blur(20px)" }}>
            <p style={{ color: P.muted, fontSize: 11, fontFamily: P.fontLabel, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8 }}>Return to customer</p>
            <p style={{ color: P.gold, fontSize: 44, fontWeight: 300, fontFamily: P.fontDisplay }}>₹{change.toFixed(2)}</p>
          </div>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => { setCart([]); setDone(false); setCash(""); setCustName(""); setCustPhone(""); }} className="pos-btn-gold" style={{ padding: "13px 32px", fontSize: "0.7rem" }}>New Bill</button>
          <button onClick={printReceipt} className="pos-btn-ghost" style={{ padding: "13px 28px", fontSize: "0.68rem", display: "flex", alignItems: "center", gap: 8 }}><Printer size={14} /> Print Receipt</button>
        </div>
      </div>
    </>
  );

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);

  return (<>
    <PremiumEffects />
    {/* ── Sliding Cart Keyframes injected via style tag ── */}
    <style>{`
      @keyframes cartSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
      @keyframes cartSlideOut {
        from { transform: translateX(0);    opacity: 1; }
        to   { transform: translateX(100%); opacity: 0; }
      }
      @keyframes cartBounce {
        0%,100% { transform: scale(1); }
        30% { transform: scale(1.35); }
        60% { transform: scale(0.9); }
      }
      @keyframes backdropIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes itemPop {
        0%   { transform: scale(0.85) translateY(8px); opacity: 0; }
        70%  { transform: scale(1.04) translateY(-2px); opacity: 1; }
        100% { transform: scale(1) translateY(0); opacity: 1; }
      }
    `}</style>
    <div style={{ height: "100vh", background: P.bg, display: "flex", overflow: "hidden", fontFamily: P.fontBody, position: "relative" }}>
      {/* Left: Product Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* ── Top Bar ── */}
        <div style={{ padding: "14px 20px", background: "rgba(10,9,6,0.95)", borderBottom: `1px solid ${P.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Gold logo mark */}
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #C9A84C, #E8C97A)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(201,168,76,0.3)" }}>
              <Zap size={18} color="#0A0906" />
            </div>
            <div>
              <div style={{ color: P.text, fontWeight: 600, fontSize: 15, fontFamily: P.fontDisplay, letterSpacing: "0.04em" }}>AURUM POS</div>
              <div style={{ color: P.muted, fontSize: 10, fontFamily: P.fontLabel, letterSpacing: "0.18em", textTransform: "uppercase" }}>{cashier?.counter||"Counter I"} · {cashier?.name||"Admin"} · #{billNo}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(26,22,16,0.8)", border: `1px solid ${P.border}`, borderRadius: 8, padding: "8px 12px", backdropFilter: "blur(10px)" }}>
              <Search size={13} color={P.muted} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ background: "none", border: "none", outline: "none", color: P.text, fontSize: 13, width: 130, fontFamily: P.fontBody }} />
              {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: P.muted, display: "flex" }}><X size={12} /></button>}
            </div>
            {(cashier?.role === "Admin" || cashier?.role === "Supervisor") && (
              <button onClick={onBack} className="pos-btn-ghost" style={{ padding: "8px 14px" }}>Admin →</button>
            )}
            {/* Cart Toggle Button */}
            <button
              onClick={() => setCartOpen(o => !o)}
              style={{ position: "relative", padding: "8px 14px", background: cartOpen ? "rgba(201,168,76,0.15)" : "rgba(26,22,16,0.8)", border: `1px solid ${cartOpen ? "rgba(201,168,76,0.5)" : P.border}`, borderRadius: 8, color: cartOpen ? P.gold : P.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontFamily: P.fontLabel, letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.25s", boxShadow: cartOpen ? "0 0 20px rgba(201,168,76,0.15)" : "none" }}
            >
              <ShoppingCart size={14} style={{ animation: cartBounce ? "cartBounce 0.4s cubic-bezier(0.16,1,0.3,1)" : "none" }} />
              Cart
              {totalQty > 0 && (
                <span style={{ position: "absolute", top: -7, right: -7, background: "linear-gradient(135deg,#C9A84C,#E8C97A)", color: "#0A0906", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", animation: cartBounce ? "cartBounce 0.4s cubic-bezier(0.16,1,0.3,1)" : "none", boxShadow: "0 2px 8px rgba(201,168,76,0.4)" }}>{totalQty}</span>
              )}
            </button>
            <button
              onClick={() => setConfirmSignOut(true)}
              style={{ padding: "8px 14px", background: "rgba(212,100,92,0.12)", border: "1px solid rgba(212,100,92,0.3)", borderRadius: 8, color: "#D4645C", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: P.fontLabel, letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(212,100,92,0.2)"; e.currentTarget.style.borderColor = "rgba(212,100,92,0.55)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(212,100,92,0.12)"; e.currentTarget.style.borderColor = "rgba(212,100,92,0.3)"; }}
            >
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </div>

        {/* ── Sign-Out Confirm Dialog ─── */}
        {confirmSignOut && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
            <div style={{ background: "rgba(26,22,16,0.95)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 18, padding: 36, maxWidth: 360, width: "90%", textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", animation: "scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(212,100,92,0.12)", border: "1px solid rgba(212,100,92,0.35)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <LogOut size={26} color="#D4645C" />
              </div>
              <h3 style={{ color: P.text, fontSize: 20, fontWeight: 300, fontFamily: P.fontDisplay, letterSpacing: "-0.01em", marginBottom: 10 }}>End Session?</h3>
              <p style={{ color: P.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 6, fontFamily: P.fontBody }}>
                <span style={{ color: P.text, fontWeight: 500 }}>{cashier?.name}</span> will be marked <span style={{ color: "#E8A84C" }}>On Break</span>.
              </p>
              <p style={{ color: P.dim, fontSize: 11, marginBottom: 28, fontFamily: P.fontLabel, letterSpacing: "0.08em" }}>ADMIN WILL BE NOTIFIED</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmSignOut(false)} className="pos-btn-ghost" style={{ flex: 1, padding: "12px 0" }}>Cancel</button>
                <button onClick={handleSignOut} disabled={signingOut} style={{ flex: 1, padding: "12px 0", background: "rgba(212,100,92,0.15)", border: "1px solid #D4645C", borderRadius: 8, color: "#D4645C", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: P.fontLabel, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {signingOut ? <><RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Signing out…</> : <><LogOut size={14} /> Confirm</>}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Banner Slider ─────────────────────────────────────────────── */}
        {posBanners.filter(b => b.active !== false).length > 0 && (
          <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
            <BannerSlider banners={posBanners} height={140} />
          </div>
        )}
        {/* ── Category Tabs ── */}
        <div style={{ display: "flex", background: "rgba(10,9,6,0.9)", borderBottom: `1px solid ${P.border}`, overflowX: "auto", flexShrink: 0, padding: "0 16px", backdropFilter: "blur(12px)" }}>
          {cats.map(c => (
            <button key={c} onClick={() => setActivecat(c)} style={{ padding: "11px 14px", background: "none", border: "none", cursor: "pointer", color: activecat === c ? P.gold : P.muted, fontFamily: P.fontLabel, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: activecat === c ? `1.5px solid ${P.gold}` : "1.5px solid transparent", transition: "all 0.25s", fontWeight: activecat === c ? 600 : 400 }}>{c}</button>
          ))}
        </div>
        {/* ── Product Grid ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(148px,1fr))", gap: 10, alignContent: "start", background: "rgba(10,9,6,0.6)", position: "relative" }}>
          {list.map(pr => {
            const inC = cart.find(i => i.id === pr.id);
            return <PosCard key={pr.id} pr={pr} inC={inC} onAdd={add} />;
          })}
        </div>

        {/* ── Floating View Cart Button (shows when cart is closed but has items) ── */}
        {totalQty > 0 && !cartOpen && (
          <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 200, animation: "slideUp 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
            <button
              onClick={() => setCartOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 28px", background: "linear-gradient(135deg, rgba(201,168,76,0.2), rgba(232,201,122,0.15))", border: "1px solid rgba(201,168,76,0.55)", borderRadius: 40, color: P.gold, fontFamily: P.fontLabel, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 8px 40px rgba(201,168,76,0.25), 0 0 0 1px rgba(201,168,76,0.1) inset", transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)", animation: "glowPulse 2.5s ease-in-out infinite" }}
              onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(201,168,76,0.32), rgba(232,201,122,0.25))"; e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 16px 48px rgba(201,168,76,0.4), 0 0 0 1px rgba(201,168,76,0.2) inset"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(201,168,76,0.2), rgba(232,201,122,0.15))"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 40px rgba(201,168,76,0.25), 0 0 0 1px rgba(201,168,76,0.1) inset"; }}
            >
              <ShoppingCart size={15} />
              View Cart
              <span style={{ background: "linear-gradient(135deg,#C9A84C,#E8C97A)", color: "#0A0906", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, minWidth: 22, textAlign: "center", letterSpacing: 0 }}>{totalQty}</span>
              <span style={{ color: P.goldLight, fontFamily: P.fontDisplay, fontSize: "0.9rem", fontWeight: 300, letterSpacing: 0 }}>₹{total.toLocaleString("en-IN")}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Sliding Cart Backdrop ── */}
      {cartOpen && (
        <div
          onClick={() => setCartOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", animation: "backdropIn 0.3s ease" }}
        />
      )}

      {/* ── Sliding Cart Panel (overlay) ── */}
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: 400,
        background: "rgba(12,10,7,0.97)",
        backdropFilter: "saturate(180%) blur(24px)",
        WebkitBackdropFilter: "saturate(180%) blur(24px)",
        borderLeft: `1px solid rgba(201,168,76,0.22)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 500,
        boxShadow: "-24px 0 80px rgba(0,0,0,0.7), -2px 0 0 rgba(201,168,76,0.08)",
        transform: cartOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.45s cubic-bezier(0.16,1,0.3,1)",
        willChange: "transform",
      }}>
        {/* Cart Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${P.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "rgba(10,8,5,0.8)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShoppingCart size={17} color={P.gold} />
            <span style={{ color: P.text, fontFamily: P.fontLabel, fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase" }}>Current Bill</span>
            {totalQty > 0 && <span style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", color: P.gold, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{totalQty}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {cart.length > 0 && <button onClick={() => setCart([])} style={{ color: P.muted, fontSize: 10, fontFamily: P.fontLabel, letterSpacing: "0.12em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.color = P.danger}
              onMouseLeave={e => e.currentTarget.style.color = P.muted}>Clear</button>}
            {/* Close button */}
            <button
              onClick={() => setCartOpen(false)}
              style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: P.muted, transition: "all 0.2s", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(212,100,92,0.15)"; e.currentTarget.style.borderColor = "rgba(212,100,92,0.4)"; e.currentTarget.style.color = "#D4645C"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.muted; }}
              title="Close cart"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {cart.length === 0 ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(201,168,76,0.06)", border: "1px dashed rgba(201,168,76,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShoppingCart size={30} color="rgba(201,168,76,0.3)" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: P.muted, fontSize: 13, fontFamily: P.fontLabel, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Cart is empty</p>
                <p style={{ color: P.dim, fontSize: 11, fontFamily: P.fontBody }}>Tap any product to add it</p>
              </div>
            </div>
          ) : cart.map((item, idx) => (
            <div key={item.id} style={{ background: "rgba(26,22,16,0.8)", border: `1px solid ${P.border}`, borderRadius: 10, padding: "11px 14px", display: "flex", gap: 10, alignItems: "center", animation: `itemPop 0.35s cubic-bezier(0.16,1,0.3,1) both`, transition: "all 0.2s", animationDelay: `${idx * 0.04}s` }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: "rgba(10,9,6,0.7)", border: "1px solid rgba(201,168,76,0.15)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                {item.img
                  ? <img src={item.img} alt={item.n} onError={ev => { ev.target.style.display = "none"; ev.target.nextSibling.style.display = "block"; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : null}
                <span style={{ fontSize: 18, display: item.img ? "none" : "block" }}>{item.e || "📦"}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: P.text, fontSize: 12, fontWeight: 500, fontFamily: P.fontBody, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.n}</p>
                <p style={{ color: P.muted, fontSize: 10, marginTop: 2, fontFamily: P.fontLabel, letterSpacing: "0.08em" }}>₹{item.price.toLocaleString("en-IN")} each</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <button onClick={() => upd(item.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: P.gold }}><Minus size={11} /></button>
                <span style={{ color: P.text, fontSize: 14, fontWeight: 700, fontFamily: P.mono, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                <button onClick={() => upd(item.id, 1)} style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#C9A84C,#E8C97A)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0A0906" }}><Plus size={11} /></button>
              </div>
              <span style={{ color: P.gold, fontSize: 13, fontWeight: 600, fontFamily: P.fontDisplay, minWidth: 60, textAlign: "right", letterSpacing: "0.01em" }}>₹{(item.price * item.qty).toLocaleString("en-IN")}</span>
              <button onClick={() => rem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: P.dim, display: "flex", flexShrink: 0, transition: "color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.color = P.danger}
                onMouseLeave={e => e.currentTarget.style.color = P.dim}><X size={13} /></button>
            </div>
          ))}
        </div>

        {/* Totals + Payment */}
        {cart.length > 0 && (
          <div style={{ borderTop: `1px solid ${P.border}`, padding: "16px 20px", flexShrink: 0 }}>
            {/* Subtotal / Tax */}
            {[{ l: "Subtotal", v: `₹${sub.toLocaleString("en-IN")}` }, { l: "GST (5%)", v: `₹${tax.toFixed(2)}` }].map(r => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: P.muted, fontSize: 11, fontFamily: P.fontLabel, letterSpacing: "0.08em", textTransform: "uppercase" }}>{r.l}</span>
                <span style={{ color: P.textSec, fontSize: 12, fontFamily: P.mono }}>{r.v}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${P.border}`, marginTop: 6 }}>
              <span style={{ color: P.text, fontSize: 13, fontFamily: P.fontLabel, letterSpacing: "0.15em", textTransform: "uppercase" }}>Total</span>
              <span style={{ color: P.gold, fontSize: 24, fontWeight: 300, fontFamily: P.fontDisplay, letterSpacing: "-0.01em" }}>₹{total.toLocaleString("en-IN")}</span>
            </div>

            {/* Payment Method Tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[{ id: "cash", icon: Banknote, l: "Cash" }, { id: "online", icon: CreditCard, l: "Online Payment" }].map(m => (
                <button key={m.id} onClick={() => { setPay(m.id); if (m.id === "online") setCash(""); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: pay === m.id ? "rgba(201,168,76,0.12)" : "transparent", border: `1px solid ${pay === m.id ? "rgba(201,168,76,0.5)" : P.border}`, color: pay === m.id ? P.gold : P.muted, transition: "all 0.2s", fontFamily: P.fontLabel, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.6rem", boxShadow: pay === m.id ? "0 0 16px rgba(201,168,76,0.15)" : "none" }}>
                  <m.icon size={16} /><span>{m.l}</span>
                </button>
              ))}
            </div>

            {/* Cash input */}
            {pay === "cash" && (
              <div style={{ marginBottom: 12 }}>
                <input type="number" placeholder="Cash received (₹)" value={cash} onChange={e => setCash(e.target.value)} style={{ width: "100%", padding: 12, background: "rgba(26,22,16,0.8)", border: `1px solid ${P.border}`, borderRadius: 8, color: P.text, fontSize: 20, fontWeight: 300, fontFamily: P.fontDisplay, outline: "none", textAlign: "center", transition: "border-color 0.2s" }}
                  onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
                  onBlur={e => e.target.style.borderColor = P.border}
                />
                {cash && parseFloat(cash) >= total && (
                  <div style={{ marginTop: 8, background: "rgba(76,175,122,0.1)", border: "1px solid rgba(76,175,122,0.3)", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: P.muted, fontSize: 10, fontFamily: P.fontLabel, letterSpacing: "0.1em", textTransform: "uppercase" }}>Return to customer</span>
                    <span style={{ color: P.success, fontSize: 18, fontWeight: 300, fontFamily: P.fontDisplay }}>₹{change.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Online payment panel */}
            {pay === "online" && (
              <div style={{ marginBottom: 12, background: "rgba(26,22,16,0.8)", border: `1px solid ${P.border}`, borderRadius: 10, padding: 16, textAlign: "center" }}>
                <div style={{ width: 80, height: 80, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: "50%", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CreditCard size={32} color={P.gold} />
                </div>
                <p style={{ color: P.text, fontSize: 13, fontFamily: P.fontLabel, letterSpacing: "0.05em", marginBottom: 6 }}>Razorpay Integration</p>
                <p style={{ color: P.muted, fontSize: 11, fontFamily: P.fontBody, lineHeight: 1.5 }}>Secure checkout popup will initialize on confirmation.</p>
              </div>
            )}

            {/* Charge Button */}
            <button
              onClick={() => { setCustName(""); setCustPhone(""); setCustModal(true); }}
              disabled={saving || (pay === "cash" && parseFloat(cash || 0) < total)}
              className="pos-btn-gold"
              style={{ width: "100%", padding: 14, fontSize: "0.72rem", letterSpacing: "0.22em", opacity: (pay === "cash" && parseFloat(cash || 0) < total) || saving ? 0.45 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {saving ? <><RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Processing…</> : pay === "cash" ? `Collect  ₹${total.toFixed(2)}` : `Confirm  ·  ₹${total.toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>

    {/* ── Customer Details Modal ── */}
    {custModal && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(10px)" }}>
        <div style={{ background: "rgba(20,17,11,0.97)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 20, padding: 32, width: "100%", maxWidth: 420, boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 80px rgba(201,168,76,0.06)", animation: "scaleIn 0.28s cubic-bezier(0.16,1,0.3,1)" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={22} color={P.gold} />
            </div>
            <div>
              <p style={{ color: P.text, fontWeight: 300, fontSize: 18, fontFamily: P.fontDisplay, letterSpacing: "-0.01em", margin: 0 }}>Client Details</p>
              <p style={{ color: P.muted, fontSize: 10, margin: 0, fontFamily: P.fontLabel, letterSpacing: "0.15em", textTransform: "uppercase" }}>Saved to database in real-time</p>
            </div>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: P.muted, fontSize: 10, display: "block", marginBottom: 7, fontFamily: P.fontLabel, letterSpacing: "0.18em", textTransform: "uppercase" }}>Phone Number *</label>
            <input
              type="tel"
              value={custPhone}
              onChange={e => setCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile number"
              autoFocus
              style={{ width: "100%", padding: "12px 14px", background: "rgba(26,22,16,0.8)", border: `1px solid ${custPhone.length === 10 ? "rgba(201,168,76,0.6)" : P.border}`, borderRadius: 10, color: P.text, fontSize: 18, fontWeight: 300, fontFamily: P.fontDisplay, outline: "none", letterSpacing: "0.12em", boxSizing: "border-box", transition: "border-color 0.3s", boxShadow: custPhone.length === 10 ? "0 0 20px rgba(201,168,76,0.12)" : "none" }}
            />
          </div>

          {/* Name */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: P.muted, fontSize: 10, display: "block", marginBottom: 7, fontFamily: P.fontLabel, letterSpacing: "0.18em", textTransform: "uppercase" }}>Name <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input
              type="text"
              value={custName}
              onChange={e => setCustName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              onKeyDown={e => { if (e.key === "Enter" && custPhone.length === 10) { setCustModal(false); completeSale({ name: custName || "Customer", phone: custPhone }); }}}
              style={{ width: "100%", padding: "12px 14px", background: "rgba(26,22,16,0.8)", border: `1px solid ${P.border}`, borderRadius: 10, color: P.text, fontSize: 14, fontFamily: P.fontBody, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
              onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.4)"}
              onBlur={e => e.target.style.borderColor = P.border}
            />
          </div>

          {/* Bill summary */}
          <div style={{ background: "rgba(201,168,76,0.06)", border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: P.muted, fontSize: 11, fontFamily: P.fontLabel, letterSpacing: "0.1em" }}>{cart.length} item{cart.length !== 1 ? "s" : ""} · {pay.toUpperCase()}</span>
            <span style={{ color: P.gold, fontWeight: 300, fontSize: 20, fontFamily: P.fontDisplay }}>₹{total.toFixed(2)}</span>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => { setCustModal(false); completeSale(null); }}
              className="pos-btn-ghost"
              style={{ flex: 1, padding: "12px 0" }}
            >Skip (Walk-in)</button>
            <button
              onClick={() => {
                if (custPhone.length < 10) return;
                setCustModal(false);
                completeSale({ name: custName || "Customer", phone: custPhone });
              }}
              disabled={custPhone.length < 10}
              className="pos-btn-gold"
              style={{ flex: 2, padding: "12px 0", opacity: custPhone.length < 10 ? 0.45 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Users size={14} /> Confirm & Bill
            </button>
          </div>
          <p style={{ color: P.dim, fontSize: 10, textAlign: "center", marginTop: 12, lineHeight: 1.5, fontFamily: P.fontLabel, letterSpacing: "0.1em" }}>PHONE TRACKS LOYALTY POINTS & PURCHASE HISTORY</p>
        </div>
      </div>
    )}
  </>);
};

const PremiumEffects = () => {
  const canvasRef = useRef(null);
  const cursorRef = useRef(null);

  useEffect(() => {
    // Custom cursor and trail logic
    const cursor = cursorRef.current;
    const trailCount = 8;
    const trails = [];
    
    for (let i = 0; i < trailCount; i++) {
      const dot = document.createElement("div");
      dot.className = "trail-dot";
      dot.style.background = A.accent || "#6C63FF";
      document.body.appendChild(dot);
      trails.push({ el: dot, x: 0, y: 0 });
    }
    
    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    
    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (cursor) {
        cursor.style.left = e.clientX + "px";
        cursor.style.top = e.clientY + "px";
        cursor.style.opacity = "1";
      }
    };
    document.addEventListener("mousemove", onMouseMove);

    // Custom cursor trail update loop
    let trailAnimId;
    function updateTrails() {
      let x = mouse.x;
      let y = mouse.y;
      trails.forEach((t, i) => {
        const dx = (x - t.x) * 0.35;
        const dy = (y - t.y) * 0.35;
        t.x += dx;
        t.y += dy;
        t.el.style.left = t.x + "px";
        t.el.style.top = t.y + "px";
        t.el.style.opacity = cursor ? cursor.style.opacity : "0.5";
        x = t.x;
        y = t.y;
      });
      trailAnimId = requestAnimationFrame(updateTrails);
    }
    updateTrails();

    // Hover effect bindings
    const bindHover = () => {
      const hoverables = document.querySelectorAll("a, button, input, .card, select, .pin-key, .cashier-card, .neo-btn, [role='button']");
      hoverables.forEach((el) => {
        el.addEventListener("mouseenter", () => cursor && cursor.classList.add("big"));
        el.addEventListener("mouseleave", () => cursor && cursor.classList.remove("big"));
      });
    };
    bindHover();
    
    // Observe dynamic DOM changes to bind hover to new elements
    const observer = new MutationObserver(bindHover);
    observer.observe(document.body, { childList: true, subtree: true });

    // Global click listener for click ripples & symbols
    const syms = ["₹", "✦", "⚡", "★", "◈"];
    const handleGlobalClick = (e) => {
      // 1. Create expanding ripple feedback centered at click coordinates
      const ripple = document.createElement("span");
      ripple.className = "click-ripple";
      const clickX = e.clientX;
      const clickY = e.clientY;
      ripple.style.cssText = `
        position:fixed;
        left:${clickX}px;
        top:${clickY}px;
        width:12px;
        height:12px;
        border:2px solid rgba(201,168,76,0.7);
        background:rgba(201,168,76,0.12);
        border-radius:50%;
        pointer-events:none;
        z-index:9999;
        transform:translate(-50%,-50%);
        animation:rippleExpand .6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
      `;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);

      // 2. Click particle symbols flying outwards if clicked an interactive target
      const target = e.target;
      const interactive = target.closest("a, button, input, select, textarea, [role='button'], .pin-key, .cashier-card, .btn, .neo-btn");
      if (interactive) {
        const rect = interactive.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 15; i++) {
          const p = document.createElement("span");
          p.textContent = syms[Math.floor(Math.random() * syms.length)];
          const angle = Math.random() * Math.PI * 2;
          const dist = 60 + Math.random() * 80;
          p.style.cssText = `
            position:fixed;
            left:${centerX}px;
            top:${centerY}px;
            font-size:${0.6 + Math.random() * 0.8}rem;
            color:${Math.random() > 0.5 ? "#C9A84C" : "#E8C97A"};
            pointer-events:none;
            z-index:9999;
            animation:particleFly .8s ease-out forwards;
            --px:${Math.cos(angle) * dist}px;
            --py:${Math.sin(angle) * dist}px;
          `;
          document.body.appendChild(p);
          setTimeout(() => p.remove(), 900);
        }
      }
    };
    window.addEventListener("click", handleGlobalClick);

    // Particle canvas background logic
    let canvasAnimId;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      let W, H;
      let particles = [];
      const resize = () => {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
      };
      resize();
      window.addEventListener("resize", resize);

      const COLORS = [
        "rgba(108,99,255,",
        "rgba(0,212,170,",
        "rgba(255,77,109,",
        "rgba(255,181,71,",
      ];
      function rand(a, b) {
        return a + Math.random() * (b - a);
      }

      class Particle {
        constructor() {
          this.reset(true);
        }
        reset(init) {
          this.x = rand(0, W);
          this.y = init ? rand(0, H) : H + 10;
          this.r = rand(0.5, 2.2);
          this.vx = rand(-0.3, 0.3);
          this.vy = rand(-0.6, -0.2);
          this.alpha = rand(0.1, 0.6);
          this.col = COLORS[Math.floor(Math.random() * COLORS.length)];
          this.life = 0;
          this.maxLife = rand(200, 500);
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
          this.life++;
          const t = this.life / this.maxLife;
          this.alpha = (t < 0.1 ? t * 6 : t > 0.8 ? (1 - t) * 5 : 1) * rand(0.15, 0.55);
          if (this.life > this.maxLife || this.y < -10) this.reset(false);
        }
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
          ctx.fillStyle = this.col + this.alpha + ")";
          ctx.fill();
        }
      }

      const orbs = [
        { x: 0.15, y: 0.25, r: 320, col: "rgba(201,168,76,", base: 0.05, dx: 0.0003, dy: 0.0002 },
        { x: 0.85, y: 0.7,  r: 260, col: "rgba(122,97,48,",  base: 0.04, dx: -0.0002, dy: 0.0003 },
        { x: 0.5,  y: 0.5,  r: 180, col: "rgba(201,168,76,", base: 0.025, dx: 0.0004, dy: -0.0002 }
      ];
      let t2 = 0;

      for (let i = 0; i < 80; i++) particles.push(new Particle());

      function draw() {
        ctx.clearRect(0, 0, W, H);
        t2 += 0.01;

        orbs.forEach((o) => {
          const cx = (o.x + Math.sin(t2 * o.dx * 100) * 0.05) * W;
          const cy = (o.y + Math.cos(t2 * o.dy * 100) * 0.05) * H;
          const r = o.r + Math.sin(t2 * 0.7) * 20;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, o.col + o.base * 1.5 + ")");
          g.addColorStop(1, o.col + "0)");
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        });

        particles.forEach((p) => {
          p.update();
          p.draw();
        });

        for (let i = 0; i < particles.length; i += 3) {
          for (let j = i + 3; j < particles.length; j += 3) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 90) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(108,99,255,${(1 - dist / 90) * 0.08})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
        canvasAnimId = requestAnimationFrame(draw);
      }
      draw();
    }

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", handleGlobalClick);
      cancelAnimationFrame(trailAnimId);
      if (canvasAnimId) cancelAnimationFrame(canvasAnimId);
      observer.disconnect();
      trails.forEach(t => t.el.remove());
    };
  }, []);

  return (
    <>
      <style>{`
        #particle-canvas{position:fixed;inset:0;z-index:0;pointer-events:none}
        #cursor{position:fixed;width:20px;height:20px;border:2px solid ${A.accent || "#6C63FF"};border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);z-index:9999;transition:width .2s,height .2s,background .2s;opacity:0}
        #cursor.big{width:40px;height:40px;background:${(A.accent || "#6C63FF")}1a;border-color:${A.cyan || "#00D4AA"}}
        .trail-dot{position:fixed;width:4px;height:4px;border-radius:50%;pointer-events:none;z-index:9998;opacity:.5;transition:opacity .5s}
        .click-ripple{position:fixed;left:0;top:0;width:12px;height:12px;border:2px solid ${A.cyan || "#00D4AA"};background:${(A.cyan || "#00D4AA")}26;border-radius:50%;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);animation:rippleExpand .6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards}
        @keyframes rippleExpand{0%{transform:translate(-50%,-50%) scale(1);border-color:${A.cyan || "#00D4AA"};background:${(A.cyan || "#00D4AA")}26;opacity:1}100%{transform:translate(-50%,-50%) scale(8);border-color:${A.accent || "#6C63FF"};background:transparent;opacity:0}}
        @keyframes particleFly{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--px),var(--py))}}
      `}</style>
      <canvas id="particle-canvas" ref={canvasRef}></canvas>
      <div id="cursor" ref={cursorRef}></div>
    </>
  );
};

const LoginPage = ({ type, onAdminLogin, onStaffLogin, onCustomerLogin, onBackToLanding, onToggleType, staff, customers = [] }) => {
  const canvasRef = useRef(null);
  const cursorRef = useRef(null);
  const [email, setEmail] = useState("admin@supermart.in");
  const [password, setPassword] = useState("");
  const [adminErr, setAdminErr] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [showAdminPw, setShowAdminPw] = useState(false);
  const cashiers = staff.filter(s => s.role !== "Admin");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [staffErr, setStaffErr] = useState("");
  
  // Customer Login States
  const [custPhone, setCustPhone] = useState("");
  const [custErr, setCustErr] = useState("");
  const [custLoading, setCustLoading] = useState(false);

  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          setCustLoading(true);
          const user = result.user;
          const cleanUserPhone = (user.phoneNumber || "").replace(/[^0-9]/g, "");
          const userEmail = (user.email || "").toLowerCase();

          // Search for registered customer match
          const match = customers.find(c => {
            const cleanDb = (c.phone || "").replace(/[^0-9]/g, "");
            return (cleanUserPhone && (cleanDb === cleanUserPhone || cleanDb.endsWith(cleanUserPhone) || cleanUserPhone.endsWith(cleanDb))) ||
                   (c.email && c.email.toLowerCase() === userEmail);
          });

          if (match) {
            onCustomerLogin(match);
          } else {
            // Automatically register new loyalty member
            const newCust = {
              name: user.displayName || "Google Client",
              phone: user.phoneNumber || "Google Verified",
              email: user.email || "",
              visits: 1,
              spend: "0.00",
              tier: "Silver",
              tag: "Regular",
              status: "active",
              lastVisit: new Date().toLocaleDateString("en-IN"),
            };
            const insertRes = await sbInsert("customers", newCust);
            onCustomerLogin(insertRes[0]);
          }
        }
      } catch (err) {
        console.error("Redirect sign-in error:", err);
        let errMsg = "Redirect sign-in failed. Please try again.";
        if (err.code === "auth/unauthorized-domain") {
          errMsg = `This testing domain (${window.location.hostname || "localhost"}) is not authorized. Please add it to Firebase Console -> Authentication -> Settings -> Authorized Domains.`;
        } else if (err.code) {
          errMsg = `Redirect Auth Error: ${err.message} (${err.code})`;
        }
        setCustErr(errMsg);
      } finally {
        setCustLoading(false);
      }
    };
    handleRedirectResult();
  }, [customers]);

  useEffect(() => {
    // Custom cursor and trail logic
    const cursor = cursorRef.current;
    const trailCount = 8;
    const trails = [];
    for (let i = 0; i < trailCount; i++) {
      const dot = document.createElement("div");
      dot.className = "trail-dot";
      document.body.appendChild(dot);
      trails.push({ el: dot, x: 0, y: 0 });
    }
    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (cursor) {
        cursor.style.left = e.clientX + "px";
        cursor.style.top = e.clientY + "px";
        cursor.style.opacity = "1";
      }
    };
    document.addEventListener("mousemove", onMouseMove);

    // Custom cursor trail update loop
    let trailAnimId;
    function updateTrails() {
      let x = mouse.x;
      let y = mouse.y;
      trails.forEach((t, i) => {
        const dx = (x - t.x) * 0.35;
        const dy = (y - t.y) * 0.35;
        t.x += dx;
        t.y += dy;
        t.el.style.left = t.x + "px";
        t.el.style.top = t.y + "px";
        t.el.style.opacity = cursor ? cursor.style.opacity : "0.5";
        x = t.x;
        y = t.y;
      });
      trailAnimId = requestAnimationFrame(updateTrails);
    }
    updateTrails();

    // Hover effect bindings
    const bindHover = () => {
      const hoverables = document.querySelectorAll("a, button, input, .card, select");
      hoverables.forEach((el) => {
        el.addEventListener("mouseenter", () => cursor && cursor.classList.add("big"));
        el.addEventListener("mouseleave", () => cursor && cursor.classList.remove("big"));
      });
    };
    bindHover();
    // Observe dynamic DOM changes (e.g. switching panels) to bind hover to new elements
    const observer = new MutationObserver(bindHover);
    observer.observe(document.body, { childList: true, subtree: true });

    // Particle canvas background logic
    let canvasAnimId;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      let W, H;
      let particles = [];
      const resize = () => {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
      };
      resize();
      window.addEventListener("resize", resize);

      const COLORS = [
        "rgba(108,99,255,",
        "rgba(0,212,170,",
        "rgba(255,77,109,",
        "rgba(255,181,71,",
      ];
      function rand(a, b) {
        return a + Math.random() * (b - a);
      }

      class Particle {
        constructor() {
          this.reset(true);
        }
        reset(init) {
          this.x = rand(0, W);
          this.y = init ? rand(0, H) : H + 10;
          this.r = rand(0.5, 2.2);
          this.vx = rand(-0.3, 0.3);
          this.vy = rand(-0.6, -0.2);
          this.alpha = rand(0.1, 0.6);
          this.col = COLORS[Math.floor(Math.random() * COLORS.length)];
          this.life = 0;
          this.maxLife = rand(200, 500);
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
          this.life++;
          const t = this.life / this.maxLife;
          this.alpha = (t < 0.1 ? t * 6 : t > 0.8 ? (1 - t) * 5 : 1) * rand(0.15, 0.55);
          if (this.life > this.maxLife || this.y < -10) this.reset(false);
        }
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
          ctx.fillStyle = this.col + this.alpha + ")";
          ctx.fill();
        }
      }

      const orbs = [
        { x: 0.15, y: 0.25, r: 300, col: "rgba(108,99,255,", base: 0.06, dx: 0.0003, dy: 0.0002 },
        { x: 0.85, y: 0.7, r: 250, col: "rgba(0,212,170,", base: 0.05, dx: -0.0002, dy: 0.0003 },
        { x: 0.5, y: 0.5, r: 180, col: "rgba(108,99,255,", base: 0.03, dx: 0.0004, dy: -0.0002 }
      ];
      let t2 = 0;

      for (let i = 0; i < 80; i++) particles.push(new Particle());

      function draw() {
        ctx.clearRect(0, 0, W, H);
        t2 += 0.01;

        orbs.forEach((o) => {
          const cx = (o.x + Math.sin(t2 * o.dx * 100) * 0.05) * W;
          const cy = (o.y + Math.cos(t2 * o.dy * 100) * 0.05) * H;
          const r = o.r + Math.sin(t2 * 0.7) * 20;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, o.col + o.base * 1.5 + ")");
          g.addColorStop(1, o.col + "0)");
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        });

        particles.forEach((p) => {
          p.update();
          p.draw();
        });

        for (let i = 0; i < particles.length; i += 3) {
          for (let j = i + 3; j < particles.length; j += 3) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 90) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(108,99,255,${(1 - dist / 90) * 0.08})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
        canvasAnimId = requestAnimationFrame(draw);
      }
      draw();
    }

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(trailAnimId);
      if (canvasAnimId) cancelAnimationFrame(canvasAnimId);
      observer.disconnect();
      trails.forEach(t => t.el.remove());
    };
  }, []);

  const triggerParticles = (e, callback, immediate = false) => {
    const btn = e.currentTarget;
    const syms = ["₹", "✦", "⚡", "★", "◈"];
    const rect = btn.getBoundingClientRect();

    // Create expanding ripple feedback centered at click coordinates
    const ripple = document.createElement("span");
    ripple.className = "click-ripple";
    const clickX = e.clientX || (rect.left + rect.width / 2);
    const clickY = e.clientY || (rect.top + rect.height / 2);
    ripple.style.cssText = `
      position:fixed;
      left:${clickX}px;
      top:${clickY}px;
      width:12px;
      height:12px;
      border:2px solid #00D4AA;
      background:rgba(0, 212, 170, 0.15);
      border-radius:50%;
      pointer-events:none;
      z-index:9999;
      transform:translate(-50%,-50%);
      animation:rippleExpand .6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
    `;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);

    for (let i = 0; i < 15; i++) {
      const p = document.createElement("span");
      p.textContent = syms[Math.floor(Math.random() * syms.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 80;
      p.style.cssText = `
        position:fixed;left:${rect.left + rect.width / 2}px;top:${
        rect.top + rect.height / 2
      }px;
        font-size:${0.6 + Math.random() * 0.8}rem;color:${
        Math.random() > 0.5 ? "#6C63FF" : "#00D4AA"
      };
        pointer-events:none;z-index:9999;
        animation:particleFly .8s ease-out forwards;
        --px:${Math.cos(angle) * dist}px;--py:${Math.sin(angle) * dist}px;
      `;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
    if (callback) {
      if (immediate) callback();
      else setTimeout(callback, 300);
    }
  };

  const handleAdminLogin = async () => {
    setAdminErr(""); setAdminLoading(true);
    await new Promise(r => setTimeout(r, 500));
    if (email === "admin@supermart.in" && password === "Rakhib@123") onAdminLogin();
    else setAdminErr("Invalid email or password.");
    setAdminLoading(false);
  };
  const addDigit = d => { if (pin.length < 4) setPin(p => p + d); };
  const delDigit = () => setPin(p => p.slice(0, -1));
  const tryStaffLogin = () => {
    if (pin.length !== 4) return;
    if (pin === selected.pin) onStaffLogin(selected);
    else { setStaffErr("Incorrect PIN. Try again."); setPin(""); }
  };
  // Customer Phone Login States
  const [phoneStep, setPhoneStep] = useState(1); // 1: Enter Phone, 2: Enter OTP
  const [otpCode, setOtpCode] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState(""); // The OTP shown to user
  const [otpDigits, setOtpDigits] = useState(["","","","","",""]); // Individual OTP boxes
  const otpInputRefs = [useRef(null),useRef(null),useRef(null),useRef(null),useRef(null),useRef(null)];

  const handleGoogleSignIn = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setCustErr("");
    setCustLoading(true);
    
    // Trigger button particle effects immediately
    if (e) {
      try {
        triggerParticles(e, null);
      } catch (pErr) {
        console.error("Particle error:", pErr);
      }
    }

    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const cleanUserPhone = (user.phoneNumber || "").replace(/[^0-9]/g, "");
      const userEmail = (user.email || "").toLowerCase();

      // Search for registered customer match
      const match = customers.find(c => {
        const cleanDb = (c.phone || "").replace(/[^0-9]/g, "");
        return (cleanUserPhone && (cleanDb === cleanUserPhone || cleanDb.endsWith(cleanUserPhone) || cleanUserPhone.endsWith(cleanDb))) ||
               (c.email && c.email.toLowerCase() === userEmail);
      });

      if (match) {
        onCustomerLogin(match);
      } else {
        // Automatically register new loyalty member
        const newCust = {
          name: user.displayName || "Google Client",
          phone: user.phoneNumber || "Google Verified",
          email: user.email || "",
          visits: 1,
          spend: "0.00",
          tier: "Silver",
          tag: "Regular",
          status: "active",
          lastVisit: new Date().toLocaleDateString("en-IN"),
        };
        const insertRes = await sbInsert("customers", newCust);
        onCustomerLogin(insertRes[0]);
      }
    } catch (err) {
      console.error("Google login error details:", err);
      if (err.code === "auth/popup-blocked") {
        setCustErr("⚠️ Google login popup was blocked! Look at the top right of your browser's address bar, click the 'Popup Blocked' icon, select 'Always allow popups from this site', and click the Google button again to log in.");
      } else {
        let errMsg = "Google sign-in failed. Please try again.";
        if (err.code === "auth/unauthorized-domain") {
          errMsg = `This testing domain (${window.location.hostname || "localhost"}) is not authorized. Please add it to Firebase Console -> Authentication -> Settings -> Authorized Domains.`;
        } else if (err.code === "auth/operation-not-allowed") {
          errMsg = "Google Sign-In is not enabled. Please enable it in your Firebase Console -> Authentication -> Sign-in method.";
        } else if (err.code === "auth/popup-closed-by-user") {
          errMsg = "Sign-in popup was closed before completing auth.";
        } else if (err.code) {
          errMsg = `Google Auth Error: ${err.message} (${err.code})`;
        } else if (err.message) {
          errMsg = `Google Auth Error: ${err.message}`;
        }
        setCustErr(errMsg);
      }
    } finally {
      setCustLoading(false);
    }
  };

  const handlePhoneSendOtp = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setCustErr("");
    if (!custPhone) { setCustErr("Please enter your phone number."); return; }
    
    const cleanInput = custPhone.replace(/[^0-9]/g, "");
    if (cleanInput.length < 10) { setCustErr("Please enter a valid 10-digit phone number."); return; }

    setCustLoading(true);
    
    // Simulate SMS delay for UX
    await new Promise(r => setTimeout(r, 800));
    
    // Check if phone exists in customer database
    const match = customers.find(c => {
      const cleanDb = (c.phone || "").replace(/[^0-9]/g, "");
      return cleanDb.endsWith(cleanInput) || cleanInput.endsWith(cleanDb) || cleanDb === cleanInput;
    });

    // Generate a 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedOtp(otp);
    setOtpDigits(["","","","","",""]);
    setPhoneStep(2);
    setCustLoading(false);
    
    // Auto-focus first OTP box
    setTimeout(() => otpInputRefs[0]?.current?.focus(), 100);
  };

  const handleOtpDigitChange = (index, value) => {
    const digit = value.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    // Auto-advance to next box
    if (digit && index < 5) {
      otpInputRefs[index + 1]?.current?.focus();
    }
    // Auto-submit when all 6 filled
    if (digit && index === 5) {
      const fullCode = newDigits.join("");
      if (fullCode.length === 6) handlePhoneVerifyOtp(null, fullCode);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs[index - 1]?.current?.focus();
    }
  };

  const handlePhoneVerifyOtp = async (e, codeOverride) => {
    if (e && e.preventDefault) e.preventDefault();
    setCustErr("");
    const enteredCode = codeOverride || otpDigits.join("");
    if (enteredCode.length !== 6) { setCustErr("Please enter all 6 digits of your access code."); return; }
    setCustLoading(true);
    
    await new Promise(r => setTimeout(r, 600));

    try {
      // Verify OTP matches
      if (enteredCode !== generatedOtp) {
        setCustErr("Incorrect access code. Please check and try again.");
        // Shake effect — clear and re-focus
        setOtpDigits(["","","","","",""]);
        setTimeout(() => otpInputRefs[0]?.current?.focus(), 100);
        setCustLoading(false);
        return;
      }

      // OTP correct — find matching customer
      const cleanInput = custPhone.replace(/[^0-9]/g, "");
      const match = customers.find(c => {
        const cleanDb = (c.phone || "").replace(/[^0-9]/g, "");
        return cleanDb.endsWith(cleanInput) || cleanInput.endsWith(cleanDb) || cleanDb === cleanInput;
      });

      if (match) {
        onCustomerLogin(match);
      } else {
        // New customer — auto-register as loyalty member
        const newCust = {
          name: "SuperMart Guest",
          phone: custPhone.startsWith("+") ? custPhone : "+91" + cleanInput,
          email: "",
          visits: 1,
          spend: "0.00",
          tier: "Silver",
          tag: "Regular",
          status: "active",
          lastVisit: new Date().toLocaleDateString("en-IN"),
        };
        const insertRes = await sbInsert("customers", newCust);
        onCustomerLogin(insertRes[0]);
      }
    } catch (err) {
      console.error("OTP verify error:", err);
      setCustErr("Verification failed. Please try again.");
    } finally {
      setCustLoading(false);
    }
  };

  const colors = {
    accent: "#6C63FF",
    success: "#00D4AA",
    danger: "#FF4D6D",
    text: "#FFFFFF",
    muted: "#8F8FA3",
    border: "rgba(255,255,255,0.08)",
    surf: "rgba(17,19,34,0.72)",
    bg: "#07070F",
  };

  const card = {
    background: colors.surf, border: `1px solid ${colors.border}`, borderRadius: 20,
    padding: 32, width: "100%", boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: 20,
    boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
    backdropFilter: "blur(12px)",
    position: "relative", zIndex: 10
  };
  const lbl = { 
    color: colors.muted, 
    fontSize: 11, 
    display: "block", 
    marginBottom: 6, 
    letterSpacing: "0.06em", 
    textTransform: "uppercase", 
    fontWeight: 600, 
    fontFamily: "'Inter', sans-serif" 
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: 24, gap: 24, position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=Tenor+Sans&family=Montserrat:wght@200;300;400;500;600&family=Syne:wght@400;600;700;800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`
        #particle-canvas{position:fixed;inset:0;z-index:0;pointer-events:none}
        #cursor{position:fixed;width:20px;height:20px;border:2px solid #6C63FF;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);z-index:9999;transition:width .2s,height .2s,background .2s;opacity:0}
        #cursor.big{width:40px;height:40px;background:rgba(108,99,255,0.1);border-color:#00D4AA}
        .trail-dot{position:fixed;width:4px;height:4px;background:#6C63FF;border-radius:50%;pointer-events:none;z-index:9998;opacity:.5;transition:opacity .5s}
        .click-ripple{position:fixed;left:0;top:0;width:12px;height:12px;border:2px solid #00D4AA;background:rgba(0,212,170,0.15);border-radius:50%;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);animation:rippleExpand .6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards}
        @keyframes rippleExpand{0%{transform:translate(-50%,-50%) scale(1);border-color:#00D4AA;background:rgba(0, 212, 170, 0.15);opacity:1}100%{transform:translate(-50%,-50%) scale(8);border-color:#6C63FF;background:transparent;opacity:0}}
        @keyframes particleFly{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--px),var(--py))}}

        /* Premium Forms and Typography theme */
        .login-input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(7,7,17,0.6);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: #fff;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: all 0.25s;
        }
        .login-input:focus {
          border-color: #6C63FF;
          box-shadow: 0 0 12px rgba(108,99,255,0.25);
        }
        
        .login-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          padding: 13px 20px;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 700;
          font-family: 'Syne', sans-serif;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
          background: #000;
          border: 1px solid rgba(255,255,255,0.15);
          color: #fff;
          width: 100%;
          box-shadow: 0 0 0 0 rgba(108,99,255,0);
        }
        .login-btn::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: 10px;
          padding: 1px;
          background: linear-gradient(to right, #6C63FF, #00D4AA);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0.45;
          transition: opacity 0.3s;
        }
        .login-btn:hover::before {
          opacity: 1;
        }
        .login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(108,99,255,0.25);
        }
        .login-btn:active {
          transform: translateY(0);
        }

        .login-btn-disabled {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          padding: 13px 20px;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 700;
          font-family: 'Syne', sans-serif;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          color: #555566;
          width: 100%;
          cursor: not-allowed;
          transition: all 0.2s;
        }

        .cashier-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          background: rgba(7,7,17,0.4);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
        }
        .cashier-card:hover {
          transform: translateY(-2px);
          border-color: #6C63FF;
          background: rgba(108,99,255,0.05);
          box-shadow: 0 6px 18px rgba(108,99,255,0.15);
        }

        .change-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 6px 12px;
          color: #8F8FA3;
          font-family: 'Syne', sans-serif;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .change-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: #6C63FF;
          color: #fff;
        }

        .pin-key {
          padding: 16px 0;
          background: rgba(7,7,17,0.3);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          color: #fff;
          font-size: 20px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          cursor: pointer;
          transition: all 0.2s;
        }
        .pin-key:hover {
          background: rgba(255,255,255,0.06);
          border-color: #00D4AA;
          transform: scale(1.05);
        }
        .pin-key:active {
          transform: scale(0.95);
        }

        .link-btn {
          background: none;
          border: none;
          color: #8F8FA3;
          font-family: 'Syne', sans-serif;
          font-size: 13px;
          cursor: pointer;
          font-weight: 600;
          padding: 0;
          transition: color 0.25s;
        }
        .link-btn:hover {
          color: #6C63FF;
        }

        /* ── CUSTOMER PORTAL LUXURY REDESIGN ── */
        .cust-login-card {
          width: 100%;
          max-width: 440px;
          background: #13110E;
          border: 1px solid rgba(201,168,76,0.15);
          border-radius: 24px;
          padding: 2.8rem 2.4rem;
          position: relative;
          box-shadow: 0 32px 80px rgba(0,0,0,0.85), 0 0 40px rgba(201,168,76,0.04);
          box-sizing: border-box;
          text-align: center;
          font-family: 'Montserrat', sans-serif;
        }
        .cust-close-btn {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          background: none;
          border: none;
          color: #8C8070;
          cursor: pointer;
          font-size: 1.8rem;
          line-height: 1;
          transition: color 0.25s, transform 0.25s;
          padding: 0;
        }
        .cust-close-btn:hover {
          color: #E8C97A;
          transform: scale(1.1);
        }
        .cust-title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 2.2rem;
          font-weight: 300;
          letter-spacing: -0.01em;
          color: #F7F3EC;
          margin: 0 0 0.4rem 0;
        }
        .cust-subtitle {
          font-family: 'Tenor Sans', sans-serif;
          font-size: 0.68rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #C9A84C;
          margin: 0 0 2.2rem 0;
        }
        .cust-google-btn {
          width: 100%;
          padding: 14px;
          background: transparent;
          border: 1px solid rgba(201,168,76,0.18);
          border-radius: 8px;
          color: #F7F3EC;
          font-family: 'Tenor Sans', sans-serif;
          font-size: 0.72rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
        }
        .cust-google-btn:hover {
          background: rgba(201,168,76,0.08);
          border-color: #C9A84C;
          box-shadow: 0 4px 24px rgba(201,168,76,0.18);
        }
        .cust-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #8C8070;
          font-family: 'Tenor Sans', sans-serif;
          font-size: 0.62rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin: 1.8rem 0;
        }
        .cust-divider::before, .cust-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: rgba(201,168,76,0.12);
        }
        .cust-input-group {
          margin-bottom: 1.6rem;
          text-align: left;
        }
        .cust-label {
          display: block;
          font-family: 'Tenor Sans', sans-serif;
          font-size: 0.62rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #8C8070;
          margin-bottom: 8px;
        }
        .cust-input {
          width: 100%;
          padding: 14px;
          background: rgba(10,9,6,0.6);
          border: 1px solid rgba(201,168,76,0.18);
          border-radius: 8px;
          color: #F7F3EC;
          font-family: 'Montserrat', sans-serif;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.3s;
          box-sizing: border-box;
        }
        .cust-input:focus {
          border-color: #C9A84C;
          box-shadow: 0 0 10px rgba(201,168,76,0.15);
        }
        .cust-submit-btn {
          width: 100%;
          padding: 15px;
          background: #C9A84C;
          border: none;
          border-radius: 8px;
          color: #0A0906;
          font-family: 'Tenor Sans', sans-serif;
          font-size: 0.72rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 15px rgba(201,168,76,0.25);
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cust-submit-btn:hover {
          background: #E8C97A;
          box-shadow: 0 8px 30px rgba(201,168,76,0.4);
        }
        .cust-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .cust-link-btn {
          background: none;
          border: none;
          color: #8C8070;
          font-family: 'Tenor Sans', sans-serif;
          font-size: 11px;
          cursor: pointer;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: color 0.25s;
          align-self: center;
          margin-top: 10px;
        }
        .cust-link-btn:hover {
          color: #C9A84C;
        }
      `}</style>

      {/* PARTICLE CANVAS */}
      <canvas id="particle-canvas" ref={canvasRef}></canvas>

      {/* CUSTOM CURSOR */}
      <div id="cursor" ref={cursorRef}></div>

      <div style={{ textAlign: "center", position: "relative", zIndex: 10 }}>
        <div 
          style={{ width: 52, height: 52, background: colors.accent, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", cursor: "pointer", transition: "transform 0.2s" }}
          onClick={(e) => triggerParticles(e, onBackToLanding)}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
          onMouseLeave={e => e.currentTarget.style.transform = ""}
        >
          <Zap size={28} color="#fff" />
        </div>
        <h1 
          style={{ color: colors.text, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: 0, cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
          onClick={(e) => triggerParticles(e, onBackToLanding)}
        >
          SuperMart
        </h1>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 6, fontFamily: "'Inter', sans-serif" }}>{type === "admin" ? "Admin Dashboard Access" : type === "staff" ? "Staff & POS Shift Portal" : "Customer Loyalty Portal"}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 400, alignItems: "center", position: "relative", zIndex: 10 }}>
        {type === "admin" ? (
          /* ── ADMIN PANEL ── */
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 16, borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.accent}20`, display: "flex", alignItems: "center", justifyContent: "center" }}><UserCog size={18} color={colors.accent} /></div>
              <div>
                <p style={{ color: colors.text, fontWeight: 700, fontSize: 16, margin: 0, fontFamily: "'Syne', sans-serif" }}>Admin Portal</p>
                <p style={{ color: colors.muted, fontSize: 12, margin: 0, fontFamily: "'Inter', sans-serif" }}>Full dashboard access</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Email</label>
                <input value={email} onChange={e => setEmail(e.target.value)} className="login-input" />
              </div>
              <div>
                <label style={lbl}>Password</label>
                <div style={{ position: "relative" }}>
                  <input type={showAdminPw ? "text" : "password"} value={password}
                    className="login-input"
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAdminLogin()}
                    placeholder="Enter password"
                    style={{ paddingRight: 40, borderColor: adminErr ? colors.danger : "rgba(255,255,255,0.1)" }} />
                  <button type="button" onClick={() => setShowAdminPw(p => !p)}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 0 }}>
                    {showAdminPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {adminErr && <p style={{ color: colors.danger, fontSize: 12, marginTop: 6, fontFamily: "'Inter', sans-serif" }}>{adminErr}</p>}
              </div>
              <button onClick={(e) => triggerParticles(e, handleAdminLogin)} disabled={adminLoading} className="login-btn">
                {adminLoading ? <><Spinner /> Signing in…</> : "Sign In to Dashboard"}
              </button>
            </div>
            <p style={{ color: colors.muted, fontSize: 11, textAlign: "center", margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>admin@supermart.in &nbsp;·&nbsp; Rakhib@123</p>
          </div>
        ) : type === "staff" ? (
          /* ── STAFF / POS PANEL ── */
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 16, borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#00B87A18", display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={18} color="#00B87A" /></div>
              <div>
                <p style={{ color: colors.text, fontWeight: 700, fontSize: 16, margin: 0, fontFamily: "'Syne', sans-serif" }}>Staff / POS Login</p>
                <p style={{ color: colors.muted, fontSize: 12, margin: 0, fontFamily: "'Inter', sans-serif" }}>Cashier & shift access</p>
              </div>
            </div>

            {!selected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cashiers.length === 0 && <p style={{ color: colors.muted, textAlign: "center", padding: 20, fontSize: 13, fontFamily: "'Inter', sans-serif" }}>No staff added yet. Go to Admin → Staff to add cashiers.</p>}
                {cashiers.map(c => (
                  <button key={c.id} onClick={(e) => triggerParticles(e, () => { setSelected(c); setPin(""); setStaffErr(""); }, true)} className="cashier-card">
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${colors.accent}18`, display: "flex", alignItems: "center", justifyContent: "center", color: colors.accent, fontSize: 16, fontWeight: 800, flexShrink: 0, fontFamily: "'Syne', sans-serif" }}>{c.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: colors.text, fontSize: 14, fontWeight: 700, margin: 0, fontFamily: "'Syne', sans-serif" }}>{c.name}</p>
                      <p style={{ color: colors.muted, fontSize: 12, margin: "2px 0 0", fontFamily: "'Inter', sans-serif" }}>{c.role} · {c.counter}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: c.status === "active" ? "#00B87A18" : "#FFB54718", color: c.status === "active" ? "#00B87A" : "#FFB547", flexShrink: 0, fontFamily: "'Syne', sans-serif" }}>
                      {c.status === "active" ? "On Shift" : "On Break"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(7,7,17,0.4)", border: `1px solid ${colors.border}`, borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: `${colors.accent}18`, display: "flex", alignItems: "center", justifyContent: "center", color: colors.accent, fontWeight: 800, fontSize: 15, fontFamily: "'Syne', sans-serif" }}>{selected.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: colors.muted, fontSize: 11, margin: 0, fontFamily: "'Inter', sans-serif" }}>{selected.role}</p>
                    <p style={{ color: colors.text, fontSize: 14, fontWeight: 700, margin: 0, fontFamily: "'Syne', sans-serif" }}>{selected.name}</p>
                  </div>
                  <button onClick={(e) => triggerParticles(e, () => { setSelected(null); setPin(""); setStaffErr(""); }, true)} className="change-btn">Change</button>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
                  {[0,1,2,3].map(i => <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < pin.length ? colors.accent : colors.border, transition: "background 0.15s" }} />)}
                </div>
                {staffErr && <p style={{ color: colors.danger, fontSize: 12, textAlign: "center", margin: 0, fontFamily: "'Inter', sans-serif" }}>{staffErr}</p>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d, i) => (
                    d === "" ? <div key={i} /> : (
                      <button key={i} onClick={(e) => d === "⌫" ? triggerParticles(e, delDigit, true) : triggerParticles(e, () => addDigit(String(d)), true)} className="pin-key">
                        {d}
                      </button>
                    )
                  ))}
                </div>
                <button onClick={(e) => triggerParticles(e, tryStaffLogin)} className={pin.length === 4 ? "login-btn" : "login-btn-disabled"}>
                  {pin.length === 4 ? "→ Start Shift" : `Enter ${4 - pin.length} more digit${4 - pin.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ── CUSTOMER PANEL ── */
          <div className="cust-login-card">
            {/* CLOSE BUTTON */}
            <button className="cust-close-btn" onClick={(e) => triggerParticles(e, onBackToLanding)} aria-label="Close portal">
              &times;
            </button>

            {/* HEADER BRANDING */}
            <h2 className="cust-title">Welcome to SuperMart</h2>
            <p className="cust-subtitle">Gourmet VIP Club Sign In</p>

            {/* ERROR BANNER */}
            {custErr && (
              <div style={{
                color: "#FF5555",
                fontSize: 12,
                border: "1px solid rgba(255,85,85,0.25)",
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(255,85,85,0.06)",
                fontFamily: "'Inter', sans-serif",
                marginBottom: 14,
                lineHeight: "1.4",
                textAlign: "left"
              }}>
                {custErr}
              </div>
            )}
            
            {phoneStep === 1 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* GOOGLE SIGN IN BUTTON */}
                <button 
                  onClick={handleGoogleSignIn} 
                  disabled={custLoading} 
                  className="cust-google-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
                
                {/* DIVIDER */}
                <div className="cust-divider">or use your phone</div>
                
                {/* PHONE INPUT */}
                <div className="cust-input-group">
                  <label className="cust-label">Phone Number</label>
                  <input 
                    value={custPhone} 
                    onChange={e => setCustPhone(e.target.value)} 
                    placeholder="+91 99999 99999" 
                    className="cust-input" 
                    style={{ borderColor: custErr ? "#FF5555" : "rgba(201,168,76,0.18)" }}
                    onKeyDown={e => e.key === "Enter" && handlePhoneSendOtp(e)}
                  />
                </div>
                
                <button 
                  onClick={(e) => triggerParticles(e, () => handlePhoneSendOtp(e))} 
                  disabled={custLoading} 
                  className="cust-submit-btn"
                >
                  {custLoading ? <><RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite", marginRight: 8 }} /> Sending SMS…</> : "Send Access Code"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* OTP SENT HEADER */}
                <div style={{ textAlign: "center", padding: "12px 16px", background: "rgba(0,212,170,0.06)", border: "1px solid rgba(0,212,170,0.18)", borderRadius: 10 }}>
                  <p style={{ color: "#00D4AA", fontSize: 12, fontWeight: 600, margin: "0 0 4px", fontFamily: "'Inter', sans-serif" }}>✅ Access Code Sent</p>
                  <p style={{ color: "#8F8FA3", fontSize: 11, margin: 0, fontFamily: "'Inter', sans-serif" }}>Enter the 6-digit code sent to <strong style={{ color: "#fff" }}>{custPhone}</strong></p>
                </div>

                {/* DEMO OTP DISPLAY — show the code for testing */}
                <div style={{ textAlign: "center", background: "rgba(108,99,255,0.08)", border: "1px dashed rgba(108,99,255,0.35)", borderRadius: 8, padding: "8px 14px" }}>
                  <p style={{ color: "#8F8FA3", fontSize: 10, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Inter', sans-serif" }}>Your Access Code (Demo)</p>
                  <p style={{ color: "#6C63FF", fontSize: 22, fontWeight: 800, letterSpacing: 8, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{generatedOtp}</p>
                </div>

                {/* 6-BOX OTP INPUT */}
                <div className="cust-input-group">
                  <label className="cust-label">Enter 6-Digit Access Code</label>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={otpInputRefs[i]}
                        value={digit}
                        onChange={e => handleOtpDigitChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        maxLength={1}
                        inputMode="numeric"
                        style={{
                          width: 42,
                          height: 52,
                          textAlign: "center",
                          fontSize: 22,
                          fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          background: digit ? "rgba(108,99,255,0.12)" : "rgba(7,7,17,0.7)",
                          border: `2px solid ${digit ? "#6C63FF" : (custErr ? "#FF5555" : "rgba(255,255,255,0.1)")  }`,
                          borderRadius: 10,
                          color: "#fff",
                          outline: "none",
                          transition: "all 0.2s",
                          boxShadow: digit ? "0 0 12px rgba(108,99,255,0.25)" : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
                
                <button 
                  onClick={(e) => triggerParticles(e, () => handlePhoneVerifyOtp(e))} 
                  disabled={custLoading || otpDigits.join("").length < 6} 
                  className="cust-submit-btn"
                  style={{ opacity: otpDigits.join("").length < 6 ? 0.5 : 1 }}
                >
                  {custLoading ? <><RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite", marginRight: 8 }} /> Verifying…</> : "Verify & Sign In"}
                </button>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button 
                    onClick={() => { setPhoneStep(1); setOtpDigits(["","","","","",""]); setCustErr(""); setGeneratedOtp(""); }} 
                    className="cust-link-btn"
                  >
                    ← Change number
                  </button>
                  <button 
                    onClick={() => handlePhoneSendOtp(null)} 
                    className="cust-link-btn"
                    disabled={custLoading}
                  >
                    Resend code
                  </button>
                </div>
              </div>
            )}
            
            <div id="recaptcha-container" style={{ display: "none" }}></div>
            
            {/* COLLAPSIBLE UAT TEST PROFILES */}
            <details style={{ marginTop: 18, borderTop: "1px solid rgba(201,168,76,0.12)", paddingTop: 12, textAlign: "left" }}>
              <summary style={{ color: "#8C8070", fontSize: 11, cursor: "pointer", fontFamily: "'Tenor Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", outline: "none" }}>
                Quick Demo Accounts
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 120, overflowY: "auto", marginTop: 10, paddingRight: 4 }}>
                {customers.length === 0 && <p style={{ color: "#8C8070", fontSize: 11, fontFamily: "'Inter', sans-serif", textAlign: "center" }}>No registered loyalty members.</p>}
                {customers.map(c => (
                  <button key={c.id || c.phone} onClick={(e) => triggerParticles(e, () => { setCustPhone(c.phone || ""); setCustErr(""); }, true)} className="cashier-card" style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(201,168,76,0.1)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(201,168,76,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#C9A84C", fontSize: 12, fontWeight: 800, flexShrink: 0, fontFamily: "'Tenor Sans', sans-serif" }}>{c.name ? c.name[0] : "C"}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#F7F3EC", fontSize: 12, fontWeight: 700, margin: 0, fontFamily: "'Tenor Sans', sans-serif" }}>{c.name}</p>
                      <p style={{ color: "#8C8070", fontSize: 11, margin: "1px 0 0", fontFamily: "'Inter', sans-serif" }}>{c.phone}</p>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: c.tag === "VIP" ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)", color: c.tag === "VIP" ? "#C9A84C" : "#8C8070", flexShrink: 0 }}>
                      {c.tag || "Regular"}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0 8px", position: "relative", zIndex: 10, gap: 12 }}>
          {type === "admin" && (
            <>
              <button onClick={(e) => triggerParticles(e, () => onToggleType("staff-login"))} className="link-btn" style={{ color: colors.accent }}>
                Staff Portal →
              </button>
              <button onClick={(e) => triggerParticles(e, () => onToggleType("customer-login"))} className="link-btn" style={{ color: colors.success }}>
                Customer Portal →
              </button>
            </>
          )}
          {type === "staff" && (
            <>
              <button onClick={(e) => triggerParticles(e, () => onToggleType("admin-login"))} className="link-btn" style={{ color: colors.accent }}>
                Admin Portal →
              </button>
              <button onClick={(e) => triggerParticles(e, () => onToggleType("customer-login"))} className="link-btn" style={{ color: colors.success }}>
                Customer Portal →
              </button>
            </>
          )}
          {type === "customer" && (
            <>
              <button onClick={(e) => triggerParticles(e, () => onToggleType("admin-login"))} className="link-btn" style={{ color: colors.accent }}>
                Admin Portal →
              </button>
              <button onClick={(e) => triggerParticles(e, () => onToggleType("staff-login"))} className="link-btn" style={{ color: "#00B87A" }}>
                Staff Portal →
              </button>
            </>
          )}
          <button onClick={(e) => triggerParticles(e, onBackToLanding)} className="link-btn">
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

const CustomerPortal = ({ customer, onLogout, transactions = [] }) => {
  const [expandedTx, setExpandedTx] = useState(null);

  // Filter transactions for this customer
  const cleanCustPhone = (customer.phone || "").replace(/[^0-9]/g, "");
  const myTx = transactions.filter(t => {
    if (!t.customer) return false;
    const cleanTxPhone = (t.customer.phone || "").replace(/[^0-9]/g, "");
    return cleanTxPhone === cleanCustPhone || t.customer.name === customer.name;
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const colors = {
    accent: "#6C63FF",
    success: "#00D4AA",
    warning: "#FFB547",
    danger: "#FF4D6D",
    text: "#FFFFFF",
    muted: "#8F8FA3",
    border: "rgba(255,255,255,0.08)",
    surf: "rgba(17,19,34,0.72)",
    bg: "#07070F",
  };

  const cardStyle = {
    background: colors.surf,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    backdropFilter: "blur(12px)",
  };

  const lbl = { 
    color: colors.muted, 
    fontSize: 11, 
    display: "block", 
    marginBottom: 6, 
    fontFamily: "'Inter', sans-serif", 
    fontWeight: 600, 
    textTransform: "uppercase", 
    letterSpacing: "0.05em" 
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", padding: "24px 16px", boxSizing: "border-box" }}>
      {/* Background Orbs */}
      <div style={{ position: "fixed", top: -200, left: 40, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,212,170,0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: -100, right: 100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(123,97,255,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
        
        {/* Navigation / Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${colors.border}`, paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>SuperMart</span>
            <span style={{ background: "rgba(0,212,170,0.1)", color: colors.success, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12, fontFamily: "'Syne', sans-serif" }}>Loyalty Portal</span>
          </div>
          <button 
            onClick={onLogout} 
            style={{ background: "rgba(255,77,109,0.1)", border: "1px solid rgba(255,77,109,0.2)", borderRadius: 10, padding: "8px 16px", color: colors.danger, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = colors.danger; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,77,109,0.1)"; e.currentTarget.style.color = colors.danger; }}
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>

        {/* Welcome Section */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 32, margin: 0, letterSpacing: "-0.03em" }}>
              Welcome back, <span style={{ background: "linear-gradient(to right, #6C63FF, #00D4AA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{customer.name}</span>
            </h1>
            <p style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>Manage your loyalty benefits, track purchases and view reward coupons.</p>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20, background: customer.tag === "VIP" ? "linear-gradient(135deg, rgba(108,99,255,0.2) 0%, rgba(0,212,170,0.1) 100%)" : "rgba(255,255,255,0.05)", border: `1px solid ${customer.tag === "VIP" ? colors.accent : colors.border}`, color: customer.tag === "VIP" ? colors.success : colors.muted, fontFamily: "'Syne', sans-serif" }}>
            <Star size={13} fill={customer.tag === "VIP" ? colors.success : "none"} /> {customer.tag || "Regular"} Member
          </span>
        </div>

        {/* Top Cards: Loyalty Card & Statistics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", mdGridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
          {/* Virtual Loyalty Card */}
          <div style={{ ...cardStyle, background: "linear-gradient(135deg, rgba(15,15,26,0.9) 0%, rgba(24,24,35,0.95) 100%)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200, border: `1px solid rgba(108,99,255,0.25)` }}>
            {/* Glossy overlay effect */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "100%", background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 50%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: -50, right: -50, width: 150, height: 150, borderRadius: "50%", background: "rgba(108,99,255,0.12)", filter: "blur(40px)", pointerEvents: "none" }} />
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 1 }}>
              <div>
                <p style={{ color: colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>SuperMart Rewards</p>
                <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, margin: "4px 0 0" }}>Digital Loyalty Card</h3>
              </div>
              <QrCode size={40} color={colors.success} style={{ filter: `drop-shadow(0 0 8px ${colors.success}50)` }} />
            </div>

            <div style={{ position: "relative", zIndex: 1, marginTop: 32 }}>
              <p style={{ color: colors.muted, fontSize: 10, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>MEMBERSHIP NUMBER</p>
              <p style={{ fontSize: 18, fontWeight: 600, letterSpacing: 2, fontFamily: "'JetBrains Mono', monospace", margin: "2px 0 0" }}>
                {customer.phone ? customer.phone.replace(/(\+91\s)?(\d{5})(\d{5})/, "$2 $3") : "00000 00000"}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 12, position: "relative", zIndex: 1 }}>
              <div>
                <p style={{ color: colors.muted, fontSize: 9, margin: 0 }}>CARD HOLDER</p>
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0, fontFamily: "'Syne', sans-serif" }}>{customer.name.toUpperCase()}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.success, background: "rgba(0,212,170,0.1)", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>
                  {customer.tag || "Regular"}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Points Stat Card */}
            <div style={{ ...cardStyle, flex: 1, display: "flex", flexDirection: "column", justifyStyle: "center", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: colors.muted, fontSize: 13, fontWeight: 500 }}>Loyalty Balance</span>
                <span style={{ color: colors.success, background: "rgba(0,212,170,0.1)", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>Points Active</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>{customer.points || 0}</span>
                <span style={{ color: colors.muted, fontSize: 14 }}>Points</span>
              </div>
              <div>
                {/* Progress bar to next reward */}
                {(() => {
                  const maxPts = 500;
                  const current = (customer.points || 0) % maxPts;
                  const pct = Math.min(100, (current / maxPts) * 100);
                  const remaining = maxPts - current;
                  return (
                    <>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(to right, ${colors.accent}, ${colors.success})`, borderRadius: 3 }} />
                      </div>
                      <p style={{ color: colors.muted, fontSize: 11, margin: 0 }}>
                        {remaining} points needed for your next <strong>₹100 coupon</strong>.
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Visit / Spend Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ ...cardStyle, padding: 18, textAlign: "center" }}>
                <p style={{ color: colors.muted, fontSize: 12, margin: "0 0 6px" }}>Store Visits</p>
                <p style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Syne', sans-serif", margin: 0 }}>{customer.visits || 0}</p>
              </div>
              <div style={{ ...cardStyle, padding: 18, textAlign: "center" }}>
                <p style={{ color: colors.muted, fontSize: 12, margin: "0 0 6px" }}>Total Spend</p>
                <p style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Syne', sans-serif", margin: 0, color: colors.success }}>₹{customer.spend || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Purchase History / Receipts */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${colors.border}`, paddingBottom: 14, marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>Purchase & Billing History</h3>
            <span style={{ color: colors.muted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{myTx.length} invoices found</span>
          </div>

          {myTx.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <p style={{ color: colors.muted, fontSize: 14, margin: "0 0 8px" }}>No shopping transactions found on this membership yet.</p>
              <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>Verify your loyalty number at the counter when checking out to receive receipts here.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {myTx.map(t => {
                const isOpen = expandedTx === t.id;
                const txDate = new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={t.id} style={{ border: `1px solid ${isOpen ? colors.accent : colors.border}`, borderRadius: 10, background: isOpen ? "rgba(108,99,255,0.03)" : "rgba(255,255,255,0.01)", overflow: "hidden", transition: "all 0.2s" }}>
                    
                    {/* Header Row */}
                    <div 
                      onClick={() => setExpandedTx(isOpen ? null : t.id)}
                      style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0, fontFamily: "'Syne', sans-serif" }}>Invoice #{t.invoiceNo || t.id.slice(0, 8).toUpperCase()}</p>
                        <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>{txDate}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: colors.success }}>₹{t.total || t.grandTotal}</p>
                          <p style={{ color: colors.muted, fontSize: 11, margin: 0 }}>{t.paymentMethod || "UPI"}</p>
                        </div>
                        <ChevronDown size={18} color={colors.muted} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${colors.border}`, padding: 18, background: "rgba(7,7,17,0.4)" }}>
                        <p style={{ ...lbl, margin: "0 0 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Items Detail</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                          {(t.items || []).map((item, index) => (
                            <div key={index} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px dashed rgba(255,255,255,0.05)", paddingBottom: 6 }}>
                              <div>
                                <span style={{ color: colors.text, fontWeight: 600 }}>{item.name}</span>
                                <span style={{ color: colors.muted, fontSize: 11, marginLeft: 8 }}>x{item.quantity}</span>
                              </div>
                              <span style={{ color: colors.muted }}>₹{item.price * item.quantity}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 12, fontSize: 12 }}>
                          <div>
                            <span style={{ color: colors.muted }}>Counter/Terminal: </span>
                            <span style={{ color: colors.text, fontWeight: 600 }}>{t.counter || "Counter 1"}</span>
                          </div>
                          <div>
                            <span style={{ color: colors.muted }}>Cashier Name: </span>
                            <span style={{ color: colors.text, fontWeight: 600 }}>{t.cashier || "System"}</span>
                          </div>
                          <div>
                            <span style={{ color: colors.muted }}>Subtotal: </span>
                            <span style={{ color: colors.text }}>₹{t.subtotal || t.total}</span>
                          </div>
                          <div>
                            <span style={{ color: colors.muted }}>Discount Applied: </span>
                            <span style={{ color: colors.success }}>-₹{t.discount || 0}</span>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── AI VOICE ASSISTANT (see AIVoiceAssistant.jsx) ───────────────────────────

const AIChatBot = ({ products, customers, staff }) => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "bot", text: "Hi! I'm SuperMart AI 🛒\nAsk me anything about your store — revenue, trends, stock levels, customers, analytics, and more!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (open) { setPulse(false); setTimeout(() => inputRef.current?.focus(), 100); } }, [open]);

  const buildContext = () => {
    const lowStock    = products.filter(p => p.stock > 0 && p.stock < 10);
    const outStock    = products.filter(p => p.stock === 0);
    const vipCustomers = customers.filter(c => c.tag === "VIP");
    const totalSpend  = customers.reduce((s, c) => s + Number(c.spend || 0), 0);
    const activeStaff = staff.filter(s => s.status === "active");

    // Derive category breakdown from live products
    const catMap = {};
    products.forEach(p => { catMap[p.cat] = (catMap[p.cat] || 0) + 1; });
    const catSummary = Object.entries(catMap).map(([k, v]) => `${k}: ${v} products`).join(" | ") || "No products yet";

    return `You are SuperMart AI, an intelligent assistant for a grocery store powered by SuperMart.
Answer questions concisely using the LIVE store data below. Use Indian number formatting (₹).

=== LIVE INVENTORY (${products.length} products) ===
${products.map(p => `${p.name} [${p.cat}] — Stock: ${p.stock}, Price: ₹${p.price}, Status: ${p.status}`).join("\n") || "No products added yet."}

Out of Stock (${outStock.length}): ${outStock.map(p => p.name).join(", ") || "None"}
Low Stock <10 units (${lowStock.length}): ${lowStock.map(p => `${p.name}: ${p.stock}`).join(", ") || "None"}

=== CATEGORIES ===
${catSummary}

=== CUSTOMERS (${customers.length} registered) ===
${customers.map(c => `${c.name} — ${c.tag}, Spend: ₹${Number(c.spend || 0).toLocaleString("en-IN")}, Visits: ${c.visits || 0}, Points: ${c.points || 0}`).join("\n") || "No customers yet."}
VIP Customers (${vipCustomers.length}): ${vipCustomers.map(c => c.name).join(", ") || "None"}
Total Customer Spend: ₹${totalSpend.toLocaleString("en-IN")}

=== STAFF (${staff.length} members, ${activeStaff.length} on shift) ===
${staff.map(s => `${s.name} — ${s.role}, ${s.counter || "—"}, Status: ${s.status}`).join("\n") || "No staff added yet."}`;
  };

  const send = async (text) => {
    const q = text || input.trim();
    if (!q || loading) return;
    setInput("");
    setMsgs(p => [...p, { role: "user", text: q }]);
    setLoading(true);

    // Always generate instant local answer from store data (no API quota needed)
    const instant = localAnswer(q, products, customers, staff);
    setMsgs(p => [...p, { role: "bot", text: instant }]);
    setLoading(false);

    // Optionally enhance with Groq AI in background
    const context = buildContext();
    const prompt = `${context}\n\n=== USER QUESTION ===\n${q}\n\nAnswer clearly and concisely. Use ₹ for currency, bullet points for lists. Keep response under 150 words unless detail is needed.`;
    askGroq(prompt).then(aiReply => {
      if (aiReply && aiReply.length > 20) {
        setMsgs(p => {
          const updated = [...p];
          // Replace the last bot message with the AI-enhanced version
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "bot") { updated[i] = { role: "bot", text: aiReply }; break; }
          }
          return updated;
        });
      }
    });
  };

  return (
    <>
      {/* Floating Button */}
      <div style={{ position: "fixed", bottom: 80, right: 28, zIndex: 9000 }}>
        {pulse && !open && (
          <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: `2px solid ${A.accent}`, animation: "spin 2s linear infinite", opacity: 0.5 }} />
        )}
        <button
          onClick={() => setOpen(p => !p)}
          title="SuperMart AI Assistant"
          style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${A.accent}, #9C5FFF)`, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 32px ${A.accent}60`, transition: "transform 0.2s", transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
        >
          {open ? <X size={22} color="#fff" /> : <Brain size={24} color="#fff" />}
        </button>
        {pulse && !open && (
          <div style={{ position: "absolute", top: -8, right: -4, background: A.danger, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>AI</div>
        )}
      </div>

      {/* Chat Panel */}
      {open && (
        <div style={{ position: "fixed", bottom: 150, right: 28, width: 380, height: 560, background: A.surf, border: `1px solid ${A.border}`, borderRadius: 18, display: "flex", flexDirection: "column", zIndex: 8999, boxShadow: "0 24px 80px rgba(0,0,0,0.6)", animation: "fadein 0.2s ease", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "14px 18px", background: `linear-gradient(135deg, ${A.accent}22, #9C5FFF18)`, borderBottom: `1px solid ${A.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg, ${A.accent}, #9C5FFF)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Brain size={20} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: A.text, fontWeight: 700, fontSize: 14 }}>SuperMart AI</div>
              <div style={{ color: A.alt, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: A.alt }} />
                Powered by Groq AI · Live store data
              </div>
            </div>
            <button onClick={() => setMsgs([{ role: "bot", text: "Hi! I'm SuperMart AI 🛒\nAsk me anything about your store!" }])} title="Clear chat" style={{ background: "none", border: `1px solid ${A.border}`, borderRadius: 6, padding: "4px 8px", color: A.muted, fontSize: 11, cursor: "pointer" }}>Clear</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                {m.role === "bot" && (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${A.accent}, #9C5FFF)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginBottom: 2 }}>
                    <Brain size={14} color="#fff" />
                  </div>
                )}
                <div style={{ maxWidth: "76%", background: m.role === "user" ? A.accent : A.bg, borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "10px 13px", border: m.role === "bot" ? `1px solid ${A.border}` : "none" }}>
                  <p style={{ color: m.role === "user" ? "#fff" : A.text, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{m.text}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${A.accent}, #9C5FFF)`, display: "flex", alignItems: "center", justifyContent: "center" }}><Brain size={14} color="#fff" /></div>
                <div style={{ background: A.bg, border: `1px solid ${A.border}`, borderRadius: "14px 14px 14px 4px", padding: "10px 16px", display: "flex", gap: 5, alignItems: "center" }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: A.accent, animation: `fadein 0.8s ease ${i * 0.2}s infinite alternate` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {msgs.length <= 1 && (
            <div style={{ padding: "0 12px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CHAT_SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} style={{ background: `${A.accent}15`, border: `1px solid ${A.accent}30`, borderRadius: 20, padding: "5px 11px", color: A.accent, fontSize: 11, cursor: "pointer", fontWeight: 500, transition: "all 0.15s" }}>{s}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${A.border}`, display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about revenue, trends, stock…"
              style={{ flex: 1, background: A.bg, border: `1px solid ${A.border}`, borderRadius: 10, padding: "9px 13px", color: A.text, fontSize: 13, outline: "none" }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{ width: 38, height: 38, borderRadius: 10, background: input.trim() && !loading ? A.accent : A.border, border: "none", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s", flexShrink: 0 }}
            >
              <Zap size={17} color={input.trim() && !loading ? "#fff" : A.muted} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("landing");
  const [sec, setSec] = useState("dashboard");
  const [showN, setShowN] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [activeCashier, setActiveCashier] = useState(null);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [liveTransactions, setLiveTransactions] = useState([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try { return localStorage.getItem("supermart_sidebar_pinned") === "true"; } catch { return false; }
  });
  const [sidebarHovered, setSidebarHovered] = useState(false);
  // ── Theme ────────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem("supermart_theme") !== "light"; } catch { return true; }
  });
  const toggleTheme = () => setIsDark(d => {
    const next = !d;
    try { localStorage.setItem("supermart_theme", next ? "dark" : "light"); } catch {}
    return next;
  });
  // Keep the module-level alias in sync so all components see the right theme
  A = isDark ? DARK_THEME : LIGHT_THEME;

  // ── Real-time Firestore onSnapshot listeners ────────────────────────────────
  useEffect(() => {
    // Import onSnapshot at runtime (already bundled via firebase.js)
    import("firebase/firestore").then(({ onSnapshot, collection, query, orderBy, limit }) => {
      import("./firebase.js").then(({ db }) => {
        // Products listener — reads localStorage images fresh on every snapshot
        const getStoredImgs = () => {
          try { return JSON.parse(localStorage.getItem("supermart_prod_imgs") || "{}"); } catch { return {}; }
        };

        const unsubProds = onSnapshot(collection(db, "products"), snap => {
          const imgs = getStoredImgs(); // fresh read every time Firestore fires
          const prods = snap.docs.map(d => {
            const data = { id: d.id, ...d.data() };
            data.img = data.img || imgs[d.id] || ""; // merge locally-stored base64 image
            return data;
          });
          setProducts(prods);
          setDbLoaded(true);
        }, err => console.error("products onSnapshot:", err));

        // Staff listener
        const unsubStaff = onSnapshot(collection(db, "staff"), snap => {
          setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, err => console.error("staff onSnapshot:", err));

        // Notifications listener — picks up real-time staff break alerts
        const unsubNotifs = onSnapshot(collection(db, "notifications"), snap => {
          const dbNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // Merge DB notifications into admin notifs (prepend, deduplicate by id)
          setNotifs(prev => {
            const stockNotifs = prev.filter(n => typeof n.id === "number"); // keep stock alerts
            const merged = [
              ...dbNotifs.map(n => ({ ...n, fromDb: true })),
              ...stockNotifs,
            ];
            return merged;
          });
        }, err => console.error("notifications onSnapshot:", err));

        // Customers listener
        const unsubCust = onSnapshot(collection(db, "customers"), snap => {
          setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, err => console.error("customers onSnapshot:", err));

        // Transactions listener (latest 50)
        const txQuery = query(collection(db, "transactions"), orderBy("createdAt", "desc"), limit(50));
        const unsubTx = onSnapshot(txQuery, snap => {
          setLiveTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, err => {
          // Fallback: fetch without ordering if index missing
          import("firebase/firestore").then(({ getDocs }) => {
            getDocs(collection(db, "transactions")).then(s => {
              setLiveTransactions(s.docs.map(d => ({ id: d.id, ...d.data() })));
            });
          });
        });

        setDbLoaded(true);
        return () => { unsubProds(); unsubStaff(); unsubNotifs(); unsubCust(); unsubTx(); };
      });
    });
  }, []);

  // ── Manual refresh (still available via TopBar button) ─────────────────────
  const refreshAll = useCallback(async () => {
    const [prods, custs, stf, txns] = await Promise.all([
      sbGet("products"), sbGet("customers"), sbGet("staff"), sbGet("transactions"),
    ]);
    const storedImgs = (() => { try { return JSON.parse(localStorage.getItem("supermart_prod_imgs") || "{}"); } catch { return {}; } })();
    if (prods) setProducts(prods.map(p => ({ ...p, img: p.img || storedImgs[p.id] || "" })));
    if (custs) setCustomers(custs);
    if (stf)   setStaff(stf);
    if (txns)  setLiveTransactions(txns);
    setDbLoaded(true);
  }, []);

  // ── Dynamic ticker from live transactions ───────────────────────────────────
  const tickerItems = liveTransactions.length > 0
    ? liveTransactions.map(t => {
        const items = (() => { try { return JSON.parse(t.items || "[]"); } catch { return []; } })();
        return `₹${Number(t.total).toLocaleString("en-IN")} — ${items.length} items — ${t.cashier || "Cashier"} — Bill #${t.bill_no}`;
      })
    : [];

  // ── Sync notifications with live stock levels ─────────────────────────────
  useEffect(() => {
    const critProds = products.filter(p => p.stock > 0 && p.stock < 3);
    const lowProds  = products.filter(p => p.stock >= 3 && p.stock < 10);
    setNotifs([
      ...critProds.map((p, i) => ({ id: 100 + i, t: "danger", msg: `${p.name} — critically low (${p.stock} units)`, time: "now", read: false })),
      ...lowProds.map((p, i)  => ({ id: 200 + i, t: "warn",   msg: `${p.name} — only ${p.stock} units left`, time: "now", read: false })),
    ]);
  }, [products]);



  const handleSearch = (q) => { setSearchQ(q); };

  const VIEWS = {
    dashboard: <DashView products={products} transactions={liveTransactions} />,
    products: <ProdsView products={products} setProducts={setProducts} globalSearch={searchQ} />,
    analytics: <AnalyView transactions={liveTransactions} />,
    ai: <AIView products={products} />,
    customers: <CustView customers={customers} setCustomers={setCustomers} globalSearch={searchQ} />,
    staff: <StaffView staff={staff} setStaff={setStaff} />,
    banners: <BannerView />,
    settings: <SetView />,
  };

  return <>
    <style>{FONT}</style>
    <Toast />
    {view === "landing" && <LandingPage onGetStarted={(target) => setView(target === "staff" ? "staff-login" : target === "customer" ? "customer-login" : "admin-login")} />}
    {view === "admin-login" && <LoginPage
      type="admin"
      onAdminLogin={() => setView("admin")}
      onStaffLogin={(c) => { setActiveCashier(c); setView("pos"); }}
      onCustomerLogin={(cust) => {
        setActiveCustomer(cust);
        sessionStorage.setItem("supermart_active_customer", JSON.stringify(cust));
        window.location.href = "/customer-website.html";
      }}
      onBackToLanding={() => setView("landing")}
      onToggleType={(viewName) => setView(viewName)}
      staff={staff}
      customers={customers}
    />}
    {view === "staff-login" && <LoginPage
      type="staff"
      onAdminLogin={() => setView("admin")}
      onStaffLogin={(c) => { setActiveCashier(c); setView("pos"); }}
      onCustomerLogin={(cust) => {
        setActiveCustomer(cust);
        sessionStorage.setItem("supermart_active_customer", JSON.stringify(cust));
        window.location.href = "/customer-website.html";
      }}
      onBackToLanding={() => setView("landing")}
      onToggleType={(viewName) => setView(viewName)}
      staff={staff}
      customers={customers}
    />}
    {view === "customer-login" && <LoginPage
      type="customer"
      onAdminLogin={() => setView("admin")}
      onStaffLogin={(c) => { setActiveCashier(c); setView("pos"); }}
      onCustomerLogin={(cust) => {
        setActiveCustomer(cust);
        sessionStorage.setItem("supermart_active_customer", JSON.stringify(cust));
        window.location.href = "/customer-website.html";
      }}
      onBackToLanding={() => setView("landing")}
      onToggleType={(viewName) => setView(viewName)}
      staff={staff}
      customers={customers}
    />}
    {view === "customer-portal" && activeCustomer && (
      <CustomerPortal 
        customer={activeCustomer} 
        onLogout={() => { setActiveCustomer(null); setView("customer-login"); }} 
        transactions={liveTransactions} 
      />
    )}
    {view === "pos" && <POS onBack={() => setView("admin")} onSignOut={() => { setActiveCashier(null); setView("staff-login"); }} products={products} setProducts={setProducts} cashier={activeCashier || { name: "Admin", role: "Admin", counter: "Counter 1" }} customers={customers} setCustomers={setCustomers} />}
    {view === "admin" && (
      <>
        <PremiumEffects />
        <div style={{ minHeight: "100vh", background: A.bg, fontFamily: "'Inter',sans-serif", position:"relative", overflow:"hidden", transition:"background 0.3s ease" }} onClick={() => showN && setShowN(false)}>
          {/* Ambient background glow */}
          <div style={{ position:"fixed", top:-200, left:40, width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle, rgba(123,97,255,0.06) 0%, transparent 70%)", pointerEvents:"none", zIndex:0 }} />
          <div style={{ position:"fixed", bottom:-100, right:100, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(77,163,255,0.05) 0%, transparent 70%)", pointerEvents:"none", zIndex:0 }} />

          <Sidebar 
            sec={sec} 
            setSec={s => { setSec(s); setShowN(false); setSearchQ(""); }} 
            onLogout={() => { setView("admin-login"); setSearchQ(""); }} 
            pinned={sidebarPinned}
            setPinned={setSidebarPinned}
            hovered={sidebarHovered}
            setHovered={setSidebarHovered}
          />
          <div style={{ 
            marginLeft: sidebarPinned ? 240 : 72, 
            minHeight: "100vh", 
            display: "flex", 
            flexDirection: "column",
            transition: "margin-left 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <TopBar sec={sec} notifs={notifs} setNotifs={setNotifs} showN={showN} setShowN={setShowN} goPos={() => setView("pos")} onSearch={handleSearch} searchQ={searchQ} dbLoaded={dbLoaded} onRefresh={refreshAll} isDark={isDark} toggleTheme={toggleTheme} products={products} customers={customers} staff={staff} onNavigate={setSec} />
            <div style={{ flex: 1, overflowY: "auto" }}>{VIEWS[sec]}</div>
            {/* Live Ticker */}
            <div style={{ height: 38, background: "rgba(13,16,32,0.9)", backdropFilter:"blur(12px)", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", overflow: "hidden", position: "sticky", bottom: 0 }}>
              <div style={{ display: "flex", gap: 48, animation: "ticker 40s linear infinite", whiteSpace: "nowrap", paddingLeft: 20 }}>
                {tickerItems.length > 0 ? [...tickerItems, ...tickerItems].map((t, i) => (
                  <span key={i} style={{ color: A.muted, fontSize: 11, fontFamily: A.mono }}>
                    <span style={{ color: A.cyan, marginRight: 8, fontSize: 8 }}>◆</span>{t}
                  </span>
                )) : (
                  <span style={{ color: A.muted, fontSize: 11 }}>
                    <span style={{ color: A.cyan, marginRight: 8 }}>◆</span>No transactions yet — start selling to see live feed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <AIVoiceAssistant products={products} customers={customers} staff={staff} transactions={liveTransactions} setProducts={setProducts} setCustomers={setCustomers} />
      </>
    )}
  </>;
}

