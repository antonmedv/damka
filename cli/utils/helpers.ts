export function save(file: string, json: any) {
  require('fs').writeFileSync(file, JSON.stringify(json))
}

export function load(file: string): any {
  let data = require('fs').readFileSync(file).toString('utf8')
  return JSON.parse(data)
}
