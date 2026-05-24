import React, { useEffect, useRef, useState, useCallback } from "react";
import characterImg from "./shopping-cart-character.png";
import { db } from "./firebase.js";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";

export default function LandingPage({ onGetStarted }) {
  const canvasRef = useRef(null);
  const [showLoginDropdown, setShowLoginDropdown] = useState(false);
  const [showMobileLoginMenu, setShowMobileLoginMenu] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const dropdownRef = useRef(null);

  // ── FIREBASE REAL-TIME STATE ──
  const [liveTransactions, setLiveTransactions] = useState([]);
  const [liveProducts, setLiveProducts] = useState([]);

  // ── DERIVED LIVE STATS ──
  const todayStr = new Date().toDateString();
  const todayTxns = liveTransactions.filter(t => {
    if (!t.createdAt) return false;
    const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    return d.toDateString() === todayStr;
  });
  const todayRevenue = todayTxns.reduce((s, t) => s + (Number(t.total) || 0), 0);
  const todayTxCount = todayTxns.length;
  const todayItemsSold = todayTxns.reduce((s, t) => {
    try { return s + JSON.parse(t.items || "[]").length; } catch { return s; }
  }, 0);
  const avgBasket = todayTxCount > 0 ? todayRevenue / todayTxCount : 0;

  // Monthly revenue (current calendar month)
  const now = new Date();
  const monthTxns = liveTransactions.filter(t => {
    if (!t.createdAt) return false;
    const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthRevenue = monthTxns.reduce((s, t) => s + (Number(t.total) || 0), 0);

  const productCount = liveProducts.length;

  // Ref to give the DOM-based hero terminal access to live Firebase values
  const liveDataRef = useRef({ todayRevenue: 0, productCount: 0, todayTxCount: 0 });
  liveDataRef.current = { todayRevenue, productCount, todayTxCount };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowLoginDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── FIREBASE REAL-TIME LISTENERS ──
  useEffect(() => {
    // Transactions (latest 100, desc)
    const txQuery = query(collection(db, "transactions"), orderBy("createdAt", "desc"), limit(100));
    const unsubTx = onSnapshot(txQuery, snap => {
      setLiveTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      // Fallback without ordering if index missing
      const unsubFallback = onSnapshot(collection(db, "transactions"), snap => {
        setLiveTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return unsubFallback;
    });

    // Products
    const unsubProds = onSnapshot(collection(db, "products"), snap => {
      setLiveProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTx(); unsubProds(); };
  }, []);

  useEffect(() => {
    // ── LOADING SCREEN ANIMATION ──
    let timer;
    let p = 0;
    const interval = setInterval(() => {
      // Smoothly advance from 0% to 100%
      p = Math.min(100, p + 1.25);
      setLoadingProgress(p);

      if (p >= 100) {
        clearInterval(interval);
        
        // After reaching 100%, wait a brief period before starting transition
        setTimeout(() => {
          const load = document.getElementById("loading");
          if (load) load.classList.add("hide");
          
          const root = document.getElementById("landing-page-root");
          if (root) root.classList.add("loading-complete");
          
          // Show nav and hero elements
          const mainNav = document.getElementById("main-nav");
          if (mainNav) mainNav.style.opacity = "1";
          
          setTimeout(() => {
            const hl1 = document.getElementById("hl1");
            const hl2 = document.getElementById("hl2");
            if (hl1) hl1.classList.add("show");
            setTimeout(() => {
              if (hl2) hl2.classList.add("show");
              startHeroTerminal();
            }, 200);
          }, 300);
        }, 600);
      }
    }, 25);


    // ── HERO TERMINAL TYPING ──
    function startHeroTerminal() {
      const live = liveDataRef.current;
      const revStr = live.todayRevenue > 0
        ? `₹${Math.round(live.todayRevenue).toLocaleString("en-IN")}`
        : "₹—";
      const prodStr = live.productCount > 0 ? `${live.productCount} products` : "products";
      const lines2 = [
        {
          html: '<span class="ok">✔</span>  <span style="color:var(--muted)">POS Terminal ready — Counter 1, 2, 3</span>',
        },
        {
          html: `<span class="ok">✔</span>  <span style="color:var(--muted)">${prodStr} loaded</span>`,
        },
        {
          html: '<span class="ok">✔</span>  <span style="color:var(--muted)">Gemini AI: Stock forecast updated</span>',
        },
        {
          html: `Today's revenue: <span class="rev" style="color:var(--warn);font-weight:600">${revStr}</span> — ${live.todayTxCount} transactions`,
        },
      ];
      const container = document.getElementById("ht-lines");
      if (!container) return;
      let i = 0;
      function addLine() {
        if (i < lines2.length) {
          const d = document.createElement("div");
          d.className = "ht-line";
          d.style.opacity = "0";
          d.style.transform = "translateX(-8px)";
          d.style.transition = "opacity .3s,transform .3s";
          d.innerHTML = lines2[i].html;
          container.appendChild(d);
          timer = setTimeout(() => {
            d.style.opacity = "1";
            d.style.transform = "translateX(0)";
          }, 30);
          i++;
          timer = setTimeout(addLine, 500);
        }
      }
      timer = setTimeout(addLine, 600);
    }

    // ── CUSTOM CURSOR ──
    const cursor = document.getElementById("cursor");
    const cursorRing = document.getElementById("cursor-ring");
    let mx = 0, my = 0, rx = 0, ry = 0;
    const onMouseMove = (e) => {
      mx = e.clientX;
      my = e.clientY;
    };
    document.addEventListener("mousemove", onMouseMove);

    let cursorAnimId;
    function animateCursor() {
      rx = rx + (mx - rx) * 0.14;
      ry = ry + (my - ry) * 0.14;
      if (cursor) {
        cursor.style.left = mx + "px";
        cursor.style.top = my + "px";
      }
      if (cursorRing) {
        cursorRing.style.left = rx + "px";
        cursorRing.style.top = ry + "px";
      }
      cursorAnimId = requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // ── SCROLL PROGRESS ──
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      const pct = (window.scrollY / max) * 100;
      const fill = document.getElementById("scroll-bar-fill");
      if (fill) fill.style.height = pct + "%";

      const nav = document.getElementById("main-nav");
      if (nav) {
        if (window.scrollY < 50) {
          nav.style.background = "rgba(7,7,15,0)";
        } else {
          nav.style.background = "rgba(7,7,15,0.85)";
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // ── INTERSECTION OBSERVER ──
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("visible");
            // stats counter
            if (en.target.dataset.target) startCounter(en.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    document
      .querySelectorAll(".reveal,.reveal-left,.reveal-right,[data-target]")
      .forEach((el) => io.observe(el));

    // ── COUNTER ANIMATION ──
    function startCounter(el) {
      if (el.dataset.counted) return;
      el.dataset.counted = "1";
      const target = parseFloat(el.dataset.target);
      const prefix = el.dataset.prefix || "";
      const suffix = el.dataset.suffix || "";
      const isFloat = target % 1 !== 0;
      let start = 0;
      const dur = 1800;
      const startTime = performance.now();
      function tick(now) {
        const t = Math.min((now - startTime) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        const val = start + (target - start) * ease;
        el.textContent =
          prefix +
          (isFloat
            ? val.toFixed(1)
            : Math.round(val).toLocaleString("en-IN")) +
          suffix;
        if (t < 1) requestAnimationFrame(tick);
        else
          el.textContent =
            prefix +
            (isFloat
              ? target.toFixed(1)
              : target.toLocaleString("en-IN")) +
            suffix;
      }
      requestAnimationFrame(tick);
    }

    // ── AI TYPING ──
    const aiText = `"Amul Gold Milk demand will spike +42%\nthis Sunday. Current stock: 145 units.\nCovers only 2.8 days at projected rate.\n\nRecommended reorder: 380 units by Friday.\nConfidence: 92%"`;
    let aiStarted = false;
    const aiObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting && !aiStarted) {
            aiStarted = true;
            typeAiText();
          }
        });
      },
      { threshold: 0.3 }
    );
    const aiCard = document.getElementById("ai-insight-card");
    if (aiCard) aiObs.observe(aiCard);

    function typeAiText() {
      const el = document.getElementById("ai-typing-area");
      if (!el) return;
      let i = 0;
      function tick() {
        if (i < aiText.length) {
          const ch = aiText[i];
          if (ch === "\n") {
            el.innerHTML += "<br>";
          } else {
            el.innerHTML += ch;
          }
          i++;
          timer = setTimeout(tick, 28);
        }
      }
      tick();
    }

    // ── DASHBOARD PARALLAX ──
    const dashWrap = document.getElementById("dash-wrap");
    const onMouseMoveParallax = (e) => {
      if (!dashWrap) return;
      const rect = dashWrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      dashWrap.style.transform = `perspective(1200px) rotateX(${
        4 - dy * 3
      }deg) rotateY(${-3 + dx * 4}deg)`;
    };
    document.addEventListener("mousemove", onMouseMoveParallax);

    // ── CTA TERMINAL REVEAL ──
    const ctaObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            ["cta-t1", "cta-t2", "cta-t3", "cta-t4"].forEach((id, i) => {
              timer = setTimeout(() => {
                const el = document.getElementById(id);
                if (el) {
                  el.style.transition = "opacity .4s";
                  el.style.opacity = "1";
                }
              }, 400 + i * 350);
            });
          }
        });
      },
      { threshold: 0.4 }
    );
    const ctaTerm = document.querySelector(".cta-terminal");
    if (ctaTerm) ctaObs.observe(ctaTerm);

    // ── MAGNETIC BUTTONS ──
    const magneticBtns = document.querySelectorAll(
      ".btn-primary, .btn-ghost, .cta-btn"
    );
    const onMagneticMove = (btn) => (e) => {
      const rect = btn.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      btn.style.transform = `translate(${dx * 0.15}px,${dy * 0.15}px)`;
    };
    const onMagneticLeave = (btn) => () => {
      btn.style.transform = "";
    };
    magneticBtns.forEach((btn) => {
      btn.addEventListener("mousemove", onMagneticMove(btn));
      btn.addEventListener("mouseleave", onMagneticLeave(btn));
    });

    // ── PARTICLE CANVAS ──
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
        "rgba(201,168,76,",
        "rgba(232,201,122,",
        "rgba(122,97,48,",
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
          this.alpha =
            (t < 0.1 ? t * 6 : t > 0.8 ? (1 - t) * 5 : 1) * rand(0.15, 0.55);
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
        {
          x: 0.15,
          y: 0.25,
          r: 300,
          col: "rgba(201,168,76,",
          base: 0.06,
          dx: 0.0003,
          dy: 0.0002,
        },
        {
          x: 0.85,
          y: 0.7,
          r: 250,
          col: "rgba(232,201,122,",
          base: 0.05,
          dx: -0.0002,
          dy: 0.0003,
        },
        {
          x: 0.5,
          y: 0.5,
          r: 180,
          col: "rgba(201,168,76,",
          base: 0.03,
          dx: 0.0004,
          dy: -0.0002,
        },
      ];
      let t2 = 0;

      for (let i = 0; i < 160; i++) particles.push(new Particle());

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
              ctx.strokeStyle = `rgba(201,168,76,${(1 - dist / 90) * 0.08})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
        canvasAnimId = requestAnimationFrame(draw);
      }
      draw();
    }

    // CLEANUP
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousemove", onMouseMoveParallax);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(cursorAnimId);
      if (canvasAnimId) cancelAnimationFrame(canvasAnimId);
      io.disconnect();
      aiObs.disconnect();
      ctaObs.disconnect();
      magneticBtns.forEach((btn) => {
        btn.removeEventListener("mousemove", onMagneticMove(btn));
        btn.removeEventListener("mouseleave", onMagneticLeave(btn));
      });
    };
  }, []);

  // Pricing Toggle Logic
  const switchPricing = (isAnnual) => {
    const proPrice = document.getElementById("pro-price");
    const proPeriod = document.getElementById("pro-period");
    const labelMonthly = document.getElementById("label-monthly");
    const labelAnnual = document.getElementById("label-annual");
    const saveBadge = document.getElementById("save-badge");
    if (!proPrice) return;
    if (isAnnual) {
      proPrice.textContent = "2,399";
      if (proPeriod) proPeriod.textContent = "/mo, billed annually";
      if (labelMonthly) labelMonthly.classList.remove("active");
      if (labelAnnual) labelAnnual.classList.add("active");
      if (saveBadge) saveBadge.classList.add("visible");
    } else {
      proPrice.textContent = "2,999";
      if (proPeriod) proPeriod.textContent = "/mo";
      if (labelMonthly) labelMonthly.classList.add("active");
      if (labelAnnual) labelAnnual.classList.remove("active");
      if (saveBadge) saveBadge.classList.remove("visible");
    }
    proPrice.style.transform = "scale(1.15)";
    proPrice.style.color = "var(--alt)";
    proPrice.style.transition = "transform .2s,color .2s";
    setTimeout(() => {
      proPrice.style.transform = "";
      proPrice.style.color = "";
    }, 300);
  };

  const toggleMobileMenu = () => {
    const menu = document.getElementById("mobile-menu");
    const btn = document.getElementById("hamburger-btn");
    if (!menu) return;
    const isOpen = menu.classList.contains("open");
    if (isOpen) {
      menu.classList.remove("open");
      if (btn) btn.classList.remove("open");
      document.body.style.overflow = "";
    } else {
      menu.classList.add("open");
      if (btn) btn.classList.add("open");
      document.body.style.overflow = "hidden";
    }
  };

  const closeMobileMenu = () => {
    const menu = document.getElementById("mobile-menu");
    const btn = document.getElementById("hamburger-btn");
    if (menu) menu.classList.remove("open");
    if (btn) btn.classList.remove("open");
    document.body.style.overflow = "";
    setShowMobileLoginMenu(false);
  };

  const triggerParticles = (e, type = "admin") => {
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
      border:2px solid #C9A84C;
      background:rgba(201, 168, 76, 0.15);
      border-radius:50%;
      pointer-events:none;
      z-index:9999;
      transform:translate(-50%,-50%);
      animation:rippleExpand .6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
    `;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);

    for (let i = 0; i < 20; i++) {
      const p = document.createElement("span");
      p.textContent = syms[Math.floor(Math.random() * syms.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 120;
      p.style.cssText = `
        position:fixed;left:${rect.left + rect.width / 2}px;top:${
        rect.top + rect.height / 2
      }px;
        font-size:${0.6 + Math.random() * 0.8}rem;color:${
        Math.random() > 0.5 ? "#C9A84C" : "#E8C97A"
      };
        pointer-events:none;z-index:9999;
        animation:particleFly .8s ease-out forwards;
        --px:${Math.cos(angle) * dist}px;--py:${Math.sin(angle) * dist}px;
      `;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
    // Perform navigation after a small delay to show particle effect
    setTimeout(() => {
      onGetStarted(type);
    }, 400);
  };

  return (
    <div id="landing-page-root" style={{ background: "#0A0906", color: "#F7F3EC", position: "relative", minHeight: "100vh" }}>
      {/* Dynamic Font and Style injection for Landing Page */}
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{
        __html: `
          #landing-page-root *, #landing-page-root *::before, #landing-page-root *::after { box-sizing: border-box; }
          #landing-page-root {
            --bg: #0A0906; --surf: #1A1610; --surf-alt: #3A342A; --border: rgba(201,168,76,0.18);
            --accent: #C9A84C; --alt: #E8C97A; --danger: #FF4D6D; --warn: #FFB547;
            --text: #F7F3EC; --muted: #8C8070;
            --mono: 'JetBrains Mono', monospace;
            --r: 1rem;
            scroll-behavior: smooth;
            font-family: 'Inter', sans-serif;
            font-size: 16px;
            line-height: 1.6;
            overflow-x: hidden;
          }
          #landing-page-root::before {
            content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
            opacity: 0.6;
          }
          @media(prefers-reduced-motion:reduce){#landing-page-root *{animation:none!important;transition:none!important}}
          #landing-page-root button {
            font-family: inherit;
            font-size: inherit;
            color: inherit;
            background: none;
            border: none;
            padding: 0;
            margin: 0;
            cursor: pointer;
            outline: none;
          }

          /* ── CUSTOM CURSOR ── */
          #cursor {
            position: fixed;
            z-index: 99999;
            pointer-events: none;
            mix-blend-mode: difference;
            width: 10px;
            height: 10px;
            background: var(--text);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: width .3s cubic-bezier(0.16, 1, 0.3, 1), height .3s cubic-bezier(0.16, 1, 0.3, 1), opacity .3s, background .3s;
          }
          #cursor-ring {
            position: fixed;
            z-index: 99998;
            pointer-events: none;
            width: 38px;
            height: 38px;
            border: 1px solid rgba(201, 168, 76, 0.6);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: transform .12s cubic-bezier(0.25, 0.46, 0.45, 0.94), width .4s cubic-bezier(0.16, 1, 0.3, 1), height .4s cubic-bezier(0.16, 1, 0.3, 1), border-color .3s, opacity .3s;
          }
          
          #landing-page-root:has(a:hover) #cursor,
          #landing-page-root:has(button:hover) #cursor,
          #landing-page-root:has(.feat-card:hover) #cursor,
          #landing-page-root:has(.pain-card:hover) #cursor,
          #landing-page-root:has(.testi-card:hover) #cursor,
          #landing-page-root:has(.pricing-card:hover) #cursor {
            width: 22px;
            height: 22px;
            background: var(--accent);
          }
          
          #landing-page-root:has(a:hover) #cursor-ring,
          #landing-page-root:has(button:hover) #cursor-ring,
          #landing-page-root:has(.feat-card:hover) #cursor-ring,
          #landing-page-root:has(.pain-card:hover) #cursor-ring,
          #landing-page-root:has(.testi-card:hover) #cursor-ring,
          #landing-page-root:has(.pricing-card:hover) #cursor-ring {
            width: 56px;
            height: 56px;
            border-color: var(--accent);
            opacity: 0.5;
          }

          /* ── SCROLL PROGRESS ── */
          #scroll-progress{
            position:fixed;right:1.5rem;top:50%;transform:translateY(-50%);
            z-index:900;display:flex;flex-direction:column;align-items:center;gap:.5rem;
          }
          #scroll-progress .sp-label{font-family:var(--mono);font-size:.55rem;color:var(--muted);writing-mode:vertical-rl;letter-spacing:.1em}
          #scroll-bar-track{width:3px;height:120px;background:var(--border);border-radius:4px;position:relative}
          #scroll-bar-fill{width:100%;background:linear-gradient(180deg,var(--accent),var(--alt));border-radius:4px;transition:height .1s;position:absolute;top:0}

          /* ── LIVE TICKER ── */
          #live-ticker{
            position:fixed;bottom:0;left:0;right:0;z-index:800;
            background:rgba(7,7,15,.92);border-top:1px solid var(--border);
            padding:.4rem 0;overflow:hidden;backdrop-filter:blur(12px);
          }
          #ticker-inner{display:flex;gap:2rem;white-space:nowrap;animation:ticker 30s linear infinite}
          .tick-item{font-family:var(--mono);font-size:.7rem;color:var(--muted);display:flex;align-items:center;gap:.5rem}
          .tick-dot{width:6px;height:6px;background:var(--alt);border-radius:50%;animation:pulse2 1.5s ease-in-out infinite}
          @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
          @keyframes pulse2{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}

          /* ── LOADING SCREEN ── */
          #loading {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: #04040a; /* Dark navy/black background */
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            overflow: hidden;
            transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
          }
          #loading.hide {
            opacity: 0;
            transform: scale(2.2);
            pointer-events: none;
          }

          /* ── MAIN WEBSITE CONTENT WRAPPER ── */
          .main-content-wrapper {
            transition: transform 1.4s cubic-bezier(0.16, 1, 0.3, 1), filter 1.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1);
            transform: scale(0.92);
            filter: blur(12px);
            opacity: 0;
            transform-origin: center 30%;
            position: relative;
            z-index: 2;
          }
          .loading-complete .main-content-wrapper {
            transform: scale(1);
            filter: blur(0);
            opacity: 1;
          }

          /* Teal glowing particles in the background */
          .loading-bg-particles {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 1;
          }
          .loading-particle {
            position: absolute;
            width: 150px;
            height: 150px;
            background: radial-gradient(circle, rgba(232, 201, 122, 0.12) 0%, rgba(232, 201, 122, 0) 70%);
            border-radius: 50%;
            filter: blur(20px);
          }
          .loading-particle.p1 { top: 15%; left: 10%; animation: particleFloat 14s infinite alternate ease-in-out; }
          .loading-particle.p2 { bottom: 20%; right: 15%; animation: particleFloat 18s infinite alternate ease-in-out -4s; }
          .loading-particle.p3 { top: 60%; left: 50%; animation: particleFloat 16s infinite alternate ease-in-out -8s; }
          .loading-particle.p4 { bottom: 65%; left: 20%; animation: particleFloat 20s infinite alternate ease-in-out -12s; }
          
          @keyframes particleFloat {
            0% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(40px, -50px) scale(1.2); }
            100% { transform: translate(-30px, 30px) scale(0.9); }
          }

          /* ── AMBIENT FLOATING PRODUCTS ── */
          .floating-product {
            position: absolute;
            bottom: -150px;
            pointer-events: none;
            z-index: 1;
            will-change: transform, opacity;
          }
          .fp-svg {
            width: 48px;
            height: 48px;
          }
          @keyframes floatUp {
            0% {
              transform: translateY(0) rotate(0deg) translateX(0);
              opacity: 0;
            }
            15% {
              opacity: var(--max-opacity, 0.25);
            }
            85% {
              opacity: var(--max-opacity, 0.25);
            }
            100% {
              transform: translateY(-120vh) rotate(360deg) translateX(var(--drift, 40px));
              opacity: 0;
            }
          }

          .fp1 {
            left: 8%;
            color: var(--accent);
            --max-opacity: 0.25;
            --drift: -35px;
            filter: drop-shadow(0 0 10px rgba(201, 168, 76, 0.6)) blur(2px);
            animation: floatUp 22s linear infinite;
            animation-delay: 0s;
            transform: scale(0.85);
          }
          .fp2 {
            left: 20%;
            color: var(--alt);
            --max-opacity: 0.2;
            --drift: 45px;
            filter: drop-shadow(0 0 8px rgba(232, 201, 122, 0.5)) blur(4px);
            animation: floatUp 28s linear infinite;
            animation-delay: -5s;
            transform: scale(0.65);
          }
          .fp3 {
            left: 33%;
            color: var(--accent);
            --max-opacity: 0.22;
            --drift: -25px;
            filter: drop-shadow(0 0 10px rgba(201, 168, 76, 0.5)) blur(1px);
            animation: floatUp 25s linear infinite;
            animation-delay: -12s;
            transform: scale(0.75);
          }
          .fp4 {
            left: 48%;
            color: var(--alt);
            --max-opacity: 0.18;
            --drift: 30px;
            filter: drop-shadow(0 0 8px rgba(232, 201, 122, 0.4)) blur(5px);
            animation: floatUp 32s linear infinite;
            animation-delay: -2s;
            transform: scale(0.55);
          }
          .fp5 {
            left: 62%;
            color: var(--accent);
            --max-opacity: 0.25;
            --drift: -40px;
            filter: drop-shadow(0 0 12px rgba(201, 168, 76, 0.6)) blur(0px);
            animation: floatUp 19s linear infinite;
            animation-delay: -8s;
            transform: scale(0.95);
          }
          .fp6 {
            left: 78%;
            color: var(--alt);
            --max-opacity: 0.2;
            --drift: 35px;
            filter: drop-shadow(0 0 8px rgba(232, 201, 122, 0.5)) blur(3px);
            animation: floatUp 26s linear infinite;
            animation-delay: -15s;
            transform: scale(0.7);
          }
          .fp7 {
            left: 14%;
            color: var(--accent);
            --max-opacity: 0.22;
            --drift: 40px;
            filter: drop-shadow(0 0 10px rgba(201, 168, 76, 0.5)) blur(2px);
            animation: floatUp 24s linear infinite;
            animation-delay: -18s;
            transform: scale(0.8);
          }
          .fp8 {
            left: 42%;
            color: var(--alt);
            --max-opacity: 0.25;
            --drift: -30px;
            filter: drop-shadow(0 0 10px rgba(232, 201, 122, 0.6)) blur(1px);
            animation: floatUp 20s linear infinite;
            animation-delay: -6s;
            transform: scale(0.9);
          }
          .fp9 {
            left: 56%;
            color: var(--accent);
            --max-opacity: 0.15;
            --drift: 50px;
            filter: drop-shadow(0 0 6px rgba(201, 168, 76, 0.4)) blur(6px);
            animation: floatUp 35s linear infinite;
            animation-delay: -10s;
            transform: scale(0.5);
          }
          .fp10 {
            left: 88%;
            color: var(--alt);
            --max-opacity: 0.23;
            --drift: -35px;
            filter: drop-shadow(0 0 12px rgba(232, 201, 122, 0.5)) blur(1.5px);
            animation: floatUp 23s linear infinite;
            animation-delay: -3s;
            transform: scale(0.85);
          }
 
          .load-logo {
            font-family: 'Syne', sans-serif;
            font-size: 2.5rem;
            font-weight: 800;
            color: var(--text);
            margin-bottom: 2.5rem;
            display: flex;
            align-items: center;
            gap: .75rem;
            z-index: 2;
            text-shadow: 0 0 40px rgba(201, 168, 76, 0.4);
          }
          .load-logo span {
            color: var(--accent);
          }
 
          /* Loading Card Container with Blur Glow */
          .loading-card-wrap {
            position: relative;
            z-index: 2;
            width: 640px;
            max-width: 95vw;
          }
          .loading-card-glow {
            position: absolute;
            inset: -20px;
            background: radial-gradient(circle, rgba(201, 168, 76, 0.15) 0%, rgba(232, 201, 122, 0.05) 50%, transparent 100%);
            filter: blur(30px);
            z-index: -1;
            pointer-events: none;
          }
          .loading-glass-card {
            background: rgba(26, 22, 16, 0.6);
            border: 1px solid rgba(201, 168, 76, 0.18);
            border-radius: 1.25rem;
            padding: 3rem 2.5rem;
            backdrop-filter: blur(25px);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.05);
            display: flex;
            flex-direction: column;
          }

          /* Outer area to align character track to the left, matching the progress bar underneath */
          .loading-track-outer {
            width: 100%;
            display: flex;
            justify-content: flex-start;
          }

          /* Track area where character moves */
          .loading-track-area {
            position: relative;
            height: 210px;
            width: 340px;
            margin-bottom: 0.75rem;
          }
          .loading-character-container {
            position: absolute;
            bottom: 0;
            width: 220px;
            height: 190px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            transition: left 0.12s linear;
            overflow: hidden;
            border-radius: 12px;
          }
          .loading-character-img {
            width: 100%;
            height: auto;
            max-height: 185px;
            object-fit: cover;
            animation: walkBounce 0.55s ease-in-out infinite alternate;
            transform-origin: bottom center;
            mix-blend-mode: screen;
            filter: brightness(1.15) drop-shadow(0 8px 24px rgba(201, 168, 76, 0.5));
          }
          .loading-character-shadow {
            width: 100px;
            height: 8px;
            background: radial-gradient(ellipse, rgba(232, 201, 122, 0.5) 0%, transparent 75%);
            border-radius: 50%;
            filter: blur(3px);
            margin-top: 4px;
            animation: shadowScale 0.55s ease-in-out infinite alternate;
          }

          @keyframes walkBounce {
            0% {
              transform: translateY(0px);
            }
            50% {
              transform: translateY(-5px);
            }
            100% {
              transform: translateY(0px);
            }
          }
          @keyframes shadowScale {
            0% {
              transform: scale(1);
              opacity: 0.6;
            }
            50% {
              transform: scale(0.85);
              opacity: 0.3;
            }
            100% {
              transform: scale(1);
              opacity: 0.6;
            }
          }

          /* Progress Bar and Status row styling */
          .loading-progress-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            gap: 1.5rem;
          }
          .loading-progress-track {
            height: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            position: relative;
            width: 320px;
            flex-shrink: 0;
            overflow: visible;
          }
          .loading-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--accent), var(--alt));
            border-radius: 4px;
            transition: width 0.1s linear;
            box-shadow: 0 0 12px rgba(201, 168, 76, 0.5);
          }
          .loading-progress-tip-glow {
            position: absolute;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 16px;
            height: 16px;
            background: var(--alt);
            border-radius: 50%;
            filter: blur(4px);
            box-shadow: 0 0 10px var(--alt), 0 0 20px var(--accent);
            pointer-events: none;
            transition: left 0.1s linear;
          }

          /* Status Text Styling */
          .loading-status-text {
            font-family: var(--mono);
            font-size: 0.9rem;
            color: #fff;
            display: flex;
            align-items: center;
            white-space: nowrap;
          }
          .loading-pct {
            font-weight: 700;
            color: #fff;
          }
          .cursor-blink {
            color: var(--alt);
            font-weight: bold;
            animation: blink 0.7s step-end infinite;
            margin-left: 4px;
          }
          @keyframes blink {
            50% { opacity: 0; }
          }

          @media (max-width: 640px) {
            .loading-card-wrap {
              width: 90vw;
            }
            .loading-glass-card {
              padding: 2rem 1.5rem;
            }
            .loading-progress-row {
              flex-direction: column;
              align-items: stretch;
              gap: 1rem;
            }
            .loading-progress-track, .loading-track-area {
              width: 100%;
            }
            .loading-status-text {
              justify-content: center;
            }
          }

          /* ── NAV ── */
          #landing-page-root nav{
            position:fixed;top:0;left:0;right:0;z-index:700;
            display:flex;align-items:center;justify-content:space-between;
            padding:.9rem 3rem;
            background:rgba(7,7,15,.7);backdrop-filter:blur(16px);
            border-bottom:1px solid rgba(42,42,53,.5);
            transition:opacity .5s;
          }
          .nav-logo{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:var(--text);display:flex;align-items:center;gap:.4rem}
          .nav-logo .dot{color:var(--accent)}
          .nav-links{display:flex;gap:2rem}
          .nav-links a{font-size:.85rem;color:var(--muted);text-decoration:none;position:relative;transition:color .2s}
          .nav-links a::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:1px;background:var(--accent);transition:width .2s}
          .nav-links a:hover{color:var(--text)}
          .nav-links a:hover::after{width:100%}
          .nav-cta{
            background:#07070F;color:#fff;font-size:.8rem;font-weight:600;
            padding:.45rem 1.1rem;border-radius:6px;text-decoration:none;
            border:1px solid rgba(201,168,76,0.4);
            box-shadow:0 4px 15px rgba(201,168,76,0.25);
            transition:background .2s,box-shadow .2s,border-color .2s,transform .2s;
          }
          .nav-cta:hover{
            background:rgba(201,168,76,0.15);
            border-color:rgba(201,168,76,0.8);
            box-shadow:0 0 20px rgba(201,168,76,.55);
            transform:translateY(-1px);
          }

          /* ── SECTIONS ── */
          #landing-page-root section{position:relative;z-index:1}

          /* ── HERO ── */
          #hero{
            min-height:100vh;display:flex;flex-direction:column;justify-content:center;
            align-items:center;text-align:center;padding:8rem 2rem 6rem;
            overflow:hidden;
          }
          .hero-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
          .hero-orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.18}
          .hero-orb.v{width:600px;height:600px;background:var(--accent);top:-200px;left:-100px;animation:orbDrift 12s ease-in-out infinite}
          .hero-orb.m{width:400px;height:400px;background:var(--alt);bottom:-150px;right:-80px;animation:orbDrift 15s ease-in-out infinite reverse}
          @keyframes orbDrift{0%,100%{transform:translate(0,0)}50%{transform:translate(40px,30px)}}
          .float-debris{position:absolute;pointer-events:none;font-size:1rem;color:rgba(201,168,76,.25);animation:debris var(--dur,20s) linear infinite;font-family:var(--mono)}
          @keyframes debris{0%{transform:translate(0,0) rotate(0deg);opacity:.1}50%{opacity:.3}100%{transform:translate(var(--dx,20px),var(--dy,-400px)) rotate(var(--dr,180deg));opacity:0}}

          .hero-eyebrow{font-family:var(--mono);font-size:.7rem;color:var(--alt);letter-spacing:.2em;text-transform:uppercase;margin-bottom:1.5rem;opacity:0;animation:fadeUp .6s .5s ease forwards}
          .hero-h1{font-family:'Syne',sans-serif;font-size:clamp(3rem,7vw,6rem);font-weight:800;line-height:1;margin-bottom:1rem;overflow:hidden}
          .hero-h1 .line{display:block;opacity:0;transform:translateX(-60px);transition:opacity .7s,transform .7s}
          .hero-h1 .line:nth-child(2){transform:translateX(60px)}
          .hero-h1 .line.show{opacity:1;transform:translateX(0)}
          .hero-h1 .acc{color:var(--accent)}
          .hero-sub{font-size:1rem;color:var(--muted);max-width:560px;margin:0 auto 2.5rem;opacity:0;animation:fadeUp .7s 1.2s ease forwards;line-height:1.7}
          @keyframes fadeUp{0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)}}

          .hero-terminal{
            background:var(--surf);border:1px solid var(--border);border-radius:.75rem;
            padding:1.2rem 1.5rem;max-width:500px;width:100%;text-align:left;
            font-family:var(--mono);font-size:.75rem;margin:0 auto 2.5rem;
            box-shadow:0 0 40px rgba(201, 168, 76, .12);
            opacity:0;animation:fadeUp .7s 1.5s ease forwards;
          }
          .ht-line{margin-bottom:.3rem;color:var(--muted)}
          .ht-line .cmd{color:var(--alt)}
          .ht-line .flag{color:var(--accent)}
          .ht-line .ok{color:var(--alt)}
          .ht-line .rev{color:var(--warn);font-weight:600}

          .hero-btns{display:flex;gap:1rem;justify-content:center;opacity:0;animation:fadeUp .7s 1.8s ease forwards;flex-wrap:wrap}
          .btn-primary{
            background:#07070F;color:#fff;font-weight:600;font-size:.9rem;
            padding:.75rem 1.8rem;border-radius:8px;text-decoration:none;
            border:1px solid rgba(201,168,76,0.4);
            animation:levitate 3s ease-in-out infinite;
            box-shadow:0 4px 20px rgba(201,168,76,0.3);
            transition:background .2s,box-shadow .2s,border-color .2s,transform .2s;
            cursor: pointer;
          }
          .btn-primary:hover{
            background:rgba(201,168,76,0.15);
            border-color:rgba(201,168,76,0.8);
            box-shadow:0 6px 30px rgba(201,168,76,.65);
            transform:translateY(-1px);
          }
          .btn-ghost{
            background:transparent;color:var(--text);font-size:.9rem;font-weight:500;
            padding:.75rem 1.8rem;border-radius:8px;border:1px solid var(--border);
            text-decoration:none;
            animation:ghostPulse 3s ease-in-out infinite 1.5s;
            transition:border-color .2s,color .2s;
            cursor: pointer;
          }
          .btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
          @keyframes levitate{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
          @keyframes ghostPulse{0%,100%{box-shadow:0 0 0 rgba(201,168,76,0)}50%{box-shadow:0 0 20px rgba(201,168,76,.2)}}

          /* ── REVEAL ANIMATIONS ── */
          .reveal{opacity:0;transform:translateY(30px);transition:opacity .7s,transform .7s}
          .reveal.visible{opacity:1;transform:translateY(0)}
          .reveal-left{opacity:0;transform:translateX(-40px);transition:opacity .7s,transform .7s}
          .reveal-left.visible{opacity:1;transform:translateX(0)}
          .reveal-right{opacity:0;transform:translateX(40px);transition:opacity .7s,transform .7s}
          .reveal-right.visible{opacity:1;transform:translateX(0)}

          /* ── SECTION COMMON ── */
          .section-pad{padding:7rem 2rem}
          .section-center{max-width:1100px;margin:0 auto}
          .section-eyebrow{font-family:var(--mono);font-size:.65rem;color:var(--alt);letter-spacing:.25em;text-transform:uppercase;margin-bottom:1rem}
          .section-title{font-family:'Syne',sans-serif;font-size:clamp(2rem,4vw,3.2rem);font-weight:800;line-height:1.1;margin-bottom:1.5rem}
          .section-sub{color:var(--muted);max-width:540px;line-height:1.7}
          .accent-text{color:var(--accent)}
          .alt-text{color:var(--alt)}
          .divider{width:60px;height:3px;background:linear-gradient(90deg,var(--accent),var(--alt));border-radius:4px;margin:1.5rem 0}

          /* ── PROBLEM ── */
          #problem{background:linear-gradient(180deg,var(--bg),var(--surf) 50%,var(--bg))}
          .pain-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.5rem;margin:3rem 0}
          .pain-card{
            background:var(--surf-alt);border:1px solid var(--border);border-radius:.75rem;
            padding:2rem;position:relative;overflow:hidden;
            transition:transform .3s,box-shadow .3s;
          }
          .pain-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(0,0,0,.4)}
          .pain-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--danger),transparent)}
          .pain-emoji{font-size:2.5rem;margin-bottom:1rem}
          .pain-card h3{font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:var(--danger);margin-bottom:.5rem}
          .pain-card p{font-size:.85rem;color:var(--muted);line-height:1.6}
          .pain-cta{text-align:center;margin-top:2rem;font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:700}

          /* ── FEATURES ── */
          #features{background:var(--bg)}
          .features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.5rem;margin-top:3rem}
          .feat-card{
            background:var(--surf);border:1px solid var(--border);border-radius:.75rem;
            padding:2rem;position:relative;overflow:hidden;
            transition:transform .3s,box-shadow .3s,border-color .3s;
          }
          .feat-card:hover{transform:translateY(-8px);box-shadow:0 24px 60px rgba(0,0,0,.5);border-color:var(--accent)}
          .feat-icon{font-size:2.5rem;margin-bottom:1.2rem;display:inline-block;animation:bob var(--bob,3s) ease-in-out infinite}
          @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
          .feat-card h3{font-family:'Syne',sans-serif;font-size:1.05rem;font-weight:700;margin-bottom:.5rem}
          .feat-card p{font-size:.82rem;color:var(--muted);line-height:1.6}
          .feat-tag{display:inline-block;font-family:var(--mono);font-size:.6rem;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:.15rem .5rem;margin-top:.75rem;opacity:.7}

          /* ── HOW IT WORKS ── */
          #how{background:linear-gradient(180deg,var(--bg),var(--surf) 50%,var(--bg))}
          .steps-row{display:flex;gap:0;margin-top:3rem;position:relative;flex-wrap:wrap;justify-content:center}
          .step-card{
            flex:1;min-width:200px;max-width:320px;
            background:var(--surf-alt);border:1px solid var(--border);border-radius:.75rem;
            padding:2rem;text-align:center;position:relative;
            transition:transform .3s;
          }
          .step-card:nth-child(2){transform:translateY(20px)}
          .step-card:hover{transform:translateY(-6px)!important}
          .step-num{font-family:var(--mono);font-size:.65rem;color:var(--muted);letter-spacing:.15em;margin-bottom:.75rem}
          .step-icon{font-size:2.8rem;margin-bottom:1rem}
          .step-card h3{font-family:'Syne',sans-serif;font-size:.95rem;font-weight:700;margin-bottom:.6rem}
          .step-card p{font-size:.8rem;color:var(--muted);line-height:1.6}
          .step-arrow{
            display:flex;align-items:center;justify-content:center;
            color:var(--accent);font-size:1.2rem;padding:1rem;
            align-self:center;
          }

          /* ── DASHBOARD PREVIEW ── */
          #dashboard{
            background:var(--bg);
            text-align:center;
          }
          .dash-wrap{
            position:relative;display:inline-block;margin-top:3rem;
            animation:dashFloat 6s ease-in-out infinite;
            filter:drop-shadow(0 0 60px rgba(201,168,76,.25));
            max-width:900px;width:100%;
          }
          @keyframes dashFloat{0%,100%{transform:perspective(1200px) rotateX(4deg) rotateY(-3deg)}50%{transform:perspective(1200px) rotateX(2deg) rotateY(3deg)}}
          .dash-mock{
            background:var(--surf);border:1px solid var(--border);border-radius:1rem;
            overflow:hidden;font-family:var(--mono);font-size:.7rem;
            box-shadow:0 30px 80px rgba(0,0,0,.6);
          }
          .dash-topbar{background:var(--surf-alt);padding:.6rem 1rem;display:flex;align-items:center;gap:.5rem;border-bottom:1px solid var(--border)}
          .dash-dot{width:10px;height:10px;border-radius:50%}
          .dash-title-bar{font-size:.65rem;color:var(--muted);margin-left:.5rem}
          .dash-body{display:flex}
          .dash-sidebar{
            width:140px;background:rgba(26,22,16,.8);padding:1rem .75rem;
            border-right:1px solid var(--border);display:flex;flex-direction:column;gap:.4rem;
            flex-shrink:0;
          }
          .dash-nav-item{
            padding:.4rem .6rem;border-radius:6px;font-size:.65rem;color:var(--muted);
            display:flex;align-items:center;gap:.4rem;
          }
          .dash-nav-item.active{background:rgba(201,168,76,.15);color:var(--accent)}
          .dash-main{flex:1;padding:1rem;min-height:260px}
          .dash-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:.8rem}
          .kpi-card{
            background:var(--surf-alt);border:1px solid var(--border);border-radius:6px;
            padding:.6rem;
          }
          .kpi-label{font-size:.55rem;color:var(--muted);margin-bottom:.2rem}
          .kpi-val{font-size:.9rem;font-weight:600;color:var(--text)}
          .kpi-val .up{color:var(--alt);font-size:.6rem}
          .dash-charts{display:grid;grid-template-columns:2fr 1fr;gap:.6rem}
          .chart-box{background:var(--surf-alt);border:1px solid var(--border);border-radius:6px;padding:.6rem;height:90px;position:relative;overflow:hidden}
          .chart-label{font-size:.55rem;color:var(--muted);margin-bottom:.3rem}
          .sparkline{position:absolute;bottom:0;left:0;right:0;height:55px}
          .pie-chart{width:60px;height:60px;border-radius:50%;margin:0 auto;background:conic-gradient(var(--accent) 0 55%,var(--alt) 55% 78%,var(--warn) 78% 100%)}
          .dash-annotation{
            position:absolute;background:var(--surf);border:1px solid var(--accent);
            border-radius:6px;padding:.3rem .6rem;font-family:var(--mono);font-size:.55rem;
            color:var(--accent);white-space:nowrap;
            animation:annPulse 2.5s ease-in-out infinite;
          }
          @keyframes annPulse{0%,100%{box-shadow:0 0 0 rgba(201,168,76,0)}50%{box-shadow:0 0 12px rgba(201,168,76,.4)}}
          .ann-arrow{color:var(--accent);font-size:.8rem}
          .dash-caption{margin-top:2rem;color:var(--muted);font-family:var(--mono);font-size:.8rem}

          /* ── AI SPOTLIGHT ── */
          #ai-spot{
            background:var(--bg);position:relative;overflow:hidden;
          }
          #ai-spot::before{
            content: ''; position: absolute; inset: 0; pointer-events: none;
            background-image: radial-gradient(circle at 1px 1px,rgba(201,168,76,.08) 1px,transparent 0);
            background-size: 32px 32px;
          }
          .ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:4rem;align-items:center}
          .ai-card{
            background:var(--surf);border:1px solid var(--accent);border-radius:.75rem;
            padding:1.8rem;font-family:var(--mono);font-size:.78rem;
            animation:aiGlow 3s ease-in-out infinite;
            position:relative;
          }
          @keyframes aiGlow{0%,100%{box-shadow:0 0 0 rgba(201,168,76,0),0 0 30px rgba(201,168,76,.08)}50%{box-shadow:0 0 20px rgba(201,168,76,.25),0 0 50px rgba(201,168,76,.12)}}
          .ai-header{display:flex;align-items:center;gap:.5rem;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--border)}
          .ai-badge{font-size:.6rem;color:var(--bg);background:var(--alt);padding:.2rem .5rem;border-radius:4px;font-weight:600}
          .ai-body{color:var(--text);line-height:1.8}
          .ai-body .hi{color:var(--warn)}
          .ai-body .conf{color:var(--alt)}
          .ai-body .rec{color:var(--accent)}
          .restock-table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:.72rem}
          .restock-table th{color:var(--muted);font-weight:500;padding:.4rem .6rem;border-bottom:1px solid var(--border);text-align:left}
          .restock-table td{padding:.4rem .6rem;border-bottom:1px solid rgba(42,42,53,.5);color:var(--text)}
          .badge{display:inline-block;font-size:.55rem;padding:.15rem .4rem;border-radius:4px;font-weight:600}
          .badge.high{background:rgba(255,77,109,.15);color:var(--danger)}
          .badge.med{background:rgba(255,181,71,.15);color:var(--warn)}
          .badge.low{background:rgba(232,201,122,.15);color:var(--alt)}
          .ai-headline{font-family:'Syne',sans-serif;font-size:clamp(2rem,3.5vw,2.8rem);font-weight:800;line-height:1.1;margin-bottom:1.5rem}

          /* ── STATS ── */
          #stats{
            background:linear-gradient(135deg,rgba(201,168,76,.06),rgba(232,201,122,.04));
            border-top:1px solid var(--border);border-bottom:1px solid var(--border);
          }
          .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2rem;text-align:center}
          .stat-item{padding:2rem 1rem;position:relative}
          .stat-number{font-family:var(--mono);font-size:clamp(2rem,4vw,3rem);font-weight:600;color:var(--text);display:block;position:relative}
          .stat-number::after{content:'';position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle,rgba(201,168,76,.1),transparent 70%);pointer-events:none}
          .stat-label{font-family:var(--mono);font-size:.65rem;color:var(--muted);letter-spacing:.1em;margin-top:.5rem}
          .stat-sublabel{font-size:.7rem;color:var(--muted);opacity:.6;margin-top:.2rem}

          /* ── TESTIMONIALS ── */
          #testimonials{background:var(--bg);overflow:hidden}
          .testi-track{display:flex;gap:1.5rem;animation:testimScroll 25s linear infinite;width:max-content}
          #testimonials:hover .testi-track{animation-play-state:paused}
          @keyframes testimScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
          .testi-card{
            background:var(--surf);border:1px solid var(--border);border-radius:.75rem;
            padding:1.8rem;width:320px;flex-shrink:0;
            transition:transform .3s,border-color .3s;
          }
          .testi-card:hover{transform:translateY(-6px);border-color:var(--accent)}
          .testi-quote{font-size:.88rem;line-height:1.7;color:var(--text);margin-bottom:1.2rem}
          .testi-quote .highlight{color:var(--alt);font-weight:600}
          .testi-author{font-family:var(--mono);font-size:.7rem;color:var(--muted)}
          .testi-store{font-family:var(--mono);font-size:.62rem;color:var(--accent);margin-top:.2rem}
          .stars{color:var(--warn);font-size:.8rem;margin-bottom:.75rem}

          /* ── PRICING ── */
          #pricing{background:var(--bg)}
          .pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem;margin-top:3rem;align-items:start}
          .pricing-card{
            background:var(--surf);border:1px solid var(--border);border-radius:.75rem;
            padding:2rem;position:relative;
            transition:transform .3s,box-shadow .3s;
          }
          .pricing-card:hover{transform:scale(1.03);box-shadow:0 20px 60px rgba(0,0,0,.5)}
          .pricing-card.featured{
            border-color:var(--accent);
            box-shadow:0 0 40px rgba(201,168,76,.15);
            transform:translateY(-10px);
          }
          .pricing-card.featured:hover{transform:translateY(-16px) scale(1.02)}
          .popular-badge{
            position:absolute;top:-1px;left:50%;transform:translateX(-50%);
            background:var(--accent);color:#fff;font-family:var(--mono);font-size:.6rem;
            padding:.25rem .75rem;border-radius:0 0 8px 8px;white-space:nowrap;
            animation:levitate 3s ease-in-out infinite;
          }
          .plan-name{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;margin-bottom:.5rem}
          .plan-price{font-family:var(--mono);font-size:2rem;font-weight:600;color:var(--text);margin-bottom:1.2rem}
          .plan-price .curr{font-size:1rem;color:var(--muted);vertical-align:top;margin-top:.4rem;display:inline-block}
          .plan-price .period{font-size:.7rem;color:var(--muted)}
          .plan-price.free-price{color:var(--alt)}
          .plan-feature{font-size:.82rem;color:var(--muted);padding:.35rem 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:.5rem}
          .plan-feature::before{content:'✓';color:var(--alt);font-weight:700;flex-shrink:0}
          .plan-btn{display:block;width:100%;text-align:center;padding:.65rem;border-radius:8px;font-size:.85rem;font-weight:600;text-decoration:none;margin-top:1.5rem;transition:background .2s,box-shadow .2s;cursor:pointer}
          .plan-btn.primary{background:var(--accent);color:#fff}
          .plan-btn.primary:hover{box-shadow:0 0 25px rgba(201,168,76,.5)}
          .plan-btn.ghost{border:1px solid var(--border);color:var(--muted)}
          .plan-btn.ghost:hover{border-color:var(--accent);color:var(--accent)}

          /* ── TERMINAL CTA ── */
          #terminal-cta{
            background:linear-gradient(180deg,var(--bg),var(--surf));
            text-align:center;
          }
          .cta-terminal{
            background:var(--surf);border:1px solid var(--border);border-radius:.75rem;
            padding:2rem;max-width:600px;margin:2rem auto;text-align:left;
            font-family:var(--mono);font-size:.8rem;
            box-shadow:0 0 60px rgba(201,168,76,.15);
          }
          .cta-line{color:var(--muted);margin-bottom:.4rem}
          .cta-line .ok{color:var(--alt)}
          .cta-line .cmd{color:var(--accent)}
          .cta-line .val{color:var(--warn)}
          .cta-btn{
            display:inline-block;background:var(--accent);color:#fff;font-size:1rem;font-weight:700;
            padding:1rem 2.5rem;border-radius:10px;text-decoration:none;
            animation:levitate 3s ease-in-out infinite;
            box-shadow:0 8px 40px rgba(201,168,76,.4);
            transition:box-shadow .2s;border:none;
            position:relative;overflow:hidden;
            cursor:pointer;
          }
          .cta-btn:hover{box-shadow:0 12px 60px rgba(201,168,76,.7)}

          /* ── NAV DROPDOWN MENU ── */
          .nav-dropdown-menu {
            position: absolute;
            top: calc(100% + 12px);
            right: 0;
            width: 280px;
            background: rgba(26, 22, 16, 0.95);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 30px rgba(201, 168, 76, 0.1);
            backdrop-filter: blur(20px);
            z-index: 10000;
            animation: dropdownFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes dropdownFadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .nav-dropdown-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            border-radius: 8px;
            background: transparent;
            border: none;
            color: var(--text);
            cursor: pointer;
            transition: all 0.2s ease;
            width: 100%;
          }
          .nav-dropdown-item:hover {
            background: rgba(255, 255, 255, 0.03);
          }
          .nav-dropdown-item.admin:hover {
            border-left: 3px solid var(--accent);
            padding-left: 11px;
            background: rgba(201, 168, 76, 0.05);
          }
          .nav-dropdown-item.staff:hover {
            border-left: 3px solid var(--alt);
            padding-left: 11px;
            background: rgba(232, 201, 122, 0.05);
          }
          .nav-dropdown-item.customer:hover {
            border-left: 3px solid var(--warn);
            padding-left: 11px;
            background: rgba(255, 181, 71, 0.05);
          }
          .nav-dropdown-item .icon {
            font-size: 1.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            border: 1px solid var(--border);
            transition: transform 0.2s ease;
          }
          .nav-dropdown-item:hover .icon {
            transform: scale(1.1);
          }
          .nav-dropdown-item .title {
            font-family: 'Syne', sans-serif;
            font-size: 0.9rem;
            font-weight: 700;
            margin-bottom: 2px;
            color: var(--text);
          }
          .nav-dropdown-item .desc {
            font-size: 0.72rem;
            color: var(--muted);
          }

          /* ── LOGIN SECTION ── */
          #login-section {
            background: linear-gradient(180deg, var(--bg) 0%, var(--surf) 100%);
            position: relative;
            z-index: 10;
          }
          .login-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            margin-top: 3.5rem;
            align-items: stretch;
          }
          .login-card {
            background: var(--surf-alt);
            border: 1px solid var(--border);
            border-radius: 1rem;
            padding: 2.5rem 2rem;
            text-align: center;
            position: relative;
            transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
          }
          .login-card:hover {
            transform: translateY(-8px);
            border-color: var(--accent);
            box-shadow: 0 10px 30px rgba(201, 168, 76, 0.15);
          }
          .login-card.staff:hover {
            border-color: var(--alt);
            box-shadow: 0 10px 30px rgba(232, 201, 122, 0.15);
          }
          .login-card.customer:hover {
            border-color: var(--warn);
            box-shadow: 0 10px 30px rgba(255, 181, 71, 0.15);
          }
          .login-card-icon {
            font-size: 3rem;
            margin-bottom: 1.5rem;
            filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));
            transition: transform 0.3s;
          }
          .login-card:hover .login-card-icon {
            transform: scale(1.15) rotate(5deg);
          }
          .login-card-title {
            font-family: 'Syne', sans-serif;
            font-size: 1.4rem;
            font-weight: 700;
            margin-bottom: 0.75rem;
            color: var(--text);
          }
          .login-card-desc {
            font-size: 0.9rem;
            color: var(--muted);
            line-height: 1.5;
            margin-bottom: 2rem;
            flex-grow: 1;
          }
          .login-card-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            background: black;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 0.85rem 1.5rem;
            font-weight: 700;
            font-size: 0.95rem;
            color: var(--text);
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .login-card-btn:hover {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
            box-shadow: 0 0 15px rgba(201, 168, 76, 0.4);
          }
          .login-card.staff .login-card-btn:hover {
            background: var(--alt);
            border-color: var(--alt);
            color: black;
            box-shadow: 0 0 15px rgba(232, 201, 122, 0.4);
          }
          .login-card.customer .login-card-btn:hover {
            background: var(--warn);
            border-color: var(--warn);
            color: black;
            box-shadow: 0 0 15px rgba(255, 181, 71, 0.4);
          }

          /* ── FOOTER ── */
          #landing-page-root footer{
            background:var(--surf);border-top:1px solid var(--border);
            padding:3rem 2rem 5rem;
          }
          .footer-inner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:2rem;align-items:start}
          .footer-brand{display:flex;flex-direction:column;gap:.75rem}
          .footer-logo{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;display:flex;align-items:center;gap:.4rem}
          .footer-tagline{font-size:.82rem;color:var(--muted);line-height:1.5}
          .footer-sub{font-family:var(--mono);font-size:.6rem;color:var(--muted);opacity:.6;margin-top:.5rem}
          .footer-links h4{font-family:'Syne',sans-serif;font-size:.8rem;font-weight:700;margin-bottom:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
          .footer-links a{display:block;font-size:.82rem;color:var(--muted);text-decoration:none;margin-bottom:.4rem;transition:color .2s}
          .footer-links a:hover{color:var(--accent)}
          .footer-made{font-family:var(--mono);font-size:.65rem;color:var(--muted);margin-top:2rem;text-align:center;max-width:1100px;margin:2rem auto 0;padding-top:1.5rem;border-top:1px solid var(--border);opacity:.7}
          .footer-tech{display:flex;justify-content:center;gap:.5rem;margin-top:.5rem;flex-wrap:wrap}
          .tech-badge{font-family:var(--mono);font-size:.55rem;border:1px solid var(--border);border-radius:4px;padding:.2rem .5rem;color:var(--muted)}

          /* ── PARTICLE CANVAS ── */
          #particle-canvas{position:fixed;inset:0;z-index:0;pointer-events:none}

          /* ── HAMBURGER MENU ── */
          .hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;padding:.4rem;background:none;border:none;z-index:710}
          .hamburger span{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;transition:transform .3s,opacity .3s}
          .hamburger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
          .hamburger.open span:nth-child(2){opacity:0}
          .hamburger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
          .mobile-menu{
            display:none;position:fixed;inset:0;z-index:690;
            background:rgba(7,7,15,.97);backdrop-filter:blur(20px);
            flex-direction:column;align-items:center;justify-content:center;gap:2.5rem;
            opacity:0;transform:translateY(-20px);
            transition:opacity .3s,transform .3s;
          }
          .mobile-menu.open{opacity:1;transform:translateY(0)}
          .mobile-menu a{
            font-family:'Syne',sans-serif;font-size:2rem;font-weight:700;color:var(--text);
            text-decoration:none;position:relative;transition:color .2s;
          }
          .mobile-menu a::after{content:'';position:absolute;bottom:-4px;left:0;width:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--alt));transition:width .3s}
          .mobile-menu a:hover{color:var(--accent)}
          .mobile-menu a:hover::after{width:100%}
          .mobile-menu-cta{
            background:var(--accent);color:#fff!important;font-size:1.1rem!important;
            padding:.65rem 2rem;border-radius:8px;
            box-shadow:0 0 30px rgba(201,168,76,.4);
          }
          .mobile-menu-cta::after{display:none!important}
          @media(max-width:768px){
            .hamburger{display:flex}
            .nav-links{display:none!important}
            .nav-cta{display:none}
            .mobile-menu{display:flex}
          }

          /* ── PRICING TOGGLE ── */
          .pricing-toggle-wrap{display:flex;align-items:center;justify-content:center;gap:1rem;margin-bottom:2.5rem}
          .toggle-label{font-family:var(--mono);font-size:.8rem;color:var(--muted);transition:color .2s}
          .toggle-label.active{color:var(--text)}
          .toggle-switch{position:relative;width:52px;height:28px;cursor:pointer}
          .toggle-switch input{opacity:0;width:0;height:0}
          .toggle-slider{
            position:absolute;inset:0;background:var(--border);border-radius:28px;
            transition:background .3s;
          }
          .toggle-slider::before{
            content:'';position:absolute;width:20px;height:20px;left:4px;bottom:4px;
            background:#fff;border-radius:50%;transition:transform .3s;
          }
          .toggle-switch input:checked + .toggle-slider{background:linear-gradient(90deg,var(--accent),var(--alt))}
          .toggle-switch input:checked + .toggle-slider::before{transform:translateX(24px)}
          .save-badge{
            font-family:var(--mono);font-size:.6rem;background:rgba(232, 201, 122, .15);
            color:var(--alt);border:1px solid rgba(232, 201, 122, .3);border-radius:4px;
            padding:.2rem .5rem;opacity:0;transition:opacity .3s;
          }
          .save-badge.visible{opacity:1}

          /* ── FLOATING CHIPS ── */
          .float-chips{position:absolute;pointer-events:none;top:0;left:0;width:100%;height:100%;overflow:hidden;z-index:0}
          .chip{
            position:absolute;font-family:var(--mono);font-size:.65rem;
            border:1px solid rgba(201, 168, 76, .3);border-radius:20px;
            padding:.2rem .6rem;color:rgba(201, 168, 76, .5);
            animation:chipFloat var(--dur2,18s) ease-in-out infinite var(--del,0s);
          }
          @keyframes chipFloat{0%,100%{transform:translate(0,0)}25%{transform:translate(10px,-15px)}50%{transform:translate(-5px,-30px)}75%{transform:translate(8px,-20px)}}

          /* ── SOCIAL PROOF BAR ── */
          .social-bar{
            background:rgba(201, 168, 76, .06);border:1px solid rgba(201, 168, 76, .15);
            border-radius:.5rem;padding:.75rem 1.5rem;display:flex;align-items:center;
            justify-content:center;gap:2rem;flex-wrap:wrap;margin:0 auto 3rem;max-width:700px;
            font-family:var(--mono);font-size:.7rem;color:var(--muted);
          }
          .social-bar strong{color:var(--alt)}

          /* ── RESPONSIVE ── */
          @media(max-width:768px){
            #landing-page-root nav{padding:.75rem 1.5rem}
            .nav-links{display:none}
            .stats-grid{grid-template-columns:repeat(2,1fr)}
            .ai-grid{grid-template-columns:1fr}
            .footer-inner{grid-template-columns:1fr}
            .step-card{min-width:260px}
            .hero-h1{font-size:clamp(2.2rem,8vw,4rem)}
            #scroll-progress{display:none}
            .terminal-box{min-width:90vw}
          }
          @media(max-width:480px){
            .stats-grid{grid-template-columns:1fr 1fr}
            .hero-btns{flex-direction:column;align-items:center}
          }
        `,
      }} />

      {/* PARTICLE CANVAS */}
      <canvas id="particle-canvas" ref={canvasRef}></canvas>

      {/* MOBILE MENU */}
      <div className="mobile-menu" id="mobile-menu">
        <a href="#features" onClick={closeMobileMenu}>Features</a>
        <a href="#pricing" onClick={closeMobileMenu}>Pricing</a>
        <a href="#testimonials" onClick={closeMobileMenu}>Stories</a>
        <a href="#terminal-cta" onClick={closeMobileMenu}>Demo</a>
        <button 
          className="mobile-menu-cta plan-btn primary" 
          onClick={() => setShowMobileLoginMenu(!showMobileLoginMenu)} 
          style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}
        >
          <span>Log In</span>
          <span style={{ transform: showMobileLoginMenu ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
        </button>

        {showMobileLoginMenu && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingLeft: "1rem", marginBottom: "0.8rem", width: "100%" }}>
            <button className="mobile-menu-cta plan-btn secondary" onClick={(e) => { closeMobileMenu(); triggerParticles(e, "admin"); }} style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}>
              <span>🔑</span> Admin Portal
            </button>
            <button className="mobile-menu-cta plan-btn secondary" onClick={(e) => { closeMobileMenu(); triggerParticles(e, "staff"); }} style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}>
              <span>⚡</span> Staff Shift
            </button>
            <button className="mobile-menu-cta plan-btn secondary" onClick={(e) => { closeMobileMenu(); triggerParticles(e, "customer"); }} style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}>
              <span>🎁</span> Customer Loyalty
            </button>
          </div>
        )}

        <button className="mobile-menu-cta plan-btn primary" onClick={(e) => { closeMobileMenu(); triggerParticles(e, "admin"); }}>Start Free Trial →</button>
      </div>

      {/* LOADING SCREEN */}
      <div id="loading">
        {/* Subtle teal glowing background particles */}
        <div className="loading-bg-particles">
          <div className="loading-particle p1"></div>
          <div className="loading-particle p2"></div>
          <div className="loading-particle p3"></div>
          <div className="loading-particle p4"></div>
        </div>

        {/* Ambient floating futuristic store products in background layer */}
        <div className="loading-ambient-products" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
          {/* Milk Carton */}
          <div className="floating-product fp1">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 21h10V9l-3-4H10L7 9v12zM10 5v4h4V5M7 13h10" />
            </svg>
          </div>
          {/* Chips Packet */}
          <div className="floating-product fp2">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3l3 1 3-1 3 1 3-1v18l-3 1-3-1-3 1-3-1V3z M6 8h12M6 16h12" />
            </svg>
          </div>
          {/* Soda Can */}
          <div className="floating-product fp3">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 5V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v1M7 5a2 2 0 00-2 2v10a2 2 0 002 2v1M19 5a2 2 0 00-2 2v10a2 2 0 002 2v1M7 5h12M7 19h12" />
            </svg>
          </div>
          {/* Shopping Bag */}
          <div className="floating-product fp4">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V10a2 2 0 012-2zM9 8V6a3 3 0 016 0v2" />
            </svg>
          </div>
          {/* Cereal Box */}
          <div className="floating-product fp5">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h4" />
            </svg>
          </div>
          {/* Fruit Crate */}
          <div className="floating-product fp6">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18v12H3zM3 10h18M3 14h18M7 6v12M17 6v12" />
            </svg>
          </div>
          {/* Bottle */}
          <div className="floating-product fp7">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2h4v3a2 2 0 002 2h1a2 2 0 012 2v11a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2h1a2 2 0 002-2V2z" />
            </svg>
          </div>
          {/* Package Box */}
          <div className="floating-product fp8">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L3 7v10l9 5 9-5V7L12 2zM12 22V12M3 7l9 5 9-5M12 12l-9-5M12 12l9-5" />
            </svg>
          </div>
          {/* Soda Can (Duplicate with class fp9) */}
          <div className="floating-product fp9">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 5V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v1M7 5a2 2 0 00-2 2v10a2 2 0 002 2v1M19 5a2 2 0 00-2 2v10a2 2 0 002 2v1M7 5h12M7 19h12" />
            </svg>
          </div>
          {/* Shopping Bag (Duplicate with class fp10) */}
          <div className="floating-product fp10">
            <svg viewBox="0 0 24 24" className="fp-svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V10a2 2 0 012-2zM9 8V6a3 3 0 016 0v2" />
            </svg>
          </div>
        </div>

        <div className="load-logo">
          ⚡ <span>Super</span>Mart
        </div>

        <div className="loading-card-wrap">
          <div className="loading-card-glow"></div>
          <div className="loading-glass-card">
            {/* The character slides in a container that aligns exactly with the progress bar underneath */}
            <div className="loading-track-outer">
              <div className="loading-track-area">
                <div 
                  className="loading-character-container"
                  style={{ left: `calc(${Math.min(loadingProgress, 95)}% - 110px)` }}
                >
                  <img src={characterImg} className="loading-character-img" alt="Man walking with shopping cart" />
                  <div className="loading-character-shadow"></div>
                </div>
              </div>
            </div>

            {/* Bottom Row containing the progress bar and the status text inline */}
            <div className="loading-progress-row">
              <div className="loading-progress-track">
                <div className="loading-progress-fill" style={{ width: `${loadingProgress}%` }}></div>
                <div className="loading-progress-tip-glow" style={{ left: `${loadingProgress}%` }}></div>
              </div>
              <div className="loading-status-text">
                <span className="loading-pct">{Math.round(loadingProgress)}%</span>
                &nbsp;Opening Store... <span className="cursor-blink">|</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CUSTOM CURSOR */}
      <div id="cursor"></div>
      <div id="cursor-ring"></div>

      {/* SCROLL PROGRESS */}
      <div id="scroll-progress">
        <div className="sp-label">Store Open</div>
        <div id="scroll-bar-track"><div id="scroll-bar-fill" style={{ height: "0%" }}></div></div>
      </div>

      {/* MAIN WEBSITE CONTENT WRAPPER */}
      <div className="main-content-wrapper">
        {/* LIVE TICKER */}
        <div id="live-ticker">
        <div id="ticker-inner">
          {(() => {
            // Build ticker items from real transactions, fallback to static entries
            const staticItems = [
              "₹840 — 3 items — Counter 1 — just now",
              "₹1,240 — 5 items — Counter 2 — 1m ago",
              "₹620 — 2 items — Counter 3 — 2m ago",
              "₹3,100 — 12 items — Counter 1 — 3m ago",
              "₹490 — 2 items — Counter 2 — 4m ago",
              "₹2,280 — 8 items — Counter 3 — 5m ago",
              "₹750 — 4 items — Counter 1 — 6m ago",
            ];
            const liveItems = liveTransactions.slice(0, 20).map(t => {
              const items = (() => { try { return JSON.parse(t.items || "[]"); } catch { return []; } })();
              const timeAgo = (() => {
                if (!t.createdAt) return "recently";
                const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
                const mins = Math.floor((Date.now() - d.getTime()) / 60000);
                if (mins < 1) return "just now";
                if (mins < 60) return `${mins}m ago`;
                const hrs = Math.floor(mins / 60);
                return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs/24)}d ago`;
              })();
              return `₹${Number(t.total).toLocaleString("en-IN")} — ${items.length || "?"} items — ${t.cashier || "Counter"} — ${timeAgo}`;
            });
            const displayItems = liveItems.length >= 5 ? liveItems : staticItems;
            // Duplicate for seamless loop
            return [...displayItems, ...displayItems].map((txt, idx) => (
              <div className="tick-item" key={idx}><span className="tick-dot"></span> {txt}</div>
            ));
          })()}
        </div>
      </div>

      {/* NAV */}
      <nav id="main-nav" style={{ opacity: 0 }}>
        <div className="nav-logo">⚡ <span className="dot">Super</span>Mart</div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#testimonials">Stories</a>
          <a href="#terminal-cta">Demo</a>
        </div>
        <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button 
              onClick={() => setShowLoginDropdown(!showLoginDropdown)} 
              className="nav-cta" 
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
            >
              <span>Log In</span>
              <span style={{ transform: showLoginDropdown ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", fontSize: "0.6rem" }}>▼</span>
            </button>
            
            {showLoginDropdown && (
              <div className="nav-dropdown-menu">
                <button onClick={(e) => { setShowLoginDropdown(false); triggerParticles(e, "admin"); }} className="nav-dropdown-item admin">
                  <span className="icon">🔑</span>
                  <div style={{ textAlign: "left" }}>
                    <div className="title">Admin Portal</div>
                    <div className="desc">Manage inventory & reports</div>
                  </div>
                </button>
                <button onClick={(e) => { setShowLoginDropdown(false); triggerParticles(e, "staff"); }} className="nav-dropdown-item staff">
                  <span className="icon">⚡</span>
                  <div style={{ textAlign: "left" }}>
                    <div className="title">Staff Shift</div>
                    <div className="desc">Run counter & sell items</div>
                  </div>
                </button>
                <button onClick={(e) => { setShowLoginDropdown(false); triggerParticles(e, "customer"); }} className="nav-dropdown-item customer">
                  <span className="icon">🎁</span>
                  <div style={{ textAlign: "left" }}>
                    <div className="title">Customer Loyalty</div>
                    <div className="desc">Check points & invoices</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <button onClick={(e) => triggerParticles(e, "admin")} className="nav-cta" style={{ background: "black", border: "1px solid var(--accent)" }}>Start Free Trial →</button>
        </div>
        <button className="hamburger" id="hamburger-btn" onClick={toggleMobileMenu} aria-label="Toggle menu">
          <span></span><span></span><span></span>
        </button>
      </nav>

      {/* HERO */}
      <section id="hero">
        <div className="hero-bg">
          <div className="hero-orb v"></div>
          <div className="hero-orb m"></div>
          {/* floating debris */}
          <div className="float-debris" style={{ top: "20%", left: "10%", transform: "translate(0,0)", opacity: 0.1, animation: "debris 22s linear infinite" }}>₹</div>
          <div className="float-debris" style={{ top: "60%", left: "80%", transform: "translate(0,0)", opacity: 0.1, animation: "debris 18s linear infinite" }}>₹</div>
          <div className="float-debris" style={{ top: "40%", left: "60%", transform: "translate(0,0)", opacity: 0.1, animation: "debris 25s linear infinite" }}>〰</div>
          <div className="float-debris" style={{ top: "75%", left: "25%", transform: "translate(0,0)", opacity: 0.1, animation: "debris 20s linear infinite" }}>₹</div>
          <div className="float-debris" style={{ top: "15%", left: "75%", transform: "translate(0,0)", opacity: 0.1, animation: "debris 28s linear infinite" }}>⬡</div>
          <div className="float-debris" style={{ top: "85%", left: "55%", transform: "translate(0,0)", opacity: 0.1, animation: "debris 17s linear infinite" }}>◈</div>
        </div>

        <div className="float-chips">
          <div className="chip" style={{ top: "25%", left: "5%" }}>Dairy</div>
          <div className="chip" style={{ top: "45%", left: "88%" }}>Snacks</div>
          <div className="chip" style={{ top: "70%", left: "7%" }}>Beverages</div>
          <div className="chip" style={{ top: "30%", left: "90%" }}>Staples</div>
          <div className="chip" style={{ top: "80%", left: "78%" }}>Bakery</div>
          <div className="chip" style={{ top: "15%", left: "50%" }}>Personal Care</div>
        </div>

        <div className="hero-eyebrow">AI-Powered Supermarket Management</div>
        <h1 className="hero-h1">
          <span className="line" id="hl1">MANAGE <span className="acc">SMARTER.</span></span>
          <span className="line" id="hl2">SELL <span className="acc">FASTER.</span></span>
        </h1>
        <p className="hero-sub">Your entire supermarket — POS, inventory, AI forecasting, customers, staff — in one powerful dashboard.</p>
        <div className="hero-terminal" id="hero-terminal">
          <div className="ht-line"><span className="cmd">$ supermart init</span> <span className="flag">--store</span> "Thanjavur Branch" <span className="flag">--ai</span> gemini</div>
          <div className="ht-line">&nbsp;</div>
          <div id="ht-lines"></div>
        </div>
        <div className="hero-btns">
          <button onClick={triggerParticles} className="btn-primary" id="cta-main">Start Free Trial →</button>
          <a href="#dashboard" className="btn-ghost">Watch Demo ▶</a>
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="section-pad">
        <div className="section-center">
          <div className="section-eyebrow reveal">The Old Way</div>
          <h2 className="section-title reveal">Running a store shouldn't<br />feel like this.</h2>
          <div className="pain-grid">
            <div className="pain-card reveal-left" style={{ transitionDelay: ".1s" }}>
              <div className="pain-emoji">😤</div>
              <h3>Manual stock counting wastes 3 hours daily</h3>
              <p>Your staff spends hours every day counting shelves when they should be serving customers.</p>
            </div>
            <div className="pain-card reveal" style={{ transitionDelay: ".2s" }}>
              <div className="pain-emoji">😰</div>
              <h3>Lost sales from stockouts cost ₹40,000/month</h3>
              <p>Customers walk out empty-handed — and don't come back — because you ran out of their favourites.</p>
            </div>
            <div className="pain-card reveal-right" style={{ transitionDelay: ".3s" }}>
              <div className="pain-emoji">😵</div>
              <h3>No idea what's selling until month-end reports</h3>
              <p>By the time you see what worked and what didn't, you've already missed the opportunity.</p>
            </div>
          </div>
          <p className="pain-cta reveal">"SuperMart fixes all of this — <span style={{ color: "var(--alt)" }}>in real time.</span>"</p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="section-pad">
        <div className="section-center">
          <div className="section-eyebrow reveal">Platform Modules</div>
          <h2 className="section-title reveal">Everything your store<br />needs. <span className="accent-text">Nothing it doesn't.</span></h2>
          <div className="divider reveal"></div>
          <div className="features-grid">
            <div className="feat-card reveal-left" style={{ transitionDelay: ".05s" }}>
              <div className="feat-icon" style={{ animation: "bob 2.8s ease-in-out infinite" }}>⚡</div>
              <h3>Smart POS Terminal</h3>
              <p>Lightning-fast billing with cash, UPI & card — 3 counters, one screen. PIN-based cashier login.</p>
              <span className="feat-tag">LIVE</span>
            </div>
            <div className="feat-card reveal" style={{ transitionDelay: ".1s" }}>
              <div className="feat-icon" style={{ animation: "bob 3.2s ease-in-out infinite" }}>📦</div>
              <h3>Live Inventory</h3>
              <p>Real-time stock tracking with low-stock alerts, expiry warnings & auto-status per category.</p>
              <span className="feat-tag">REAL-TIME</span>
            </div>
            <div className="feat-card reveal-right" style={{ transitionDelay: ".15s" }}>
              <div className="feat-icon" style={{ animation: "bob 2.5s ease-in-out infinite" }}>🤖</div>
              <h3>Gemini AI Forecast</h3>
              <p>Google Gemini predicts stockouts before they happen — with automated reorder suggestions.</p>
              <span className="feat-tag" style={{ color: "var(--alt)", borderColor: "var(--alt)" }}>AI-POWERED</span>
            </div>
            <div className="feat-card reveal-left" style={{ transitionDelay: ".2s" }}>
              <div className="feat-icon" style={{ animation: "bob 3.5s ease-in-out infinite" }}>📊</div>
              <h3>Sales Analytics</h3>
              <p>Revenue trends, category margins, payment split — monthly and weekly deep dives in one view.</p>
              <span className="feat-tag">INSIGHTS</span>
            </div>
            <div className="feat-card reveal" style={{ transitionDelay: ".25s" }}>
              <div className="feat-icon" style={{ animation: "bob 2.9s ease-in-out infinite" }}>👥</div>
              <h3>Customer Loyalty</h3>
              <p>VIP tagging, visit tracking, loyalty points and complete spend history per customer profile.</p>
              <span className="feat-tag">CRM</span>
            </div>
            <div className="feat-card reveal-right" style={{ transitionDelay: ".3s" }}>
              <div className="feat-icon" style={{ animation: "bob 3.1s ease-in-out infinite" }}>👨‍💼</div>
              <h3>Staff Management</h3>
              <p>Shift tracking, PIN-based POS login, per-cashier transaction reporting and performance.</p>
              <span className="feat-tag">HR</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="section-pad">
        <div className="section-center" style={{ textAlign: "center" }}>
          <div className="section-eyebrow reveal">How It Works</div>
          <h2 className="section-title reveal">Up and running in<br /><span className="alt-text">under 10 minutes.</span></h2>
          <div className="steps-row">
            <div className="step-card reveal-left">
              <div className="step-num">STEP 01</div>
              <div className="step-icon">🏪</div>
              <h3>Set Up Your Store</h3>
              <p>Add your products, staff and store info. Import your catalogue or start fresh.</p>
            </div>
            <div className="step-arrow reveal">→</div>
            <div className="step-card reveal">
              <div className="step-num">STEP 02</div>
              <div className="step-icon">⚡</div>
              <h3>Start Billing at POS</h3>
              <p>Cashiers log in with a PIN. Scan, bill, collect — done. UPI, card, and cash supported.</p>
            </div>
            <div className="step-arrow reveal">→</div>
            <div className="step-card reveal-right">
              <div className="step-num">STEP 03</div>
              <div className="step-icon">📈</div>
              <h3>Watch AI Optimize</h3>
              <p>Gemini AI forecasts demand. You restock smarter every week. Revenue goes up.</p>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <section id="dashboard" className="section-pad">
        <div className="section-center" style={{ textAlign: "center" }}>
          <div className="section-eyebrow reveal">Live Dashboard</div>
          <h2 className="section-title reveal">Everything you see is<br /><span className="accent-text">live data.</span></h2>
          <div className="social-bar reveal">
            <span>🏪 <strong>{productCount > 0 ? productCount : "500+"}</strong> products in catalogue</span>
            <span>⚡ <strong>{monthRevenue > 0 ? `₹${(monthRevenue / 100000).toFixed(1)}L` : "₹2.4 Cr"}</strong> processed this month</span>
            <span>🤖 <strong>99.2%</strong> uptime SLA</span>
          </div>
          <div className="dash-wrap reveal" id="dash-wrap">
            <div className="dash-mock" id="dash-mock">
              <div className="dash-topbar">
                <div className="dash-dot" style={{ background: "#FF4D6D" }}></div>
                <div className="dash-dot" style={{ background: "#FFB547" }}></div>
                <div className="dash-dot" style={{ background: "#00D4AA" }}></div>
                <span className="dash-title-bar">SuperMart Dashboard — Thanjavur Branch · Live</span>
              </div>
              <div className="dash-body">
                <div className="dash-sidebar">
                  <div className="dash-nav-item active">📊 Dashboard</div>
                  <div className="dash-nav-item">⚡ POS</div>
                  <div className="dash-nav-item">📦 Inventory</div>
                  <div className="dash-nav-item">🤖 AI Insights</div>
                  <div className="dash-nav-item">👥 Customers</div>
                  <div className="dash-nav-item">📈 Analytics</div>
                  <div className="dash-nav-item">👨‍💼 Staff</div>
                </div>
                <div className="dash-main">
                  <div className="dash-kpis">
                    <div className="kpi-card">
                      <div className="kpi-label">Today's Revenue</div>
                      <div className="kpi-val">
                        {todayRevenue > 0 ? `₹${Math.round(todayRevenue).toLocaleString("en-IN")}` : "₹74,600"}
                        <span className="up">↑ LIVE</span>
                      </div>
                    </div>
                    <div className="kpi-card">
                      <div className="kpi-label">Transactions</div>
                      <div className="kpi-val">
                        {todayTxCount > 0 ? todayTxCount : 284}
                        <span className="up">↑ LIVE</span>
                      </div>
                    </div>
                    <div className="kpi-card">
                      <div className="kpi-label">Avg Basket</div>
                      <div className="kpi-val">
                        {avgBasket > 0 ? `₹${Math.round(avgBasket).toLocaleString("en-IN")}` : "₹263"}
                        <span className="up">↑ LIVE</span>
                      </div>
                    </div>
                  </div>
                  <div className="dash-charts">
                    <div className="chart-box">
                      <div className="chart-label">Revenue Trend (7 days)</div>
                      <svg className="sparkline" viewBox="0 0 200 50" preserveAspectRatio="none">
                        <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C63FF" stopOpacity=".4"/><stop offset="100%" stopColor="#6C63FF" stopOpacity="0"/></linearGradient></defs>
                        <path d="M0,40 L28,35 L56,28 L84,32 L112,20 L140,22 L168,14 L200,10 L200,50 L0,50Z" fill="url(#sg)"/>
                        <path d="M0,40 L28,35 L56,28 L84,32 L112,20 L140,22 L168,14 L200,10" fill="none" stroke="#6C63FF" strokeWidth="1.5"/>
                      </svg>
                    </div>
                    <div className="chart-box" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div className="chart-label">Payment Split</div>
                      <div className="pie-chart"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* annotations */}
            <div className="dash-annotation" style={{ top: "-14px", right: "60px" }}>🤖 Live Gemini AI</div>
            <div className="dash-annotation" style={{ bottom: "30px", left: "-10px" }}>📦 Real-time stock</div>
            <div className="dash-annotation" style={{ top: "50%", right: "-10px", transform: "translateY(-50%)" }}>⚡ One-tap POS</div>
          </div>
          <p className="dash-caption reveal">No spreadsheets. No guesswork. Just real numbers, live.</p>
        </div>
      </section>

      {/* AI SPOTLIGHT */}
      <section id="ai-spot" className="section-pad">
        <div className="section-center">
          <div className="ai-grid">
            <div>
              <div className="section-eyebrow reveal">Gemini AI Integration</div>
              <h2 className="ai-headline reveal">Your store has<br /><span className="alt-text">a brain now.</span></h2>
              <p className="section-sub reveal" style={{ marginBottom: "2rem" }}>Google Gemini analyses your sales patterns, seasonal trends, and local events to predict stockouts — before they cost you money.</p>
              <table className="restock-table reveal" style={{ transitionDelay: ".2s" }}>
                <thead>
                  <tr><th>Product</th><th>Stock</th><th>Days Left</th><th>Priority</th></tr>
                </thead>
                <tbody>
                  <tr><td>Amul Gold Milk 1L</td><td>145u</td><td>2.8d</td><td><span className="badge high">HIGH</span></td></tr>
                  <tr><td>Tropicana Orange 1L</td><td>62u</td><td>4.1d</td><td><span class="badge high">HIGH</span></td></tr>
                  <tr><td>Britannia Bread</td><td>88u</td><td>6.2d</td><td><span className="badge med">MEDIUM</span></td></tr>
                  <tr><td>Colgate MaxFresh</td><td>210u</td><td>11d</td><td><span className="badge low">LOW</span></td></tr>
                </tbody>
              </table>
            </div>
            <div className="ai-card reveal-right" id="ai-insight-card">
              <div className="ai-header">
                <span>🤖</span>
                <span style={{ color: "var(--alt)", fontWeight: 600 }}>Gemini AI says...</span>
                <span className="ai-badge">LIVE</span>
              </div>
              <div className="ai-body" id="ai-typing-area"></div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section id="stats" className="section-pad">
        <div className="section-center">
          <div className="stats-grid">
            <div className="stat-item reveal">
              <span className="stat-number" data-target={todayRevenue > 0 ? Math.round(todayRevenue) : 74600} data-prefix="₹" id="stat0">₹0</span>
              <div className="stat-label">Today's Revenue</div>
              <div className="stat-sublabel">Live from Firestore</div>
            </div>
            <div className="stat-item reveal" style={{ transitionDelay: ".1s" }}>
              <span className="stat-number" data-target={todayTxCount > 0 ? todayTxCount : 284} id="stat1">0</span>
              <div className="stat-label">Transactions Today</div>
              <div className="stat-sublabel">Across all counters</div>
            </div>
            <div className="stat-item reveal" style={{ transitionDelay: ".2s" }}>
              <span className="stat-number" data-target={todayItemsSold > 0 ? todayItemsSold : 1847} id="stat2">0</span>
              <div className="stat-label">Items Sold Today</div>
              <div className="stat-sublabel">{productCount > 0 ? `${productCount} product catalogue` : "847 product catalogue"}</div>
            </div>
            <div className="stat-item reveal" style={{ transitionDelay: ".3s" }}>
              <span className="stat-number" data-target="99.2" data-suffix="%" id="stat3">0%</span>
              <div className="stat-label">Uptime SLA</div>
              <div className="stat-sublabel">Last 12 months</div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="section-pad">
        <div className="section-center" style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div className="section-eyebrow reveal">Store Owner Stories</div>
          <h2 className="section-title reveal">Real stores.<br /><span className="accent-text">Real results.</span></h2>
        </div>
        <div style={{ overflow: "hidden", padding: "1rem 0" }}>
          <div className="testi-track">
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"SuperMart's AI told me Tropicana was about to stock out <span className="highlight">2 days before it did.</span> Saved me ₹18,000 in lost sales."</p>
              <div className="testi-author">Suresh K.</div>
              <div className="testi-store">Thanjavur SuperMart</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"The POS is so fast my cashiers love it. Bill time dropped from 4 minutes to <span className="highlight">45 seconds</span> per customer."</p>
              <div className="testi-author">Meena R.</div>
              <div className="testi-store">Coimbatore FreshMart</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"I can see every cashier's performance from my phone. <span className="highlight">Never felt so in control</span> of my store."</p>
              <div className="testi-author">Arjun V.</div>
              <div className="testi-store">Chennai QuickMart</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"Set up was done in under 30 minutes. The Gemini forecast feature alone is worth <span className="highlight">10x the subscription cost.</span>"</p>
              <div className="testi-author">Kavitha S.</div>
              <div className="testi-store">Madurai GroceryHub</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"During Pongal season, the AI predicted our exact demand spike. <span className="highlight">Zero stockouts</span> for the first time ever."</p>
              <div className="testi-author">Ramesh P.</div>
              <div className="testi-store">Trichy FamilyMart</div>
            </div>
            {/* duplicate for seamless loop */}
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"SuperMart's AI told me Tropicana was about to stock out <span className="highlight">2 days before it did.</span> Saved me ₹18,000 in lost sales."</p>
              <div className="testi-author">Suresh K.</div>
              <div className="testi-store">Thanjavur SuperMart</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"The POS is so fast my cashiers love it. Bill time dropped from 4 minutes to <span className="highlight">45 seconds</span> per customer."</p>
              <div className="testi-author">Meena R.</div>
              <div className="testi-store">Coimbatore FreshMart</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"I can see every cashier's performance from my phone. <span className="highlight">Never felt so in control</span> of my store."</p>
              <div className="testi-author">Arjun V.</div>
              <div className="testi-store">Chennai QuickMart</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"Set up was done in under 30 minutes. The Gemini forecast feature alone is worth <span className="highlight">10x the subscription cost.</span>"</p>
              <div className="testi-author">Kavitha S.</div>
              <div className="testi-store">Madurai GroceryHub</div>
            </div>
            <div className="testi-card">
              <div className="stars">★★★★★</div>
              <p className="testi-quote">"During Pongal season, the AI predicted our exact demand spike. <span className="highlight">Zero stockouts</span> for the first time ever."</p>
              <div className="testi-author">Ramesh P.</div>
              <div className="testi-store">Trichy FamilyMart</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="section-pad">
        <div className="section-center" style={{ textAlign: "center" }}>
          <div className="section-eyebrow reveal">Simple Pricing</div>
          <h2 className="section-title reveal">Start free.<br /><span className="accent-text">Scale when you're ready.</span></h2>

          {/* PRICING TOGGLE */}
          <div className="pricing-toggle-wrap reveal">
            <span className="toggle-label active" id="label-monthly">Monthly</span>
            <label className="toggle-switch">
              <input type="checkbox" id="pricing-toggle" onChange={(e) => switchPricing(e.target.checked)} />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label" id="label-annual">Annual</span>
            <span className="save-badge" id="save-badge">Save 20%</span>
          </div>

          <div className="pricing-grid">
            <div className="pricing-card reveal-left">
              <div className="plan-name">Starter</div>
              <div className="plan-price free-price">Free</div>
              <div className="plan-feature">1 Counter</div>
              <div className="plan-feature">500 Products</div>
              <div className="plan-feature">Basic Reports</div>
              <div className="plan-feature">Email Support</div>
              <button className="plan-btn ghost" onClick={triggerParticles}>Get Started</button>
            </div>
            <div className="pricing-card featured reveal" style={{ transitionDelay: ".1s" }}>
              <div className="popular-badge">✦ Most Popular</div>
              <div className="plan-name" style={{ color: "var(--accent)" }}>Pro</div>
              <div className="plan-price">
                <span className="curr">₹</span><span id="pro-price">2,999</span><span className="period" id="pro-period">/mo</span>
              </div>
              <div className="plan-feature">3 Counters</div>
              <div className="plan-feature">Unlimited Products</div>
              <div className="plan-feature" style={{ color: "var(--alt)" }}>🤖 Gemini AI Forecast</div>
              <div className="plan-feature">Customer Loyalty CRM</div>
              <div className="plan-feature">Priority Support</div>
              <button className="plan-btn primary" onClick={triggerParticles}>Start Free Trial</button>
            </div>
            <div className="pricing-card reveal-right" style={{ transitionDelay: ".2s" }}>
              <div className="plan-name">Enterprise</div>
              <div className="plan-price" style={{ fontSize: "1.4rem", paddingTop: ".5rem" }}>Custom</div>
              <div className="plan-feature">Unlimited Counters</div>
              <div className="plan-feature">Unlimited Products</div>
              <div className="plan-feature">White-label Platform</div>
              <div className="plan-feature">Dedicated CSM</div>
              <div className="plan-feature">SLA Guarantee</div>
              <button className="plan-btn ghost" onClick={triggerParticles}>Contact Us</button>
            </div>
          </div>
        </div>
      </section>

      {/* LOGIN OPTIONS SECTION */}
      <section id="login-section" className="section-pad">
        <div className="section-center">
          <div className="section-eyebrow reveal" style={{ textAlign: "center" }}>Portal Access</div>
          <h2 className="section-title reveal" style={{ textAlign: "center" }}>Log In to <span className="accent-text">SuperMart</span></h2>
          <p style={{ textAlign: "center", color: "var(--muted)", maxWidth: "600px", margin: "0 auto 3rem", fontSize: "0.95rem" }}>
            Select your portal below to manage operations, perform sales transactions, or check your customer loyalty points.
          </p>

          <div className="login-grid">
            {/* Admin Card */}
            <div className="login-card reveal-left">
              <div className="login-card-icon">🔑</div>
              <div className="login-card-title">Admin Portal</div>
              <p className="login-card-desc">Access high-level dashboards, manage inventory catalogues, monitor revenues, and manage staff operations.</p>
              <button onClick={(e) => triggerParticles(e, "admin")} className="login-card-btn">Log in as Admin</button>
            </div>

            {/* Staff Card */}
            <div className="login-card staff reveal">
              <div className="login-card-icon">⚡</div>
              <div className="login-card-title">Staff Shift</div>
              <p className="login-card-desc">Log in to active register counters, scan items, process barcode items, and issue invoices to clients.</p>
              <button onClick={(e) => triggerParticles(e, "staff")} className="login-card-btn">Log in as Staff</button>
            </div>

            {/* Customer Card */}
            <div className="login-card customer reveal-right">
              <div className="login-card-icon">🎁</div>
              <div className="login-card-title">Customer Loyalty</div>
              <p className="login-card-desc">Check your active reward points balance, view past billing invoices, and download coupons.</p>
              <button onClick={(e) => triggerParticles(e, "customer")} className="login-card-btn">Log in as Customer</button>
            </div>
          </div>
        </div>
      </section>

      {/* TERMINAL CTA */}
      <section id="terminal-cta" className="section-pad">
        <div className="section-center" style={{ textAlign: "center" }}>
          <div className="section-eyebrow reveal">Ready to Start?</div>
          <h2 className="section-title reveal">Open your smartest<br /><span className="alt-text">store ever.</span></h2>
          <div className="cta-terminal reveal">
            <div className="cta-line"><span className="cmd">$ supermart open</span> <span style={{ color: "var(--muted)" }}>--store</span> <span className="val">"Your Store"</span> <span style={{ color: "var(--muted)" }}>--plan</span> pro</div>
            <div className="cta-line">&nbsp;</div>
            <div className="cta-line" id="cta-t1" style={{ opacity: 0 }}><span className="ok">✔</span>  Store profile created</div>
            <div className="cta-line" id="cta-t2" style={{ opacity: 0 }}><span className="ok">✔</span>  3 POS terminals activated</div>
            <div className="cta-line" id="cta-t3" style={{ opacity: 0 }}><span className="ok">✔</span>  Gemini AI forecasting enabled</div>
            <div className="cta-line" id="cta-t4" style={{ opacity: 0 }}><span className="ok">✔</span>  <span className="val">First 30 days free — no card needed</span></div>
            <div className="cta-line" style={{ marginTop: ".75rem" }}>&nbsp;</div>
            <div className="cta-line">Ready to open? <span className="cmd">[Y/n]</span> <span className="cursor-blink"></span></div>
          </div>
          <button className="cta-btn reveal" id="main-cta-btn" onClick={triggerParticles}>Start Free Trial →</button>
          <p className="cta-sub reveal">No credit card required · Setup in 10 minutes · Cancel anytime</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-logo">⚡ <span style={{ color: "var(--accent)" }}>Super</span>Mart</div>
            <p className="footer-tagline">"The Smartest Way to Run Your Store"<br />AI-Powered POS · Smart Inventory · Gemini Forecasting · Built for Indian Retail</p>
            <p className="footer-sub">Made with ⚡ in Tamil Nadu, India</p>
          </div>
          <div className="footer-links">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#dashboard">Demo</a>
            <a href="#ai-spot">AI Forecast</a>
          </div>
          <div className="footer-links">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Contact</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
        <div className="footer-made">
          Powered by
          <div className="footer-tech">
            <span className="tech-badge">Supabase</span>
            <span className="tech-badge">Google Gemini AI</span>
            <span className="tech-badge">React</span>
            <span className="tech-badge">PostgreSQL</span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
