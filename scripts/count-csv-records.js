/* ============================================
   AGOGE - Compte les VRAIS enregistrements CSV
   Machine à états identique aux paramètres de LOAD DATA :
   - FIELDS TERMINATED BY '\t'
   - OPTIONALLY ENCLOSED BY '"'
   - ESCAPED BY '\\'
   - LINES TERMINATED BY '\n'
   Un \n hors guillemets = fin d'un enregistrement.
   ============================================ */
const fs = require('fs');
const path = require('path');

const CSV_FILE = process.env.CSV_FILE || path.join(__dirname, '..', 'en.openfoodfacts.org.products.csv');

function countRecords(file) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(file, 'r');
    const stats = fs.fstatSync(fd);
    const chunkSize = 8 * 1024 * 1024;
    let buffer = Buffer.alloc(chunkSize);
    let position = 0;
    let records = 0;
    let inQuotes = false;
    let sawNonEmpty = false; // pour éviter de compter les lignes vides
    let firstRecord = true; // header
    let sawBackslash = false;
    let start = Date.now();

    function processChunk(buf) {
      for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (sawBackslash) {
          // caractère échappé par backslash : on l'ignore
          sawBackslash = false;
          if (b !== 0x0A) sawNonEmpty = true;
          continue;
        }
        if (inQuotes) {
          if (b === 0x22) { // "
            // vérifier si c'est un "" échappé
            if (i + 1 < buf.length && buf[i + 1] === 0x22) {
              i++; // on saute la 2e quote
            } else {
              inQuotes = false;
            }
          }
          // \n dans les guillemets = contenu, pas une fin d'enregistrement
        } else {
          if (b === 0x5C) { // backslash = début d'échappement
            sawBackslash = true;
            continue;
          }
          if (b === 0x22) {
            inQuotes = true;
          } else if (b === 0x0A) { // \n hors guillemets = fin d'enregistrement
            if (!firstRecord && sawNonEmpty) {
              records++;
            }
            firstRecord = false;
            sawNonEmpty = false;
          } else if (b !== 0x0D) { // \r ignoré (fin de ligne Windows)
            sawNonEmpty = true;
          }
        }
      }
    }

    fs.read(fd, buffer, 0, chunkSize, position, (err, bytesRead) => {
      if (err) return reject(err);
      processChunk(buffer.slice(0, bytesRead));
      position += bytesRead;

      function next() {
        if (position >= stats.size) {
          // Dernier enregistrement sans \n final
          if (sawNonEmpty && !firstRecord) records++;
          fs.closeSync(fd);
          resolve(records);
          return;
        }
        const toRead = Math.min(chunkSize, stats.size - position);
        fs.read(fd, buffer, 0, toRead, position, (e, br) => {
          if (e) return reject(e);
          processChunk(buffer.slice(0, br));
          position += br;
          if (records > 0 && records % 1000000 === 0) {
            console.log('  ...', records.toLocaleString('fr-FR'), 'enregistrements (', ((Date.now() - start) / 1000).toFixed(0), 's )');
          }
          next();
        });
      }
      next();
    });
  });
}

(async () => {
  if (!fs.existsSync(CSV_FILE)) {
    console.error('Fichier introuvable:', CSV_FILE);
    process.exit(1);
  }
  console.log('Comptage des VRAIS enregistrements CSV (état machine quote-aware)...');
  const start = Date.now();
  const records = await countRecords(CSV_FILE);
  console.log('Vrais enregistrements (hors header) :', records.toLocaleString('fr-FR'));
  console.log('Enregistrements dans la table MySQL :', 3423529..toLocaleString('fr-FR'));
  console.log('Durée:', ((Date.now() - start) / 1000).toFixed(0), 's');
})();

