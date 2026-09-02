const path = require('path');
const sharp = require('sharp');

async function createSubtleEmptySlot() {
  const destFile = path.join(__dirname, '..', 'public', 'map', 'slots', 'empty_slot.png');

  // Create a clean, elegant 128x128 isometric colonization beach foundation marker:
  // Light sandy stone base with a subtle wooden mooring dock and golden anchor symbol
  const svgBuffer = Buffer.from(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <!-- Drop Shadow -->
      <ellipse cx="64" cy="74" rx="42" ry="24" fill="rgba(0, 0, 0, 0.35)" filter="blur(3px)" />
      
      <!-- Stone Ring Base -->
      <ellipse cx="64" cy="70" rx="38" ry="20" fill="#78716c" stroke="#d6d3d1" stroke-width="2" />
      <ellipse cx="64" cy="67" rx="34" ry="17" fill="#a8a29e" />
      
      <!-- Inner Sand / Paved Foundation -->
      <ellipse cx="64" cy="65" rx="28" ry="14" fill="#e7e5e4" stroke="#ca8a04" stroke-width="1.5" stroke-dasharray="3 2" />

      <!-- Wooden Pier Planks -->
      <path d="M 46 62 L 82 62 M 48 66 L 80 66 M 52 70 L 76 70" stroke="#78350f" stroke-width="1.5" stroke-linecap="round" />

      <!-- Glowing Golden Anchor / Expansion Marker -->
      <g transform="translate(64, 52) scale(0.9)">
        <!-- Anchor Ring -->
        <circle cx="0" cy="-6" r="4" fill="none" stroke="#f59e0b" stroke-width="2.2" />
        <!-- Anchor Stem -->
        <line x1="0" y1="-2" x2="0" y2="12" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" />
        <!-- Crossbar -->
        <line x1="-7" y1="2" x2="7" y2="2" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" />
        <!-- Flukes Arc -->
        <path d="M -11 6 C -10 14, 10 14, 11 6" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" />
        <!-- Fluke points -->
        <polygon points="-12,4 -10,7 -8,5" fill="#f59e0b" />
        <polygon points="12,4 10,7 8,5" fill="#f59e0b" />
      </g>
    </svg>
  `);

  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(destFile);

  console.log('✅ Created subtle, high-resolution empty_slot.png foundation marker!');
}

createSubtleEmptySlot().catch(console.error);
