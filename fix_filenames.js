const fs = require('fs');
const path = require('path');

// Target folder to scan and fix
const targetFolder = 'D:\\загрузки';

// CP1251 character mapping back to byte values
const cp1251Map = {
  'Ђ': 0x80, 'Ѓ': 0x81, '‚': 0x82, 'ѓ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  '€': 0x88, '‰': 0x89, 'Љ': 0x8A, '‹': 0x8B, 'Њ': 0x8C, 'Ќ': 0x8D, 'Ћ': 0x8E, 'Џ': 0x8F,
  'ђ': 0x90, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '™': 0x99, 'љ': 0x9A, '›': 0x9B, 'њ': 0x9C, 'ќ': 0x9D, 'ћ': 0x9E, 'џ': 0x9F,
  ' ': 0xA0, 'Ў': 0xA1, 'ў': 0xA2, 'Ј': 0xA3, '¤': 0xA4, 'Ґ': 0xA5, '¦': 0xA6, '§': 0xA7,
  'Ё': 0xA8, '©': 0xA9, 'Є': 0xAA, '«': 0xAB, '¬': 0xAC, '­': 0xAD, '®': 0xAE, 'Ї': 0xAF,
  '°': 0xB0, '±': 0xB1, 'І': 0xB2, 'і': 0xB3, 'Ґ': 0xB4, 'µ': 0xB5, '¶': 0xB6, '·': 0xB7,
  'ё': 0xB8, '№': 0xB9, 'є': 0xBA, '»': 0xBB, 'j': 0xBC, 'Ѕ': 0xBD, 'ѕ': 0xBE, 'ї': 0xBF,
  'А': 0xC0, 'Б': 0xC1, 'В': 0xC2, 'Г': 0xC3, 'Д': 0xC4, 'Е': 0xC5, 'Ж': 0xC6, 'З': 0xC7,
  'И': 0xC8, 'Й': 0xC9, 'К': 0xCA, 'Л': 0xCB, 'М': 0xCC, 'Н': 0xCD, 'О': 0xCE, 'П': 0xCF,
  'Р': 0xD0, 'С': 0xD1, 'Т': 0xD2, 'У': 0xD3, 'Ф': 0xD4, 'Х': 0xD5, 'Ц': 0xD6, 'Ч': 0xD7,
  'Ш': 0xD8, 'Щ': 0xD9, 'Ъ': 0xDA, 'Ы': 0xDB, 'Ь': 0xDC, 'Э': 0xDD, 'Ю': 0xDE, 'Я': 0xDF,
  'а': 0xE0, 'б': 0xE1, 'в': 0xE2, 'г': 0xE3, 'д': 0xE4, 'е': 0xE5, 'ж': 0xE6, 'з': 0xE7,
  'и': 0xE8, 'й': 0xE9, 'к': 0xEA, 'л': 0xEB, 'м': 0xEC, 'н': 0xED, 'о': 0xEE, 'п': 0xEF,
  'р': 0xF0, 'с': 0xF1, 'т': 0xF2, 'у': 0xF3, 'ф': 0xF4, 'х': 0xF5, 'ц': 0xF6, 'ч': 0xF7,
  'ш': 0xF8, 'щ': 0xF9, 'ъ': 0xFA, 'ы': 0xFB, 'ь': 0xFC, 'э': 0xFD, 'ю': 0xFE, 'я': 0xFF
};

// Decodes a double-UTF-8 CP1251 corrupted string
function fixCyrillicString(str) {
  const bytes = [];
  let hasCorruptIndicators = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = char.charCodeAt(0);
    
    if (cp1251Map[char] !== undefined) {
      bytes.push(cp1251Map[char]);
      if (char === 'Р' || char === 'С' || char === 'С') {
        hasCorruptIndicators = true;
      }
    } else if (code >= 0x00 && code <= 0x7F) {
      bytes.push(code);
    } else {
      // Fallback for CP1252 / CP1251 mismatches
      if (char === '’') { bytes.push(0x92); hasCorruptIndicators = true; }
      else if (char === '“') { bytes.push(0x93); hasCorruptIndicators = true; }
      else if (char === '”') { bytes.push(0x94); hasCorruptIndicators = true; }
      else if (char === '„') { bytes.push(0x84); hasCorruptIndicators = true; }
      else if (char === '™') { bytes.push(0x99); hasCorruptIndicators = true; }
      else if (char === '…') { bytes.push(0x85); hasCorruptIndicators = true; }
      else bytes.push(code & 0xFF);
    }
  }
  
  if (!hasCorruptIndicators) return str;
  
  try {
    const decoded = Buffer.from(bytes).toString('utf8');
    // Check if the result contains actual Russian letters to prevent false renames
    if (/[а-яА-ЯёЁ]/.test(decoded)) {
      return decoded;
    }
  } catch (e) {}
  
  return str;
}

// Recursively scans directories and fixes file names
function processDirectory(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory not found: ${dir}`);
    return;
  }
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      // Process subdirectory first (depth-first)
      processDirectory(fullPath);
      
      // Fix subdirectory name itself if needed
      const fixedName = fixCyrillicString(item);
      if (fixedName !== item) {
        const newPath = path.join(dir, fixedName);
        try {
          fs.renameSync(fullPath, newPath);
          console.log(`Renamed directory:\n  "${item}" -> "${fixedName}"`);
        } catch (err) {
          console.error(`Failed to rename directory "${item}":`, err.message);
        }
      }
    } else if (stats.isFile()) {
      const fixedName = fixCyrillicString(item);
      if (fixedName !== item) {
        const newPath = path.join(dir, fixedName);
        
        // Resolve target collision if file already exists
        let finalPath = newPath;
        let count = 1;
        const ext = path.extname(fixedName);
        const base = path.basename(fixedName, ext);
        while (fs.existsSync(finalPath)) {
          finalPath = path.join(dir, `${base} (${count})${ext}`);
          count++;
        }
        
        try {
          fs.renameSync(fullPath, finalPath);
          console.log(`Renamed file:\n  "${item}"\n  -> "${path.basename(finalPath)}"`);
        } catch (err) {
          console.error(`Failed to rename file "${item}":`, err.message);
        }
      }
    }
  }
}

console.log(`Starting filename repair scan in: ${targetFolder}`);
console.log('--------------------------------------------------');
processDirectory(targetFolder);
console.log('--------------------------------------------------');
console.log('Scan and repair completed.');
