/* تولید build/icon.png از SVG بدون وابستگی به فونت (فقط شکل) */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b1b22"/>
      <stop offset="1" stop-color="#0a0a0c"/>
    </linearGradient>
    <linearGradient id="red" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4d57"/>
      <stop offset="1" stop-color="#d40812"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.4" r="0.7">
      <stop offset="0" stop-color="#e50914" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#e50914" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="url(#bg)"/>
  <rect width="1024" height="1024" rx="224" fill="url(#glow)"/>
  <rect x="192" y="192" width="640" height="640" rx="150" fill="url(#red)"/>
  <rect x="192" y="192" width="640" height="640" rx="150" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="10"/>
  <path d="M426 350 L700 512 L426 674 Z" fill="#ffffff"/>
</svg>`;

mkdirSync("build", { recursive: true });
const png = await sharp(Buffer.from(svg)).resize(1024, 1024).png().toBuffer();
writeFileSync("build/icon.png", png);
writeFileSync("scripts/icon-src.svg", svg);
console.log("build/icon.png written:", png.length, "bytes");
