#!/usr/bin/env node
/**
 * scripts/check-honesty.js
 * Automated honesty check: scans src/pages for fabricated metrics and fake stats.
 * All numbers shown on operational pages must be computed by the engine or recorded by the user.
 * Deck figures (+18.8%, -51.9%, 96.2%, etc.) are permitted ONLY on MethodPage.tsx.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagesDir = path.resolve(__dirname, '../src/pages');

const FORBIDDEN_PATTERNS = [
  { pattern: /\+?18\.8\s*%/g, desc: 'Fabricated +18.8% availability metric outside MethodPage' },
  { pattern: /-?51\.9\s*%/g, desc: 'Fabricated -51.9% downtime reduction metric outside MethodPage' },
  { pattern: /96\.2\s*%/g, desc: 'Fabricated 96.2% compliance metric outside MethodPage' },
  { pattern: /₹\s*12,\s*40,\s*000/g, desc: 'Fabricated ₹12,40,000 ROI placeholder' },
  { pattern: /value=["']\+?18\.8%["']/g, desc: 'Hardcoded +18.8% in StatTile value' },
  { pattern: /value=["']-?51\.9%["']/g, desc: 'Hardcoded -51.9% in StatTile value' },
  { pattern: /value=["']96\.2%["']/g, desc: 'Hardcoded 96.2% in StatTile value' },
];

function scanDir(dir) {
  let entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries = entries.concat(scanDir(fullPath));
    } else if (item.isFile() && (item.name.endsWith('.tsx') || item.name.endsWith('.ts'))) {
      entries.push(fullPath);
    }
  }
  return entries;
}

const files = scanDir(pagesDir);
let violations = 0;

for (const file of files) {
  const base = path.basename(file);
  if (base === 'MethodPage.tsx') continue; // Documented deck/method reference page

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Permit authorized optional reference target labels in DivisionBriefPage (BUILD-PLAN §Non-negotiables: behind SourceLabel)
    if (base === 'DivisionBriefPage.tsx' && /deck(Uptime|Downtime|Colocation)/.test(line)) return;

    for (const { pattern, desc } of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        console.error(`[HONESTY VIOLATION] ${path.relative(process.cwd(), file)}:${idx + 1}`);
        console.error(`  Line: ${line.trim()}`);
        console.error(`  Reason: ${desc}\n`);
        violations++;
      }
    }
  });
}

if (violations > 0) {
  console.error(`❌ Honesty check failed: ${violations} ungrounded metric(s) found outside MethodPage.`);
  process.exit(1);
} else {
  console.log(`✅ Honesty check passed: all scanned page files (${files.length}) contain zero fabricated metrics.`);
  process.exit(0);
}
