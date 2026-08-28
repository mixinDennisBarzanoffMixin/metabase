import fs from "node:fs"
import path from "node:path"

const names = ["runtime", "vendor", "styles", "app-main"]

export function alias(dir: string) {
  const files = fs.readdirSync(dir)
  const specs = [
    ...names.map((name) => [`${name}.hot.bundle.js`, new RegExp(`^${name}\\.[a-f0-9]+\\.js$`)] as const),
    ...names.slice(1).map((name) => [`${name}.css`, new RegExp(`^${name}\\.[a-f0-9]+\\.css$`)] as const),
  ]
  specs.forEach(([name, match]) => {
    const found = files.filter((file) => match.test(file))
    if (found.length !== 1) throw new Error(`Metabase desktop asset ${name} matched ${found.length} production files`)
    fs.copyFileSync(path.join(dir, found[0]), path.join(dir, name))
  })
}
