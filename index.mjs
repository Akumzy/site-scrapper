import got from 'got'
import jsdom from 'jsdom'
import fs from 'fs-extra'
import { fileURLToPath, parse as urlParse } from 'url'
import { dirname, join, parse } from 'path'
import { promisify } from 'util'
import stream from 'stream'
import { URL } from 'url'
const pipeline = promisify(stream.pipeline)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dist = join(__dirname, 'download')
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36'
}

async function main() {
  try {
    for (const origin of ['http://mehedi.asiandevelopers.com/demo/rinbuild/']) {
      const name = getName(origin)
      const dir = join(__dirname, 'download', name)
      await fs.ensureDir(dir)
      await downloadPage(origin, dir, origin)
    }
  } catch (error) {
    console.log(error)
  }
}
async function downloadPage(origin, dir, url) {
  try {
    let filename = parse(url).base
    if (!(/(.html?)$/).test(filename)) {
      filename = 'index.html'
    }
    let filepath = join(dir, filename)
    if (await fs.pathExists(filepath)) {
      return
    }
    let body = (await got.get(url, { headers })).body
    await fs.writeFile(filepath, body)
    const dom = new jsdom.JSDOM(body)
    const $ = dom.window.document
    let css = [...new Set([...$.querySelectorAll('link')].map(el => el.getAttribute('href')))]
    let js = [...new Set([...$.querySelectorAll('script')].map(el => el.getAttribute('src')))]
    let images = [...new Set([...$.querySelectorAll('img')].map(el => el.getAttribute('src')))]
   
    let links = [
      ...new Set(
        [...$.querySelectorAll('a')]
          .map(el => el.getAttribute('href'))
          .filter(h => {
            if (h.startsWith('#')) {
              return false
            } else if (/^(tel:|mailto:|\/\/)/.test(h)) {
              return false
            } else if (/^https?:/.test(h) && !h.startsWith(origin)) {
              return false
            }
            return true
          })
      )
    ]
    // return
    await downloadAssets(origin, dir, css)
    await downloadAssets(origin, dir, js)
    await downloadAssets(origin, dir, images, true)
    let cssLinks = parseCSS(body, url)
    await downloadAssets(origin, dir, cssLinks)
    for (const link of links) {
      if (/(^http(s)?:\/\/|^\/\/)/.test(link)) {
        continue
      }

      console.log(`Scrapping ${link}`)
      await downloadPage(origin, dir, `${origin}/${link}`)
    }
  } catch (error) {
    console.log(error)
  }
}
/**
 *
 * @param {[string]} links
 */
async function downloadAssets(origin, dir, links, image = false) {
  for (let link of links) {
    try {
      let url = link
      let local_path 
      if (/(^https?:\/\/|^\/\/)/.test(link) && !link.startsWith(origin)) {
        continue
      }
      if (!link.startsWith(origin)) {
        url = `${origin}/${link}`
      }
      local_path = join(dist, urlParse(url).pathname)

      if (await fs.pathExists(local_path)) {
        console.log(`${local_path} exists`)
        continue
      }
      await fs.ensureDir(parse(local_path).dir)
     
      if (image || !['.css', '.html', '.js'].some(l => link.endsWith(l))) {
        await pipeline(got.stream.get(url, { headers }), fs.createWriteStream(local_path))
      } else {
        let body = (await got(url, { headers })).body
        await fs.writeFile(local_path, body)

        if (link.endsWith('.css')) {
          let cssLinks = parseCSS(body, url)
          await downloadAssets(origin, dir, cssLinks)
        }
      }
    } catch (error) {
      console.log(error)
    }
  }
}
/**
 *
 * @param {string} link
 */
function getName(link) {
  let url = new URL(link)
  return url.pathname
}
/**
 *
 * @param {string} css
 */
function parseCSS(css, origin) {
  let f = css.match(/url\((?!['"]?(?:data:|https?:|\/\/))(['"]?)([^'")]*)\1\)/g)
  if (f && f.length) {
    return f.map(c => {
      for (const i of ['url', "'", '"', '(', ')', '`']) {
        c = c.split(i).join('')
      }
      c = join(parse(origin).dir, c).replace(':/', '://')
      let p = urlParse(c)
      return `${p.protocol}//${p.hostname}${p.pathname}`
    })
  }
  return []
}

main()
