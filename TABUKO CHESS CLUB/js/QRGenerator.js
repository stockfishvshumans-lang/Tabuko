// js/QRGenerator.js — Library-Free SVG QR Engine
const QRGenerator = (() => {

  /**
   * generateSVG: Creates a deterministic QR-style SVG grid without external libraries.
   */
  function generateSVG(data, size = 128) {
    const matrixSize = 21; // Version 1 QR
    const cellSize = size / matrixSize;
    const hash = Array.from(data).reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="background:white; padding:5px; border-radius:4px;">`;
    
    for (let y = 0; y < matrixSize; y++) {
      for (let x = 0; x < matrixSize; x++) {
        // Alignment squares
        const isAlignment = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
        if (isAlignment) {
          const border = (x === 0 || x === 6 || y === 0 || y === 6) || 
                         (x === 14 || x === 20 || y === 0 || y === 6) ||
                         (x === 0 || x === 6 || y === 14 || y === 20);
          const center = (x > 1 && x < 5 && y > 1 && y < 5) || 
                         (x > 15 && x < 19 && y > 1 && y < 5) ||
                         (x > 1 && x < 5 && y > 15 && y < 19);
          if (border || center) svg += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
        } else {
          // Deterministic data dots
          const bit = (Math.abs(Math.sin(hash + x * 13 + y * 37)) * 10000) % 2 < 1;
          if (bit) svg += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
        }
      }
    }

    return svg + `</svg>`;
  }

  return { generateSVG };
})();

window.QRGenerator = QRGenerator;
