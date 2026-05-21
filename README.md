# 🛒 SuperMart — AI-Powered Retail Management System

A full-stack, multi-portal retail management platform built with **React + Vite + Firebase**. SuperMart connects four portals in real time — Admin, Staff (POS), Customer Storefront, and a public Landing Page.

---

## ✨ Features

### 🏠 Landing Page
- Animated, luxury-themed public storefront
- Login portal selector (Admin / Staff / Customer)
- Real-time product showcase

### 🔐 Admin Portal
- Full dashboard with live KPIs (revenue, orders, customers, stock)
- Product management — add, edit, delete, bulk CSV import, auto-fetch product images
- Customer & Staff management
- Analytics with Recharts (Area, Bar, Radar, Radial, Pie charts)
- AI Sales Forecast powered by Groq LLM
- Banner management (auto-scrolling banners on POS & Customer pages)
- Transaction history with live ticker
- Auto-sliding sidebar (72px icon rail → 240px on hover, pinnable)
- Light / Dark theme toggle
- AI Voice Assistant with real-time Firebase data context

### 🖥️ POS System (Staff Portal)
- Touch-friendly cashier interface
- Barcode scanning simulation
- Sliding cart drawer
- Multiple payment modes (Cash, Card, UPI)
- Receipt printing
- Break request notifications to admin
- Maison Aurum luxury dark-gold theme

### 🛍️ Customer Portal
- Luxury storefront with auto-scrolling banner carousel
- Real-time product catalog from Firebase
- Sliding cart with smooth animations
- Customer loyalty & transaction history
- Order placement connected to Firebase

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5 |
| Database | Firebase Firestore (real-time) |
| UI & Charts | Lucide React, Recharts, CSS animations |
| AI | Groq LLaMA API (voice assistant + forecasting) |
| Deployment | Vercel (frontend) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project with Firestore enabled
- A Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/supermart.git
cd supermart
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
```
Fill in your actual keys inside `.env`:
```env
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 4. Run the development server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### 5. Build for production
```bash
npm run build
```

---

## 🌐 Deploying to Vercel

1. Push your code to GitHub (see below)
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your GitHub repo
3. Vercel auto-detects the Vite framework
4. In **Environment Variables**, add all keys from your `.env` file
5. Click **Deploy**

> The `vercel.json` in this repo handles SPA routing and asset caching automatically.

---

## 🔥 Firebase Setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database** in production mode
3. Create these collections manually or let the app create them on first use:
   - `products`
   - `customers`
   - `staff`
   - `transactions`
   - `notifications`
   - `banners`
4. Update Firestore Security Rules (see `firestore.rules`)

---

## 📁 Project Structure

```
supermart/
├── index.html              # Main app entry (Admin + Staff + Landing)
├── customer website.html   # Customer storefront entry
├── main.jsx                # React root mount
├── supermart1.jsx          # Main React app (~4800 lines, all portals)
├── LandingPage.jsx         # Animated landing page component
├── AIVoiceAssistant.jsx    # Voice assistant component
├── CsvImportModule.jsx     # CSV bulk import component
├── firebase.js             # Firebase init + Firestore helpers
├── vite.config.js          # Vite + multi-page config
├── vercel.json             # Vercel deployment config
├── .env.example            # Environment variable template
├── firestore.rules         # Firestore security rules
└── shopping-cart-character.png
```

---

## 🔐 Security Notes

- **Never commit your `.env` file** — it's in `.gitignore`
- All Firebase keys are loaded via `import.meta.env.VITE_*` (Vite env variables)
- Add your production domain to Firebase **Authorized Domains** in Authentication settings
- Tighten Firestore rules before going live (the default rules are open for development)

---

## 📸 Screenshots

> _Admin Dashboard · POS Terminal · Customer Storefront · Landing Page_

---

## 📄 License

MIT License — free for personal and educational use.

---

## 🙏 Acknowledgements

- [Firebase](https://firebase.google.com) for real-time database
- [Groq](https://groq.com) for ultra-fast LLaMA inference
- [Lucide](https://lucide.dev) for icons
- [Recharts](https://recharts.org) for charts
- [Vercel](https://vercel.com) for hosting
