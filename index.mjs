import got from "got";
import jsdom from "jsdom";
import fs from "fs-extra";
import { fileURLToPath, parse as urlParse } from "url";
import { dirname, join, parse } from "path";
import { promisify } from "util";
import stream from "stream";
const pipeline = promisify(stream.pipeline);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36"
};
async function main() {
  try {
    for (const origin of []) {
      const name = getName(origin);
      const dir = join(__dirname, "download", name);
      await fs.ensureDir(dir);
      await downloadPage(origin, dir, `${origin}/index.html`);
    }
  } catch (error) {
    console.log(error);
  }
}
async function downloadPage(origin, dir, url) {
  try {
    if (await fs.pathExists(join(dir, parse(url).base))) {
      return;
    }
    let body = (await got.get(url, { headers })).body;
    await fs.writeFile(join(dir, parse(url).base), body);
    const dom = new jsdom.JSDOM(body);
    const $ = dom.window.document;
    let css = [
      ...new Set(
        [...$.querySelectorAll("link")].map(el => el.getAttribute("href"))
      )
    ];
    let js = [
      ...new Set(
        [...$.querySelectorAll("script")].map(el => el.getAttribute("src"))
      )
    ];
    let images = [
      ...new Set(
        [...$.querySelectorAll("img")].map(el => el.getAttribute("src"))
      )
    ];
    // console.log(images);
    let links = [
      ...new Set(
        [...$.querySelectorAll("a")]
          .map(el => el.getAttribute("href"))
          .filter(h => !["#", "/"].includes(h))
      )
    ];
    await downloadAssets(origin, dir, js);
    await downloadAssets(origin, dir, images, true);
    await downloadAssets(origin, dir, css);
    let cssLinks = parseCSS(body, url);
    console.log({ cssLinks });
    await downloadAssets(origin, dir, cssLinks);
    for (const link of links) {
      if (/(^http(s)?:\/\/|^\/\/)/.test(link)) {
        continue;
      }

      console.log(`Scrapping ${link}`);
      await downloadPage(origin, dir, `${origin}/${link}`);
    }
  } catch (error) {
    console.log(error);
  }
}
/**
 *
 * @param {[string]} links
 */
async function downloadAssets(origin, dir, links, image = false) {
  for (let link of links) {
    try {
      let url = link;
      let p = link;
      if (/(^https?:\/\/|^\/\/)/.test(link) && !link.startsWith(origin)) {
        continue;
      }
      if (link.startsWith(origin)) {
        p = urlParse(link).pathname;
      } else {
        url = `${origin}/${link}`;
      }
      p = join(dir, p);

      if (await fs.pathExists(p)) {
        console.log(`${p} exists`);
        continue;
      }
      await fs.ensureDir(parse(p).dir);
      console.log(url);
      console.log(p);
      if (image || ![".css", ".html", ".js"].some(l => link.endsWith(l))) {
        await pipeline(
          got.stream.get(url, { headers }),
          fs.createWriteStream(p)
        );
      } else {
        let body = (await got(url, { headers })).body;
        if (link.endsWith(".css")) {
          let cssLinks = parseCSS(body, url);
          console.log(cssLinks);
          await downloadAssets(origin, dir, cssLinks);
        }
        await fs.writeFile(p, body);
      }
    } catch (error) {
      console.log(error);
    }
  }
}
/**
 *
 * @param {string} link
 */
function getName(link) {
  let l = link.split("/");
  if (l[l.length - 1].includes(".")) {
    return l[l.length - 1].replace(".", "_");
  }
  return l[l.length - 1];
}
/**
 *
 * @param {string} css
 */
function parseCSS(css, origin) {
  let f = css.match(
    /url\((?!['"]?(?:data:|https?:|\/\/))(['"]?)([^'")]*)\1\)/g
  );
  if (f && f.length) {
    return f.map(c => {
      for (const i of ["url", "'", '"', "(", ")", "`"]) {
        c = c.split(i).join("");
      }
      c = join(parse(origin).dir, c).replace(":/", "://");
      let p = urlParse(c);
      return `${p.protocol}//${p.hostname}${p.pathname}`;
    });
  }
  return [];
}
main();
