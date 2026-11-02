const fs = require('fs');
const path = require('path');

const readmePath = path.resolve(__dirname, '../../quixpos2jtl/README.md');
if (fs.existsSync(readmePath)) {
  console.log('=== QUIXPOS2JTL README ===');
  console.log(fs.readFileSync(readmePath, 'utf-8'));
}

const pkgPath = path.resolve(__dirname, '../../quixpos2jtl/package.json');
if (fs.existsSync(pkgPath)) {
  console.log('=== QUIXPOS2JTL PACKAGE.JSON ===');
  console.log(fs.readFileSync(pkgPath, 'utf-8'));
}
