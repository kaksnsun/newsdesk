// Stable row keys let SQLite update a draft without rewriting other articles.
const collections = ['projects', 'personalStyles', 'writings', 'sources'];
export function encodeLibrary(state) {
 const rows = new Map();
 function put(key, object) {
  const data = {...object}, children = {};
  for (const field of collections) {
   const list = data[field];
   if (!Array.isArray(list) || !list.every(x => x && typeof x.id === 'string') ||
       new Set(list.map(x => x.id)).size !== list.length) continue;
   delete data[field];
   children[field] = list.map(x => {
    const child = key + '/' + field + '/' + encodeURIComponent(x.id);
    put(child, x);
    return child;
   });
  }
  let researchKey;
  if (data.research && typeof data.research === 'object' && !Array.isArray(data.research)) {
   researchKey=key+'/research';
   put(researchKey,data.research);
   delete data.research;
  }
  rows.set(key, JSON.stringify({data, children,researchKey}));
 }
 put('root', state);
 return rows;
}
export function decodeLibrary(rows) {
 if (!rows.size) return {};
 const seen = new Set();
 function read(key) {
  if (seen.has(key) || !rows.has(key)) throw Error('Invalid library records');
  seen.add(key);
  const {data, children,researchKey} = JSON.parse(rows.get(key));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid library record');
  for (const [field, keys] of Object.entries(children)) {
   if (!collections.includes(field) || !Array.isArray(keys)) throw Error('Invalid library collection');
   data[field] = keys.map(read);
  }
  if(researchKey)data.research=read(researchKey);
  return data;
 }
 const state = read('root');
 if (rows.size !== seen.size) throw Error('Invalid library index');
 return state;
}
