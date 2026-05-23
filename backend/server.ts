import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import * as xlsx from 'xlsx';
import fs from 'fs';
import dotenv from 'dotenv';
// @ts-ignore
import Razorpay from 'razorpay';
import crypto from 'crypto';

dotenv.config();

// ── MANUAL ENVIRONMENT KEY PARSER ──────────────────────────────────────────────
import path from 'path';
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().startsWith('#') || !line.includes('=')) continue;
      const parts = line.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (key === 'RAZORPAY_KEY_ID') {
        process.env.RAZORPAY_KEY_ID = val;
      } else if (key === 'RAZORPAY_KEY_SECRET') {
        process.env.RAZORPAY_KEY_SECRET = val;
      }
    }
    console.log("Manual loader - Active Keys loaded successfully.");
  }
} catch (e) {
  console.error("Manual environment loader error:", e);
}

const prisma = new PrismaClient();
const app = express();
const upload = multer({ dest: 'uploads/' });

// Initialize Razorpay client with credentials from environment
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Validation schema for product rows
const ProductRowSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  category: z.string().min(1, "Category is required"),
  selling_price: z.number().min(0, "Selling price must be valid"),
  stock_quantity: z.number().min(0, "Stock cannot be negative"),
  barcode: z.string().optional(),
  cost_price: z.number().optional(),
  image_url: z.string().optional(),
  tax_slab: z.string().optional(),
  expiry_date: z.string().optional(),
  variant: z.string().optional(),
  unit: z.string().optional(),
  supplier: z.string().optional(),
  sku: z.string().optional(),
});

app.post('/api/products/import-csv', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const fileContent = fs.readFileSync(file.path, 'utf-8');
    
    // Parse using PapaParse
    const parsed = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });
    
    const rawRows = parsed.data;
    const errors = [];
    const validRows = [];
    let duplicateCount = 0;
    
    // 1. Column mapping logic would be applied here based on requested aliases
    // Assuming frontend already mapped columns to standard names for this endpoint
    
    // 2. Validate and check duplicates
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i] as any;
      const parsedRow = {
        name: row.name || row.product_name || "",
        category: row.category || "Uncategorized",
        selling_price: parseFloat(row.selling_price || row.price || 0),
        stock_quantity: parseInt(row.stock_quantity || row.stock || 0, 10),
        barcode: row.barcode || undefined,
        sku: row.sku || undefined,
      };
      
      const validation = ProductRowSchema.safeParse(parsedRow);
      
      if (!validation.success) {
        errors.push({
          rowNumber: i + 2, // +1 for 0-index, +1 for header
          errorMessage: validation.error.issues.map((e: any) => e.message).join(", "),
          rawData: row
        });
        continue;
      }
      
      // Basic Duplicate Check
      const isDuplicate = await prisma.product.findFirst({
        where: {
          OR: [
            { barcode: parsedRow.barcode ? parsedRow.barcode : undefined },
            { sku: parsedRow.sku ? parsedRow.sku : undefined },
            { name: parsedRow.name }
          ]
        }
      });
      
      if (isDuplicate) {
        duplicateCount++;
        validRows.push({ ...parsedRow, originalRow: i + 2, duplicateMatch: true });
      } else {
        validRows.push({ ...parsedRow, originalRow: i + 2, duplicateMatch: false });
      }
    }
    
    fs.unlinkSync((req as any).file.path);
    
    res.json({
      totalRows: rawRows.length,
      validCount: validRows.length,
      invalidCount: errors.length,
      duplicateCount,
      validRows,
      errors
    });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/products/confirm-import', async (req: Request, res: Response) => {
  const { rows, filename, importedBy } = req.body;
  
  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      let successCount = 0;
      
      for (const row of rows) {
        // Skip invalid rows if they were passed somehow
        const validation = ProductRowSchema.safeParse(row);
        if (!validation.success) continue;
        
        const data = {
          name: row.name,
          category: row.category,
          price: row.selling_price,
          stock: row.stock_quantity,
          barcode: row.barcode,
          sku: row.sku,
        };
        
        // Upsert or create
        if (row.barcode || row.sku) {
          const existing = await tx.product.findFirst({
            where: {
              OR: [
                ...(row.barcode ? [{ barcode: row.barcode }] : []),
                ...(row.sku ? [{ sku: row.sku }] : [])
              ]
            }
          });
          
          if (existing) {
            await tx.product.update({
              where: { id: existing.id },
              data
            });
            successCount++;
            continue;
          }
        }
        
        await tx.product.create({ data });
        successCount++;
      }
      
      // Log History
      const history = await tx.importHistory.create({
        data: {
          filename: filename || "unknown.csv",
          importedBy: importedBy || "Admin",
          totalRows: rows.length,
          successRows: successCount,
          failedRows: rows.length - successCount,
          status: successCount > 0 ? "COMPLETED" : "FAILED"
        }
      });
      
      return history;
    });
    
    res.json({ success: true, history: result });
  } catch (error) {
    console.error("Transaction error:", error);
    res.status(500).json({ error: "Transaction failed. Rolled back." });
  }
});

// ─── RAZORPAY PAYMENT ENDPOINTS ───────────────────────────────────────────────

app.post('/api/payment/order', async (req: Request, res: Response) => {
  try {
    const { amount, cashierName } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const options = {
      amount: Math.round(amount * 100), // Convert INR to paise
      currency: "INR",
      receipt: `receipt_pos_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    // Record order in local SQLite/DB with PENDING status
    await prisma.transaction.create({
      data: {
        orderId: order.id,
        amount: parseFloat(amount),
        status: "PENDING",
        cashierName: cashierName || "POS Cashier",
      }
    });

    res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key'
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

app.post('/api/payment/verify', async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret';

    // Verify payment signature authenticity
    const hmac = crypto.createHmac('sha256', key_secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature === razorpay_signature) {
      // Valid cryptographic signature - payment is authentic
      await prisma.transaction.update({
        where: { orderId: razorpay_order_id },
        data: {
          status: "SUCCESS",
          paymentId: razorpay_payment_id
        }
      });
      res.json({ success: true, message: "Payment verified successfully!" });
    } else {
      // Signature mismatch
      await prisma.transaction.update({
        where: { orderId: razorpay_order_id },
        data: { status: "FAILED" }
      });
      res.status(400).json({ success: false, error: "Invalid signature! Transaction rejected." });
    }
  } catch (error) {
    console.error("Razorpay verification error:", error);
    res.status(500).json({ error: "Internal server error during verification" });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
