const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec("CREATE VIRTUAL TABLE t USING fts5(content, tokenize='porter unicode61')");
db.exec("INSERT INTO t(content) VALUES ('部署流水线重试上传三次')");
const qs = ['部署流水线重试上传三次', '"部署流水线重试上传三次"', '部署*', '*部署*', '上传'];
for (const q of qs) {
  try {
    const n = db.prepare('SELECT COUNT(*) AS n FROM t WHERE t MATCH ?').get(q).n;
    console.log(JSON.stringify(q), '->', n);
  } catch (e) {
    console.log(JSON.stringify(q), '-> ERR', String(e.message).slice(0, 70));
  }
}
// What tokens did unicode61 actually produce?
db.exec("CREATE VIRTUAL TABLE v USING fts5vocab(t, 'row')");
const terms = db.prepare('SELECT term FROM v').all().map(r => r.term);
console.log('tokens:', JSON.stringify(terms));
