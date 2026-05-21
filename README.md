# 🛒 Supermart POS & Customer Storefront System

A premium, modern, and state-of-the-art Web Application for managing Supermart operations. This project features a dual-facing system: an ultra-sleek, premium **Point of Sale (POS) Cashier Interface** and a highly interactive, beautifully designed **Customer Storefront** integrated with a real-time **Admin Dashboard**.

---

## ✨ Features & Highlights

### 🛍️ Customer Storefront & Portal
- **Rich Aesthetics:** Modern CSS styling using Google Fonts, custom harmonious color palettes, smooth gradients, and elegant dark/light components.
- **Auto-Scrolling Banners:** Dynamic promotional banners that update in real-time. Banners are customizable directly via the Admin Portal.
- **Sliding Drawer Shopping Cart:** Add products to the cart and see them in a premium sliding cart drawer that glides out from the side smoothly.
- **Interactive Experience:** Subtle micro-animations, hover states, and smooth card transitions.

### 💻 POS Cashier Portal
- **Matching Visual Theme:** Seamlessly aligned with the customer storefront's color palettes, premium typography, and active visual transitions.
- **Fast Checkout & POS Operations:** Instant product search, cart computations, real-time sync with inventory, and responsive layouts designed for cashiers.
- **CSV Data Import Module:** Simple, swift CSV file imports for bulk product updates and cashier listings.

### 🛡️ Admin & Analytics Dashboard
- **Auto-Hiding Sidebar:** A beautiful, responsive navigation panel that automatically hides itself when not in use, slide-revealing smoothly when the cursor approaches the edge.
- **Persistent Icon Dock:** Quick-access utility icons remain visible on the side even when the main menu panel is hidden, ensuring cashiers and administrators never lose access.
- **No-Blur Interface:** The primary workspace remains clear and sharp (no active blurring) when navigating the sidebar to prioritize visual clarity during rapid transactions.
- **Real-Time Database:** Fully powered by Firestore for synchronous document updates, live analytics, and sales logs.

### 🎙️ AI Voice Assistant
- **Hands-Free Control:** Integrated AI Voice Assistant (`AIVoiceAssistant.jsx`) to execute voice-guided catalog inquiries and POS billing interactions.

---

## 🛠️ Technology Stack

### Frontend & UI
- **Core:** React, Vite, HTML5, Vanilla CSS
- **Styling:** Bespoke Glassmorphic CSS layouts, custom CSS animations, modern responsive design
- **State & DB:** Firebase (Firestore, Authentication, Storage)

### Backend & Database
- **Server:** Node.js, Express, TypeScript (`server.ts`)
- **ORM & DB:** Prisma ORM with structured SQL schemas
- **Assets:** Secure uploads handling local image arrays

---

## 🚀 Getting Started

### 📋 Prerequisites
- **Node.js** (v18 or higher recommended)
- **Firebase Project Account**
- **Git**

### 🔧 Installation & Local Setup

1. **Clone the Repository**
   ```bash
   git clone <your-repository-url>
   cd "Final Mini  Project"
   ```

2. **Configure Environment Variables**
   Create a `.env` file in the root directory and define your Firebase config details:
   ```env
   VITE_FIREBASE_API_KEY="your-api-key"
   VITE_FIREBASE_AUTH_DOMAIN="your-auth-domain"
   VITE_FIREBASE_PROJECT_ID="your-project-id"
   VITE_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
   VITE_FIREBASE_MESSAGING_SENDER_ID="your-messaging-id"
   VITE_FIREBASE_APP_ID="your-app-id"
   ```

3. **Install Dependencies**
   - **Frontend:**
     ```bash
     npm install
     ```
   - **Backend:**
     ```bash
     cd backend
     npm install
     ```

4. **Run Development Servers**
   - **Frontend Server:**
     ```bash
     npm run dev
     ```
   - **Backend Server:**
     ```bash
     cd backend
     npm run dev
     ```

5. **Build for Production**
   To create an optimized production build of the frontend, run:
   ```bash
   npm run build
   ```

---

## 📂 Project Structure

```
├── .env.example             # Template for Firebase credentials
├── .gitignore               # Configured to ignore node_modules, build outputs, and secrets
├── AIVoiceAssistant.jsx     # AI Voice Assistant logic and UI
├── CsvImportModule.jsx      # Cashier/Product bulk CSV importer
├── LandingPage.jsx          # Interactive landing page
├── customer-website.html    # Entry for the customer storefront
├── firebase.js              # Live Firebase configurations
├── main.jsx                 # Application entry point
├── supermart1.jsx           # POS cashier portal and active admin interfaces
├── vite.config.js           # Vite server config mapped for multiple entry-points
├── backend/                 # Node.js backend workspace
│   ├── prisma/              # Prisma configuration and schema definition
│   ├── server.ts            # Node.js backend server entry point
│   └── package.json         # Backend manifest
└── package.json             # Main application manifest
```

---

## 🎨 UI/UX Theme Strategy
The interface utilizes a custom dark-glass and vibrant neon-accent color palette. Micro-animations are implemented using native CSS keyframes to ensure high-performance execution without standard library bloat.
