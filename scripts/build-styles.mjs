import { copyFileSync, mkdirSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'src/styles.css')

const vaultPath = process.env['VAULT_PATH']
const outDir = vaultPath ? `${vaultPath}/.obsidian/plugins/eisenhower-matrix-for-project-manager` : root
const outFile = join(outDir, 'styles.css')

function build() {
  mkdirSync(outDir, { recursive: true })
  copyFileSync(entry, outFile)
}

build()
console.log(`styles.css -> ${outFile}`)

if (process.argv.includes('--watch')) {
  let timer
  watch(entry, () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        build()
        console.log('styles.css rebuilt')
      } catch (error) {
        console.error(error.message)
      }
    }, 50)
  })
  console.log('watching src/styles.css')
}
