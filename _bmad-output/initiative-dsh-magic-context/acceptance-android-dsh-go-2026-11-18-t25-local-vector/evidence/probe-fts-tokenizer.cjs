const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec("CREATE VIRTUAL TABLE t USING fts5(content, tokenize='porter unicode61')");
const rows = [
  'the deploy pipeline retries a failed upload three times',
  '部署流水线重试上传三次',
  '上传重试预算不得超过三次',
  '项目的记忆检索支持中文内容',
];
const ins = db.prepare('INSERT INTO t(content) VALUES (?)');
for (const r of rows) ins.run(r);
const queries = ['upload', 'retry pipeline', '部署', '上传', '重试', '部署流水线', '记忆 检索', 'Chinese'];
for (const q of queries) {
  try {
    const n = db.prepare('SELECT COUNT(*) AS n FROM t WHERE t MATCH ?').get(q).n;
    console.log(JSON.stringify(q), '->', n);
  } catch (e) {
    console.log(JSON.stringify(q), '-> ERR', String(e.message).slice(0, 70));
  }
}
