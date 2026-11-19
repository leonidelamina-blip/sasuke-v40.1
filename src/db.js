const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const defaults = {
  groups: {}, users: {}, orders: [], receipts: [], rentals: [],
  admins: [], settings: { maintenance: false }
};
const file = path.join(DIR, 'database.json');
let state;
try { state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : defaults; }
catch { state = defaults; }
for (const [k,v] of Object.entries(defaults)) if (state[k] === undefined) state[k] = v;

function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}
function group(id) {
  if (!state.groups[id]) state.groups[id] = {
    active: true, admins: [], prices: [], payment: {},
    megas: [], wallet: {}, config: {}, createdAt: new Date().toISOString()
  };
  return state.groups[id];
}
module.exports = { state, save, group };
