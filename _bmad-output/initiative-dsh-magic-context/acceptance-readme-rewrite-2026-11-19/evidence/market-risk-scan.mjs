/**
 * Apply dsh-go-market's scripts/core.mjs scan() rules to a tarball that has
 * already been extracted, so no npm dependency is needed.
 *
 * Mirrors the upstream regexes verbatim (scripts/core.mjs:157-204 at
 * ccch1mneyyy/dsh-go-market). Nothing here is our invention: the point is to
 * report what the market's own scanner sees, with the file paths it attributes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.argv[2]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = new Map()
for (const abs of walk(root)) {
  files.set(relative(root, abs).split(sep).join('/'), readFileSync(abs))
}

const pkg = JSON.parse(files.get('package.json').toString('utf8'))

const LEVELS = {
  'install-scripts': 'high',
  'native-code': 'high',
  shell: 'medium',
  network: 'low',
  filesystem: 'medium',
  obfuscated: 'medium',
}
const evidence = {}
const add = (flag, path) => {
  const hits = (evidence[flag] ??= [])
  if (hits.length < 12 && !hits.includes(path)) hits.push(path)
}
if (['preinstall', 'install', 'postinstall'].some((k) => typeof pkg.scripts?.[k] === 'string' && pkg.scripts[k].trim())) {
  add('install-scripts', 'package.json')
}
for (const [path, buf] of files) {
  if (/(?:\.node|\.exe|\.dll|\.so(?:\.\d+)*|\.dylib|\.wasm)$|(?:^|\/)binding\.gyp$/i.test(path)
    || buf.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70]))
    || buf.subarray(0, 2).toString() === 'MZ'
    || ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(buf.subarray(0, 4).toString('hex'))) {
    add('native-code', path)
  }
  if (!/\.(?:[cm]?js|jsx|tsx?|sh|cjs)$/i.test(path)) continue
  const source = buf.toString('utf8')
  if (/\.sh$/i.test(path)) add('shell', path)
  if (/\b(?:child_process|execSync|execFile|spawnSync|spawn)\b|\b(?:exec|system)\s*\(/.test(source)) add('shell', path)
  if (/\bfetch\s*\(|\b(?:https?|wss?):\/\/|(?:from\s*|require\s*\()\s*['"](?:node:)?(?:https?|http2|net|tls|ws)['"]|\bWebSocket\b/.test(source)) add('network', path)
  if (/\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream|mkdir(?:Sync)?|rm(?:Sync)?|unlink(?:Sync)?|rename(?:Sync)?|copyFile(?:Sync)?)\s*\(/.test(source)) add('filesystem', path)
  if (buf.length > 100 * 1024 && (source.split('\n').some((line) => line.length > 2000) || /\b_0x[0-9a-f]+\b|eval\s*\(/i.test(source))) add('obfuscated', path)
}

const flags = Object.keys(LEVELS).filter((f) => evidence[f])
const level = flags.some((f) => LEVELS[f] === 'high')
  ? 'high'
  : flags.some((f) => LEVELS[f] === 'medium') ? 'medium' : flags.length ? 'low' : 'low'

console.log(JSON.stringify({ files: files.size, level, flags, evidence }, null, 2))
