// Renders the Pholo app icons (icon-512, icon-192, favicon.ico) as exact
// rasterizations of the DayDotDial mark from
// src/components/marketing/dot-theme.tsx, scaled from its 40px reference size.
// Re-run after changing the mark: node scripts/render-pholo-icons.mjs
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PAPER = "#f3f0e9";
const LINE = "#d6d0c2";
const INK = "#100e0c";
const HALO = "#e4e8fd";
const SIGNAL = "#1b36e0";
const DOTS = [
  { hex: SIGNAL }, // signal — active, twelve o'clock
  { hex: "#c9f24c" }, // volt
  { hex: "#f0623a" }, // ember
  { hex: "#4ecfa6" }, // mint
  { hex: "#6b45f2" }, // iris
];

function iconSvg(size) {
  const c = size / 2;
  // The dial occupies 80% of the canvas (safe inside the maskable zone),
  // keeping the 40px reference geometry exactly proportional.
  const d = size * 0.8;
  const R = d / 2;
  const k = d / 40; // scale factor from the 40px component
  const orbit = R - 7.5 * k;
  const ringR = R - 1 * k;
  const parts = [
    `<rect width="${size}" height="${size}" fill="${PAPER}"/>`,
    `<circle cx="${c}" cy="${c}" r="${R + 4 * k}" fill="${HALO}"/>`,
    `<circle cx="${c}" cy="${c}" r="${R + 2 * k}" fill="${PAPER}"/>`,
    `<circle cx="${c}" cy="${c}" r="${R + 1.5 * k}" fill="none" stroke="${LINE}" stroke-width="${2 * k}"/>`,
    `<circle cx="${c}" cy="${c}" r="${ringR}" fill="none" stroke="${LINE}" stroke-width="${1 * k}"/>`,
  ];
  DOTS.forEach((dot, i) => {
    const a = ((i * 72 - 90) * Math.PI) / 180;
    const x = c + Math.cos(a) * orbit;
    const y = c + Math.sin(a) * orbit;
    const r = (i === 0 ? 3.4 : 2.6) * k;
    const stroke =
      i === 0 ? ` stroke="${INK}" stroke-width="${0.9 * k}"` : "";
    const opacity = i === 0 ? 1 : 0.72;
    parts.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${dot.hex}"${stroke} opacity="${opacity}"/>`,
    );
  });
  parts.push(
    // .dial__core: 8px on the 40px dial.
    `<circle cx="${c}" cy="${c}" r="${4 * k}" fill="${SIGNAL}"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${parts.join("")}</svg>`;
}

// Minimal single-image ICO wrapping a PNG entry (widely supported).
function buildIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = 32; // width (32 = original size, 0 means 256)
  entry[1] = 32;
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8); // data size
  entry.writeUInt32LE(22, 12); // offset = 6 + 16
  return Buffer.concat([header, entry, png]);
}

const out = path.resolve("public");
const png512 = await sharp(Buffer.from(iconSvg(512))).png().toBuffer();
const png192 = await sharp(Buffer.from(iconSvg(192))).png().toBuffer();
const png32 = await sharp(Buffer.from(iconSvg(32))).png().toBuffer();
await fs.writeFile(path.join(out, "icons", "icon-512.png"), png512);
await fs.writeFile(path.join(out, "icons", "icon-192.png"), png192);
await fs.writeFile(path.join(out, "favicon.ico"), buildIco(png32));
console.log("rendered icon-512.png, icon-192.png, favicon.ico");
