// T24 local-model smoke: run the shipped WASM MiniLM on the phone, no network.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profile = path.join(home, 'profiles', 'web');
const cacheDir = path.join('/sdcard/Download/dsh-mc-t24', 'models');
const receipt = path.join('/sdcard/Download/dsh-mc-t24', 'phone-local-embed.json');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  const started = Date.now();
  const result = { at: new Date().toISOString(), cacheDir, assets: [] };
  try {
    const expected = {
      'model.onnx': '759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e',
      'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
      'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
    };
    for (const [name, digest] of Object.entries(expected)) {
      const file = path.join(cacheDir, name);
      result.assets.push({ name, bytes: fs.statSync(file).size, sha256: sha256(file) === digest });
    }
    const requireFromProfile = createRequire(path.join(profile, 'package.json'));
    const entry = requireFromProfile.resolve('@elvisw/dsh-magic-context');
    const modulePath = path.join(path.dirname(entry), 'core', 'embedding-local.js');
    result.entry = entry;
    result.modulePath = modulePath;
    const { openLocalEmbedder } = await import(pathToFileURL(modulePath).href);
    const logger = { info: () => {}, warn: () => {} };
    const embedder = openLocalEmbedder({ cacheDir, logger });
    const vectors = await embedder.embed(['Magic Context local embedding smoke', '本地嵌入模型测试']);
    const first = vectors[0];
    let norm = 0;
    for (const value of first) norm += value * value;
    result.vectors = vectors.map(vector => vector.length);
    result.first = { dims: first.length, norm: Math.sqrt(norm), head: [...first.slice(0, 4)] };
    result.elapsedMs = Date.now() - started;
    result.status = result.assets.every(asset => asset.sha256 === true) && first.length === 384 ? 'ok' : 'mismatch';
  } catch (error) {
    result.status = 'blocked';
    result.code = String(error.code || 'LOCAL_EMBED_FAILED');
    result.message = String(error.message || error).slice(0, 300);
    result.elapsedMs = Date.now() - started;
  }
  fs.writeFileSync(receipt, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({
    status: result.status,
    code: result.code,
    dims: result.first?.dims,
    elapsedMs: result.elapsedMs,
    assets: result.assets.map(asset => [asset.name, asset.bytes, asset.sha256]),
  }));
  if (result.status !== 'ok') process.exitCode = 1;
}

main().catch(error => {
  console.error(String(error && error.stack || error).slice(0, 1000));
  process.exitCode = 1;
});
