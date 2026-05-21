/**
 * update-product-images.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches all products from Firestore and assigns a real online image URL
 * based on the product name or category, then saves it back to Firestore.
 *
 * Run:  node update-product-images.mjs
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

// ── Firebase config (mirrors .env) ──────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDEcTF2geh8poUlsy68TlvC51xybdgaXro",
  authDomain:        "sales-analyzer-ea4c9.firebaseapp.com",
  projectId:         "sales-analyzer-ea4c9",
  storageBucket:     "sales-analyzer-ea4c9.firebasestorage.app",
  messagingSenderId: "918611678251",
  appId:             "1:918611678251:web:7133cd7e855f3ad91cc66e",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── Image library: keyword → Unsplash URL (w=800 for good quality) ──────────
// These are stable, free-to-use Unsplash images mapped to common grocery /
// supermarket / retail product keywords.
const IMAGE_MAP = [
  // ── HIGH-PRIORITY BRAND MATCHES (must come before generic keywords) ────────
  { keys: ["lay's", "lays", "classic salted", "doritos", "potato chips", "crisps"],
    url: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=800&q=85&auto=format&fit=crop" },
  { keys: ["parle-g", "parle g", "good day", "britannia", "bourbon", "oreo", "digestive"],
    url: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=800&q=85&auto=format&fit=crop" },
  { keys: ["colgate", "pepsodent", "sensodyne", "maxfresh"],
    url: "https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=800&q=85&auto=format&fit=crop" },
  { keys: ["nescafe", "bru coffee", "kopiko"],
    url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=85&auto=format&fit=crop" },
  { keys: ["amul", "amul gold", "amul butter", "amul milk"],
    url: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=800&q=85&auto=format&fit=crop" },
  { keys: ["dettol", "lifebuoy", "lux soap", "dove soap"],
    url: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=800&q=85&auto=format&fit=crop" },
  { keys: ["aashirvaad", "pillsbury"],
    url: "https://images.unsplash.com/photo-1587049633312-d628ae50a8ae?w=800&q=85&auto=format&fit=crop" },
  { keys: ["tropicana", "real juice", "frooti", "maaza", "slice"],
    url: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800&q=85&auto=format&fit=crop" },
  { keys: ["tata salt", "tata tea", "tata coffee"],
    url: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&q=85&auto=format&fit=crop" },
  { keys: ["surf excel", "ariel", "tide", "rin", "henko"],
    url: "https://images.unsplash.com/photo-1631376640912-cb8f0e26d29c?w=800&q=85&auto=format&fit=crop" },
  { keys: ["maggi"],
    url: "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=800&q=85&auto=format&fit=crop" },
  { keys: ["dairy milk", "kitkat", "snickers", "cadbury"],
    url: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=800&q=85&auto=format&fit=crop" },

  // ── Beverages ────────────────────────────────────────────────────────────
  { keys: ["coca cola", "coke", "pepsi", "soda", "cola"],
    url: "https://images.unsplash.com/photo-1629203849820-b47e6ad1e91c?w=800&q=85&auto=format&fit=crop" },
  { keys: ["mineral water", "bisleri", "aquafina", "kinley", "evian"],
    url: "https://images.unsplash.com/photo-1587143765815-3e67c484a3bb?w=800&q=85&auto=format&fit=crop" },
  { keys: ["orange juice", "apple juice", "mango juice", "fruit juice", "juice"],
    url: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800&q=85&auto=format&fit=crop" },
  { keys: ["milk", "full cream milk", "toned milk", "dairy milk"],
    url: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=800&q=85&auto=format&fit=crop" },
  { keys: ["green tea", "chai", "herbal tea", "black tea", "tea bag", "tea"],
    url: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=85&auto=format&fit=crop" },
  { keys: ["instant coffee", "espresso", "cappuccino", "coffee"],
    url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=85&auto=format&fit=crop" },
  { keys: ["energy drink", "red bull", "monster", "sports drink"],
    url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=800&q=85&auto=format&fit=crop" },
  { keys: ["lemonade", "nimbu pani", "lemon drink"],
    url: "https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=800&q=85&auto=format&fit=crop" },
  { keys: ["beer", "lager", "ale", "kingfisher", "heineken"],
    url: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=800&q=85&auto=format&fit=crop" },
  { keys: ["wine", "red wine", "white wine", "champagne", "rosé"],
    url: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=85&auto=format&fit=crop" },

  // ── Snacks & Packaged Food ────────────────────────────────────────────────
  { keys: ["chips", "crisps", "namkeen"],
    url: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=800&q=85&auto=format&fit=crop" },
  { keys: ["biscuit", "cookie", "crackers"],
    url: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=800&q=85&auto=format&fit=crop" },
  { keys: ["chocolate", "candy bar"],
    url: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=800&q=85&auto=format&fit=crop" },
  { keys: ["popcorn", "pop corn"],
    url: "https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=800&q=85&auto=format&fit=crop" },
  { keys: ["candy", "sweets", "gummies", "lollipop", "toffee", "eclairs"],
    url: "https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=800&q=85&auto=format&fit=crop" },
  { keys: ["nuts", "almonds", "cashews", "peanuts", "dry fruits", "walnuts", "pistachios"],
    url: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800&q=85&auto=format&fit=crop" },

  // ── Bread, Bakery & Cereal ────────────────────────────────────────────────
  { keys: ["bread", "white bread", "brown bread", "whole wheat bread", "pav"],
    url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=85&auto=format&fit=crop" },
  { keys: ["cereal", "cornflakes", "muesli", "granola", "oat", "oatmeal", "kellogs"],
    url: "https://images.unsplash.com/photo-1521483451569-e33803c0330c?w=800&q=85&auto=format&fit=crop" },
  { keys: ["flour", "atta", "maida", "wheat flour", "rice flour"],
    url: "https://images.unsplash.com/photo-1587049633312-d628ae50a8ae?w=800&q=85&auto=format&fit=crop" },
  { keys: ["cake", "pastry", "muffin", "cupcake"],
    url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=85&auto=format&fit=crop" },

  // ── Rice, Lentils & Staples ───────────────────────────────────────────────
  { keys: ["rice", "basmati", "sona masoori", "white rice", "brown rice"],
    url: "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=800&q=85&auto=format&fit=crop" },
  { keys: ["dal", "lentils", "toor dal", "moong dal", "chana dal", "urad dal"],
    url: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&q=85&auto=format&fit=crop" },
  { keys: ["pasta", "noodles", "macaroni", "spaghetti", "maggi"],
    url: "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=800&q=85&auto=format&fit=crop" },
  { keys: ["sugar", "white sugar", "brown sugar", "icing sugar", "jaggery", "gur"],
    url: "https://images.unsplash.com/photo-1559181567-c3190ca9be46?w=800&q=85&auto=format&fit=crop" },
  { keys: ["salt", "rock salt", "sea salt", "table salt", "iodized"],
    url: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&q=85&auto=format&fit=crop" },

  // ── Oils, Spices & Condiments ─────────────────────────────────────────────
  { keys: ["oil", "cooking oil", "sunflower oil", "olive oil", "coconut oil", "mustard oil", "vegetable oil"],
    url: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&q=85&auto=format&fit=crop" },
  { keys: ["spice", "masala", "turmeric", "chilli powder", "cumin", "coriander", "pepper", "garam masala"],
    url: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&q=85&auto=format&fit=crop" },
  { keys: ["sauce", "ketchup", "mayo", "mayonnaise", "tomato sauce", "soy sauce", "mustard sauce"],
    url: "https://images.unsplash.com/photo-1514190051997-0f6f39ca5cde?w=800&q=85&auto=format&fit=crop" },
  { keys: ["vinegar", "balsamic", "apple cider vinegar"],
    url: "https://images.unsplash.com/photo-1587049633312-d628ae50a8ae?w=800&q=85&auto=format&fit=crop" },
  { keys: ["honey", "natural honey", "organic honey"],
    url: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&q=85&auto=format&fit=crop" },
  { keys: ["jam", "marmalade", "jelly", "fruit spread"],
    url: "https://images.unsplash.com/photo-1600189020440-3d3dcd7bb1c2?w=800&q=85&auto=format&fit=crop" },
  { keys: ["peanut butter", "almond butter"],
    url: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=800&q=85&auto=format&fit=crop" },

  // ── Dairy & Eggs ──────────────────────────────────────────────────────────
  { keys: ["butter", "salted butter", "unsalted butter", "amul butter"],
    url: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=800&q=85&auto=format&fit=crop" },
  { keys: ["cheese", "cheddar", "mozzarella", "paneer", "cottage cheese"],
    url: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&q=85&auto=format&fit=crop" },
  { keys: ["yogurt", "curd", "greek yogurt", "dahi"],
    url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=85&auto=format&fit=crop" },
  { keys: ["egg", "eggs", "hen egg", "white egg", "brown egg", "half dozen"],
    url: "https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=800&q=85&auto=format&fit=crop" },
  { keys: ["cream", "heavy cream", "whipping cream", "fresh cream"],
    url: "https://images.unsplash.com/photo-1614777986387-015c2a89c853?w=800&q=85&auto=format&fit=crop" },
  { keys: ["ice cream", "gelato", "frozen dessert"],
    url: "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=800&q=85&auto=format&fit=crop" },

  // ── Fruits ────────────────────────────────────────────────────────────────
  { keys: ["apple", "red apple", "green apple", "fuji apple"],
    url: "https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=800&q=85&auto=format&fit=crop" },
  { keys: ["banana", "plantain"],
    url: "https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=800&q=85&auto=format&fit=crop" },
  { keys: ["mango", "alphonso", "kesar mango", "raw mango"],
    url: "https://images.unsplash.com/photo-1553279768-865429fa0078?w=800&q=85&auto=format&fit=crop" },
  { keys: ["orange", "navel orange", "blood orange", "kinnow"],
    url: "https://images.unsplash.com/photo-1547514701-42782101795e?w=800&q=85&auto=format&fit=crop" },
  { keys: ["grapes", "black grapes", "green grapes"],
    url: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=800&q=85&auto=format&fit=crop" },
  { keys: ["strawberry", "berries", "blueberry", "raspberry"],
    url: "https://images.unsplash.com/photo-1587393855524-087f83d95bc9?w=800&q=85&auto=format&fit=crop" },
  { keys: ["watermelon", "musk melon", "cantaloupe"],
    url: "https://images.unsplash.com/photo-1563114773-84221bd62daa?w=800&q=85&auto=format&fit=crop" },
  { keys: ["pineapple"],
    url: "https://images.unsplash.com/photo-1589820296156-2454bb8a6ad1?w=800&q=85&auto=format&fit=crop" },
  { keys: ["papaya", "paw paw"],
    url: "https://images.unsplash.com/photo-1617112848923-cc2234396a8d?w=800&q=85&auto=format&fit=crop" },
  { keys: ["pomegranate", "anar"],
    url: "https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=800&q=85&auto=format&fit=crop" },
  { keys: ["coconut", "tender coconut"],
    url: "https://images.unsplash.com/photo-1580984969071-a8da8d7f64e9?w=800&q=85&auto=format&fit=crop" },
  { keys: ["lemon", "lime"],
    url: "https://images.unsplash.com/photo-1568471173242-461f0a730452?w=800&q=85&auto=format&fit=crop" },

  // ── Vegetables ────────────────────────────────────────────────────────────
  { keys: ["tomato", "cherry tomato"],
    url: "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=800&q=85&auto=format&fit=crop" },
  { keys: ["potato", "aloo", "sweet potato"],
    url: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=800&q=85&auto=format&fit=crop" },
  { keys: ["onion", "red onion", "spring onion", "shallot"],
    url: "https://images.unsplash.com/photo-1508747703725-719777637510?w=800&q=85&auto=format&fit=crop" },
  { keys: ["carrot", "baby carrot"],
    url: "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=800&q=85&auto=format&fit=crop" },
  { keys: ["capsicum", "bell pepper", "pepper"],
    url: "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=800&q=85&auto=format&fit=crop" },
  { keys: ["spinach", "palak"],
    url: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=800&q=85&auto=format&fit=crop" },
  { keys: ["cabbage", "patta gobhi"],
    url: "https://images.unsplash.com/photo-1582284540020-8acbe03f4924?w=800&q=85&auto=format&fit=crop" },
  { keys: ["broccoli"],
    url: "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=800&q=85&auto=format&fit=crop" },
  { keys: ["cauliflower", "gobi"],
    url: "https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?w=800&q=85&auto=format&fit=crop" },
  { keys: ["cucumber", "kheera"],
    url: "https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=800&q=85&auto=format&fit=crop" },
  { keys: ["ginger", "adrak"],
    url: "https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=800&q=85&auto=format&fit=crop" },
  { keys: ["garlic", "lehsun"],
    url: "https://images.unsplash.com/photo-1501420193-9c97c62d49d9?w=800&q=85&auto=format&fit=crop" },
  { keys: ["mushroom"],
    url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=85&auto=format&fit=crop" },
  { keys: ["corn", "maize", "sweet corn", "bhutta"],
    url: "https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=800&q=85&auto=format&fit=crop" },

  // ── Meat & Seafood ────────────────────────────────────────────────────────
  { keys: ["chicken", "broiler", "chicken breast", "chicken leg", "whole chicken"],
    url: "https://images.unsplash.com/photo-1604503468506-a8da13d11d36?w=800&q=85&auto=format&fit=crop" },
  { keys: ["mutton", "lamb", "goat"],
    url: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=800&q=85&auto=format&fit=crop" },
  { keys: ["fish", "salmon", "tuna", "tilapia", "rohu", "catla", "seafood"],
    url: "https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=800&q=85&auto=format&fit=crop" },
  { keys: ["prawn", "shrimp", "lobster", "crab"],
    url: "https://images.unsplash.com/photo-1565680018093-ebb6b9ab5460?w=800&q=85&auto=format&fit=crop" },

  // ── Personal Care ─────────────────────────────────────────────────────────
  { keys: ["shampoo", "head & shoulders", "pantene", "dove shampoo"],
    url: "https://images.unsplash.com/photo-1585232350881-1b1f7e0e02dc?w=800&q=85&auto=format&fit=crop" },
  { keys: ["soap", "bathing soap", "dove", "lux", "dettol", "lifebuoy"],
    url: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=800&q=85&auto=format&fit=crop" },
  { keys: ["toothpaste", "colgate", "pepsodent", "sensodyne"],
    url: "https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=800&q=85&auto=format&fit=crop" },
  { keys: ["toothbrush", "electric toothbrush"],
    url: "https://images.unsplash.com/photo-1559591937-bdb5be7e2fc6?w=800&q=85&auto=format&fit=crop" },
  { keys: ["deodorant", "deo", "body spray", "perfume"],
    url: "https://images.unsplash.com/photo-1541643600914-78b084683702?w=800&q=85&auto=format&fit=crop" },
  { keys: ["lotion", "moisturizer", "body lotion", "skin cream", "sunscreen"],
    url: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=85&auto=format&fit=crop" },
  { keys: ["face wash", "face cream", "cleanser", "toner", "serum"],
    url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=85&auto=format&fit=crop" },

  // ── Household & Cleaning ──────────────────────────────────────────────────
  { keys: ["detergent", "washing powder", "ariel", "surf excel", "tide", "rin"],
    url: "https://images.unsplash.com/photo-1631376640912-cb8f0e26d29c?w=800&q=85&auto=format&fit=crop" },
  { keys: ["dish soap", "dishwash", "vim", "pril", "fairy"],
    url: "https://images.unsplash.com/photo-1590439471364-192aa70c0b53?w=800&q=85&auto=format&fit=crop" },
  { keys: ["floor cleaner", "phenyl", "lizol", "colin", "surface cleaner"],
    url: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&q=85&auto=format&fit=crop" },
  { keys: ["tissue", "tissue paper", "napkins", "toilet paper"],
    url: "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=800&q=85&auto=format&fit=crop" },
  { keys: ["garbage bag", "trash bag", "bin liner"],
    url: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=85&auto=format&fit=crop" },

  // ── Electronics & Misc ────────────────────────────────────────────────────
  { keys: ["battery", "cell", "aa battery", "aaa battery", "duracell", "energizer"],
    url: "https://images.unsplash.com/photo-1610563166150-b34df4f3bcd6?w=800&q=85&auto=format&fit=crop" },
  { keys: ["pen", "pencil", "ball pen", "gel pen", "stationery"],
    url: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800&q=85&auto=format&fit=crop" },
  { keys: ["notebook", "diary", "journal", "copy", "register"],
    url: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&q=85&auto=format&fit=crop" },

  // ── Frozen & Packaged Meals ───────────────────────────────────────────────
  { keys: ["frozen peas", "frozen corn", "frozen vegetables", "mixed veg"],
    url: "https://images.unsplash.com/photo-1617197349753-9a6d7a7c4f8f?w=800&q=85&auto=format&fit=crop" },
  { keys: ["pizza", "frozen pizza"],
    url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=85&auto=format&fit=crop" },
  { keys: ["soup", "instant soup"],
    url: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=85&auto=format&fit=crop" },

  // ── Catch-all fallbacks by category name ──────────────────────────────────
  { keys: ["beverage", "drink"],
    url: "https://images.unsplash.com/photo-1628557011490-cf30d7e2f4d7?w=800&q=85&auto=format&fit=crop" },
  { keys: ["dairy"],
    url: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=800&q=85&auto=format&fit=crop" },
  { keys: ["fruit"],
    url: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800&q=85&auto=format&fit=crop" },
  { keys: ["vegetable", "veggie"],
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=85&auto=format&fit=crop" },
  { keys: ["meat", "poultry"],
    url: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=800&q=85&auto=format&fit=crop" },
  { keys: ["snack", "snacks"],
    url: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=800&q=85&auto=format&fit=crop" },
  { keys: ["bakery", "baked"],
    url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=85&auto=format&fit=crop" },
  { keys: ["staple", "grocery", "grain"],
    url: "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=800&q=85&auto=format&fit=crop" },
  { keys: ["personal care", "hygiene", "health"],
    url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=85&auto=format&fit=crop" },
  { keys: ["household", "cleaning", "home"],
    url: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&q=85&auto=format&fit=crop" },
];

// Default fallback if nothing matches
const DEFAULT_IMG =
  "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=85&auto=format&fit=crop";

/**
 * Find the best matching image URL for a product.
 * Checks (name + category) against our keyword map in priority order.
 */
function findImage(name = "", cat = "") {
  const combined = `${name} ${cat}`.toLowerCase();
  for (const entry of IMAGE_MAP) {
    for (const kw of entry.keys) {
      if (combined.includes(kw)) {
        return entry.url;
      }
    }
  }
  return DEFAULT_IMG;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔄  Connecting to Firestore …");

  const snap = await getDocs(collection(db, "products"));
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`📦  Found ${products.length} product(s) in Firestore.\n`);

  if (products.length === 0) {
    console.log("⚠️   No products found — add some products first via the Admin Panel.");
    process.exit(0);
  }

  let updated = 0;
  let skipped = 0;

  const forceUpdate = process.argv.includes("--force");

  for (const product of products) {
    const name = product.name || "";
    const cat  = product.cat  || "";

    // Skip products that already have an online image URL (unless --force flag)
    // base64 strings start with "data:" — always replace those.
    if (!forceUpdate && product.img && product.img.length > 50 && !product.img.startsWith("data:")) {
      console.log(`  ⏭️   [SKIP] "${name}" — already has an online image URL`);
      skipped++;
      continue;
    }

    const imageUrl = findImage(name, cat);

    try {
      await updateDoc(doc(db, "products", product.id), { img: imageUrl });
      console.log(`  ✅  [UPDATED] "${name}" (${cat}) → ${imageUrl.substring(0, 70)}…`);
      updated++;
    } catch (err) {
      console.error(`  ❌  [ERROR] "${name}": ${err.message}`);
    }

    // Small delay to stay well under Firestore write quota
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`\n🎉  Done! Updated: ${updated} | Skipped: ${skipped} | Total: ${products.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌  Fatal error:", err);
  process.exit(1);
});
