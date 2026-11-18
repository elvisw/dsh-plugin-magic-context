// Empirical check: does the shipped local MiniLM (all-MiniLM-L6-v2) separate
// Chinese paraphrases from unrelated Chinese text?
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const cacheDir = path.join(os.homedir(), '.local', 'share', 'cortexkit', 'magic-context-dsh-poc', 'models');

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const texts = [
  '部署流水线在失败时会把上传重试三次',
  '上传失败最多重试三次',
  '发布流程失败会重新尝试上传三遍',
  '今天天气很好适合出门散步',
  'the deploy pipeline retries a failed upload three times',
];

(async () => {
  const modulePath = path.join(process.cwd(), 'lib', 'core', 'embedding-local.js');
  const { openLocalEmbedder } = await import(pathToFileURL(modulePath).href);
  const embedder = openLocalEmbedder({ cacheDir, logger: { info() {}, warn() {} } });
  const vectors = await embedder.embed(texts);
  if (vectors.length !== texts.length) {
    console.log('embed failed: got', vectors.length, 'of', texts.length);
    process.exitCode = 1;
    return;
  }
  console.log('dims', vectors[0].length);
  const pairs = [
    [0, 1, 'zh paraphrase'],
    [0, 2, 'zh paraphrase'],
    [1, 2, 'zh paraphrase'],
    [0, 3, 'zh unrelated'],
    [1, 3, 'zh unrelated'],
    [0, 4, 'zh vs en same meaning'],
  ];
  for (const [i, j, label] of pairs) {
    console.log(label.padEnd(24), cosine(vectors[i], vectors[j]).toFixed(4));
  }
})();
