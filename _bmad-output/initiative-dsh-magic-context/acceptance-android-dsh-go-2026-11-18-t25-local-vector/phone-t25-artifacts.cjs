// T25 Phase 3b: independently re-hash the artifacts that are still on the
// device, so the asset and tarball identities are recomputable by a reviewer
// instead of resting on a boolean the install receipt asserted.
//
// The corpus itself is gone (the profile was restored), so this cannot re-derive
// the lane labels; it only re-verifies the static inputs.
//
// Read-only.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = '/sdcard/Download/dsh-mc-t25';

const EXPECTED = {
  'models/model.onnx': {
    bytes: 90387606,
    sha256: '759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e',
  },
  'models/tokenizer.json': {
    bytes: 711661,
    sha256: 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  },
  'models/tokenizer_config.json': {
    bytes: 366,
    sha256: '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  },
  'elvisw-dsh-magic-context-0.18.0.tgz': {
    bytes: 4087402,
    sha256: '0ab7f5168bda13cf38db83c9af68067a14f5f78c764757ad80d73d0ce852aa30',
    sha512Base64: 'AHUrlgbHdj1Bqf8xxaO/9W5cEaoOopiHy7hBmQfVFQ8hx0Qf46E3HD5SIH55Co4qsEOZgTX9/4gEOCv4JhayTw==',
  },
};

const out = { at: new Date().toISOString(), root: ROOT, files: [] };

for (const [relative, expected] of Object.entries(EXPECTED)) {
  const file = path.join(ROOT, relative);
  const entry = { path: relative };
  try {
    const stat = fs.statSync(file);
    const bytes = fs.readFileSync(file);
    entry.bytes = stat.size;
    entry.expectedBytes = expected.bytes;
    entry.bytesMatch = stat.size === expected.bytes;
    entry.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    entry.expectedSha256 = expected.sha256;
    entry.sha256Match = entry.sha256 === expected.sha256;
    if (expected.sha512Base64 !== undefined) {
      entry.sha512Base64 = crypto.createHash('sha512').update(bytes).digest('base64');
      entry.expectedSha512Base64 = expected.sha512Base64;
      entry.sha512Match = entry.sha512Base64 === expected.sha512Base64;
    }
    entry.ok = entry.bytesMatch && entry.sha256Match && (entry.sha512Match !== false);
  } catch (error) {
    entry.ok = false;
    entry.error = String(error.message || error).slice(0, 120);
  }
  out.files.push(entry);
}

out.allOk = out.files.every((entry) => entry.ok === true);
out.status = out.allOk ? 'verified' : 'mismatch';

fs.writeFileSync(path.join(__dirname, 'phone-artifacts.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  status: out.status,
  files: out.files.map((entry) => ({
    path: entry.path, bytesMatch: entry.bytesMatch, sha256Match: entry.sha256Match,
    sha512Match: entry.sha512Match, sha256: entry.sha256,
  })),
}));
if (!out.allOk) process.exitCode = 1;
