import { parseMedia, isCategoryDir } from "/home/z/my-project/src/lib/source/parser";
import { parseAutoindex } from "/home/z/my-project/src/lib/source/autoindex";

console.log("isCategoryDir('serial/'):", isCategoryDir("serial/"));
const html = `<a href="../">../</a><a href="serial/">serial/</a><a href="Breaking.Bad/">Breaking.Bad/</a><a href="S01/">S01/</a>`;
const l = parseAutoindex(html, "http://x/serial/Breaking.Bad/");
console.log("dirs:", JSON.stringify(l.dirs));
const p = parseMedia(["serial", "Breaking.Bad", "S01"], "Breaking.Bad.S01E01.720p.mp4");
console.log("parsed:", p.title, p.type, p.season, p.episode, p.slug);
const p2 = parseMedia(["movie", "Inception.2010.1080p.BluRay.x264"], "Inception.2010.1080p.BluRay.x264.mp4");
console.log("parsed2:", p2.title, p2.type, p2.year, p2.quality, p2.slug);
const p3 = parseMedia(["serial", "کارآگاه شرلوک", "فصل 1"], "قسمت 1.mp4");
console.log("parsed3:", p3.title, p3.type, p3.season, p3.episode, p3.slug);
