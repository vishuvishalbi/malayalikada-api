// One-off data repair: the original EPOS importer stored product weights in
// grams, but products.weight is kilograms (delivery fees depend on it).
// Fixes only rows whose name states the size ("200G", "5KG") AND whose stored
// weight equals that gram figure. Writes the changed rows to
// scripts/fix-weights-kg.log.json so the change can be reversed.
//   node scripts/fix-weights-kg.js          # dry run
//   node scripts/fix-weights-kg.js --apply  # write
require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
const re = /([\d.]+)\s*(kg|g)\b/i;
const apply = process.argv.includes('--apply');
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [rows] = await c.query('SELECT id, name, weight FROM products WHERE weight IS NOT NULL AND deleted_at IS NULL');
  const fixes = [];
  for (const r of rows) {
    const m = r.name.match(re); if (!m) continue;
    const v = parseFloat(m[1]); if (!(v > 0)) continue;
    const grams = m[2].toLowerCase() === 'kg' ? v * 1000 : v;
    const kg = Math.round((grams / 1000) * 1000) / 1000;
    const stored = Number(r.weight);
    if (Math.abs(stored - grams) < 0.001 && Math.abs(stored - kg) > 0.001) fixes.push({ id: r.id, name: r.name, from: stored, to: kg });
  }
  console.log(`${rows.length} products with weight, ${fixes.length} stored in grams`);
  console.log(fixes.slice(0, 5));
  if (apply) {
    fs.writeFileSync(__dirname + '/fix-weights-kg.log.json', JSON.stringify(fixes, null, 1));
    for (const f of fixes) await c.query('UPDATE products SET weight = ? WHERE id = ? AND weight = ?', [f.to, f.id, f.from]);
    console.log('applied; log at scripts/fix-weights-kg.log.json');
  } else {
    console.log('dry run — re-run with --apply to write');
  }
  await c.end();
})();
