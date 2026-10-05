// Loads the CSV tabs in ./data and compiles them (Node only).
const fs = require('fs');
const path = require('path');
const D = require('../src/data.js');
module.exports = function loadLocal(dir) {
  dir = dir || path.join(__dirname, '..', 'data');
  const tables = {};
  D.TABS.forEach(t => {
    const p = path.join(dir, t + '.csv');
    if (fs.existsSync(p)) tables[t] = fs.readFileSync(p, 'utf8');
  });
  return D.compileData(tables, { source: 'local csv' });
};
