// T32: read what is actually installed in the web profile.
// usage: node phone-t32-diagnose.cjs
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const home = process.env.DSH_HOME || '/root/.dsh'
const base = path.join(home, 'profiles', 'web', 'node_modules', '@elvisw', 'dsh-magic-context')
const out = { home, base, exists: fs.existsSync(base), checkedAt: new Date().toISOString() }
try {
  if (out.exists) {
    const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'))
    out.version = pkg.version
    const file = path.join(base, 'lib', 'dsh', 'go-view.js')
    out.goViewExists = fs.existsSync(file)
    if (out.goViewExists) {
      const bytes = fs.readFileSync(file)
      const text = bytes.toString('utf8')
      out.goViewBytes = bytes.length
      out.goViewSha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      out.goViewMtime = fs.statSync(file).mtime.toISOString()
      // The short slice labels are the only strings this build adds.
      out.hasShareTools = text.includes("shareTools")
      out.hasToolDefinitionCategory = text.includes('categories: [c.system, c.tools, c.messages]')
    }
  }
} catch (error) {
  out.error = String(error && error.message ? error.message : error)
}
fs.writeFileSync(path.join(__dirname, 'phone-t32-diagnose.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out))
