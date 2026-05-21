import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import * as xlsx from 'xlsx';
import fs from 'fs';

const prisma = new PrismaClient();
const app = express();
const upload = multer({ dest: 'uploads/' });

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

const PORT = 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
