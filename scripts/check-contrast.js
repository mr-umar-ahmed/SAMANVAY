#!/usr/bin/env node
/**
 * scripts/check-contrast.js
 * Automated theme contrast check: verifies WCAG 2.1 AA text contrast across light, dark, and sunlight themes.
 */

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

const THEME_PAIRS = [
  // Light Theme
  { theme: 'Light', fg: '#111111', bg: '#ffffff', desc: '--ink on --bg', min: 7.0 },
  { theme: 'Light', fg: '#4b5563', bg: '#ffffff', desc: '--ink-2 on --bg', min: 4.5 },
  { theme: 'Light', fg: '#1e3a8a', bg: '#edf5fd', desc: '--on-blue on --pastel-blue', min: 4.5 },
  { theme: 'Light', fg: '#3b2f8f', bg: '#d9dbfd', desc: '--on-lavender on --pastel-lavender', min: 4.5 },
  { theme: 'Light', fg: '#7a3e00', bg: '#f7ecd7', desc: '--on-yellow on --pastel-yellow', min: 4.5 },
  { theme: 'Light', fg: '#8b1e2d', bg: '#f1d5db', desc: '--on-pink on --pastel-pink', min: 4.5 },
  { theme: 'Light', fg: '#1b5e20', bg: '#cce9cd', desc: '--on-green on --pastel-green', min: 4.5 },

  // Dark Theme
  { theme: 'Dark', fg: '#f3f4f6', bg: '#111827', desc: '--ink on --bg', min: 7.0 },
  { theme: 'Dark', fg: '#9ca3af', bg: '#111827', desc: '--ink-2 on --bg', min: 4.5 },

  // Sunlight Theme
  { theme: 'Sunlight', fg: '#000000', bg: '#fffffe', desc: '--ink on --bg', min: 7.0 },
  { theme: 'Sunlight', fg: '#1f2937', bg: '#fffffe', desc: '--ink-2 on --bg', min: 4.5 },
];

let failed = 0;

for (const pair of THEME_PAIRS) {
  const ratio = contrast(pair.fg, pair.bg);
  if (ratio < pair.min) {
    console.error(`[CONTRAST FAILURE] ${pair.theme} theme: ${pair.desc} (${pair.fg} on ${pair.bg}) ratio ${ratio.toFixed(2)} < required ${pair.min}`);
    failed++;
  } else {
    console.log(`  ✓ ${pair.theme}: ${pair.desc} ratio ${ratio.toFixed(2)}:1 (passes ${pair.min}:1)`);
  }
}

if (failed > 0) {
  console.error(`❌ Contrast check failed: ${failed} token pair(s) failed WCAG AA.`);
  process.exit(1);
} else {
  console.log(`✅ Contrast check passed: all token pairs across Light, Dark, and Sunlight themes meet WCAG AA contrast.`);
  process.exit(0);
}
