// Pure BibTeX helpers (no browser APIs), loaded before background.js
// ---------- Finding a DOI in text / URLs ----------
const DOI_RE = /10\.\d{4,9}\/[^\s"'<>]+/i;
const ARXIV_ID = "(?:[a-z\\-]+(?:\\.[A-Za-z]{2})?\\/\\d{7}|\\d{4}\\.\\d{4,5})";
const ARXIV_URL_RE = new RegExp("arxiv\\.org\\/(?:abs|pdf|html)\\/(" + ARXIV_ID + ")", "i");
const ARXIV_PREFIX_RE = new RegExp("arxiv:\\s*(" + ARXIV_ID + ")", "i");

// Returns a DOI string or null. arXiv URLs / "arXiv:ID" become 10.48550/arXiv.ID.
// fromUrl = true also trims ?query, #fragment and page suffixes (/full, /pdf, ...).
function extractDoi(text, fromUrl) {
  if (!text) return null;
  let decoded = String(text);
  try { decoded = decodeURIComponent(decoded); } catch (e) {}
  const m = decoded.match(DOI_RE);
  if (m) {
    let doi = m[0];
    if (fromUrl) {
      doi = doi.split(/[?#]/)[0]
        .replace(/\/(full|pdf|epdf|abstract|abs|figures|references|suppl\w*)$/i, "")
        .replace(/\.pdf$/i, "");
    }
    // bioRxiv/medRxiv: drop version and page suffixes (…524001v1.full -> …524001)
    const pre = doi.match(/^10\.1101\/\d{4}\.\d{2}\.\d{2}\.\d+/);
    if (pre) return pre[0];
    return doi.replace(/[.,;:)\]}]+$/, "");
  }
  const a = decoded.match(ARXIV_URL_RE) || decoded.match(ARXIV_PREFIX_RE);
  if (a) return "10.48550/arXiv." + a[1];
  return null;
}

// ---------- Accents / punctuation -> LaTeX ----------
const ACCENTS = {"\u0300":"`","\u0301":"'","\u0302":"^","\u0303":"~","\u0304":"=",
  "\u0306":"u","\u0307":".","\u0308":"\"","\u030A":"r","\u030B":"H","\u030C":"v",
  "\u0323":"d","\u0327":"c","\u0328":"k","\u0331":"b"};
const SPECIAL = {"ß":"{\\ss}","ø":"{\\o}","Ø":"{\\O}","æ":"{\\ae}","Æ":"{\\AE}",
  "œ":"{\\oe}","Œ":"{\\OE}","ł":"{\\l}","Ł":"{\\L}","ı":"{\\i}"};
const PUNCT = {"\u2013":"--","\u2014":"---","\u2018":"`","\u2019":"'","\u201C":"``",
  "\u201D":"''","\u2010":"-","\u2011":"-","\u2212":"-","\u00A0":" ","\u2009":" ","\u202F":" "};

// M\u00fcller -> M{\"{u}}ller. Characters with no LaTeX equivalent (CJK etc.) are left alone.
function texify(str) {
  let out = "";
  for (const c of String(str).normalize("NFC")) {
    if (c.charCodeAt(0) < 128) { out += c; continue; }
    if (PUNCT[c]) { out += PUNCT[c]; continue; }
    if (SPECIAL[c]) { out += SPECIAL[c]; continue; }
    const d = c.normalize("NFD");
    const base = d[0], marks = Array.from(d.slice(1));
    if (marks.length && /[A-Za-z]/.test(base) && marks.every(m => ACCENTS[m])) {
      if (marks.length === 1 && marks[0] === "\u030A" && (base === "a" || base === "A")) {
        out += base === "a" ? "{\\aa}" : "{\\AA}";
        continue;
      }
      let inner = (base === "i" || base === "j") ? "\\" + base : base;
      for (const m of marks) inner = "\\" + ACCENTS[m] + "{" + inner + "}";
      out += "{" + inner + "}";
    } else {
      out += c;
    }
  }
  return out;
}

// Wrap acronyms / mixed-case / alphanumeric tokens in braces so BibTeX keeps their case:
// BERT -> {BERT}, mRNA -> {mRNA}, 3D -> {3D}. Existing {...}, $...$ and \commands are untouched.
function protectCaps(title) {
  if (!title || !/\p{Ll}/u.test(title)) return title;   // all-caps title: leave alone
  const parts = title.split(/(\{(?:[^{}]|\{[^{}]*\})*\}|\$[^$]*\$|\\[A-Za-z]+)/);
  return parts.map((seg, i) => i % 2 === 1 ? seg :
    seg.replace(/[\p{L}\p{N}]+/gu, tok => {
      const up = (tok.match(/\p{Lu}/gu) || []).length;
      const need = up >= 2 || /\p{Ll}\p{Lu}/u.test(tok) || (up >= 1 && /\p{N}/u.test(tok));
      return need ? "{" + tok + "}" : tok;
    })).join("");
}

function parseBibtex(s) {
  const m = s.match(/^\s*@(\w+)\s*\{\s*([^,\s]+)\s*,/);
  if (!m) return null;
  let i = m[0].length;
  const fields = [];
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length || s[i] === "}") break;
    const nm = s.slice(i).match(/^([A-Za-z][\w-]*)\s*=\s*/);
    if (!nm) break;
    i += nm[0].length;
    let val;
    if (s[i] === "{") {
      let depth = 0, j = i;
      for (; j < s.length; j++) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") { depth--; if (depth === 0) break; }
      }
      val = s.slice(i + 1, j); i = j + 1;
    } else if (s[i] === '"') {
      let depth = 0, j = i + 1;
      for (; j < s.length; j++) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") depth--;
        else if (s[j] === '"' && depth === 0) break;
      }
      val = s.slice(i + 1, j); i = j + 1;
    } else {
      const t = s.slice(i).match(/^[^,}\s]+/);
      if (!t) break;
      val = t[0]; i += val.length;
    }
    fields.push({ name: nm[1], value: val.trim() });
  }
  return { type: m[1], key: m[2], fields };
}

function getField(p, name) {
  const f = p.fields.find(x => x.name.toLowerCase() === name.toLowerCase());
  return f ? f.value : null;
}

// Smith_2013 -> Smith2013
function cleanKey(key) {
  return key.replace(/_(\d{4})$/, "$1");
}

const NO_TEXIFY = new Set(["url", "doi", "eprint"]);

function formatEntry(type, key, pairs) {
  const lines = pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([n, v]) => "  " + n + " = {" +
      (NO_TEXIFY.has(n.toLowerCase()) ? v : texify(v)) + "}");
  return "@" + type + "{" + key + ",\n" + lines.join(",\n") + "\n}";
}

// Ordinary DOIs: drop keywords, copyright, month; tidy key
function buildGeneric(p) {
  const drop = new Set(["keywords", "copyright", "month"]);
  const pairs = p.fields
    .filter(f => !drop.has(f.name.toLowerCase()))
    .map(f => [f.name, f.name.toLowerCase() === "title" ? protectCaps(f.value) : f.value]);
  return formatEntry(p.type, (getField(p, "author") && getField(p, "title") ? makeKey(p) : cleanKey(p.key)), pairs);
}

function arxivIdFromDoi(doi) {
  const m = doi.match(/^10\.48550\/arxiv\.(.+)$/i);
  return m ? m[1].replace(/v\d+$/i, "") : null;
}

function isPreprintServerDoi(doi) {
  return /^10\.1101\/\d{4}\.\d{2}\.\d{2}\.\d+/.test(doi);
}

const STOPWORDS = new Set(["a","an","the","of","on","in","for","to","and","or","but",
  "with","without","from","is","are","be","at","by","as","into","via","about","over",
  "under","between","towards","toward","using","how","what","why","when","do","does",
  "can","we","our","it","its","this","that","these","those","not"]);

const FOLD = {"ł":"l","Ł":"L","ø":"o","Ø":"O","æ":"ae","Æ":"AE","œ":"oe","Œ":"OE",
  "ß":"ss","đ":"d","Đ":"D","ð":"d","Ð":"D","þ":"th","Þ":"TH","ı":"i"};

function plain(s) {
  return String(s || "").replace(/[łŁøØæÆœŒßđĐðÐþÞı]/g, c => FOLD[c])
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\\[`'^"~=.]/g, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

// vaswani2017attention: first author surname + year + first meaningful title word
function makeKey(p, yearFallback) {
  const first = (getField(p, "author") || "").split(/\s+and\s+/)[0].trim();
  let last = first.includes(",") ? first.split(",")[0] : first.split(/\s+/).pop();
  const year = getField(p, "year") || yearFallback || "";
  const words = (getField(p, "title") || "").replace(/[{}]/g, "").split(/\s+/);
  const w = words.find(x => plain(x) && !STOPWORDS.has(plain(x))) || "";
  return plain(last) + year + plain(w);
}

function buildArxiv(p, id) {
  return formatEntry("article", makeKey(p), [
    ["title", protectCaps(getField(p, "title"))],
    ["author", getField(p, "author")],
    ["journal", "arXiv"],
    ["year", getField(p, "year")],
    ["doi", "arXiv:" + id],
    ["url", "https://arxiv.org/abs/" + id],
    ["note", "Preprint"]
  ]);
}

// server = "bioRxiv" | "medRxiv"; the URL has no version suffix, so it always points to the latest
function buildBiorxiv(p, doi, server) {
  const dm = doi.match(/^10\.1101\/(\d{4})\./);
  server = server === "medRxiv" ? "medRxiv" : "bioRxiv";
  return formatEntry("article", makeKey(p, dm && dm[1]), [
    ["title", protectCaps(getField(p, "title"))],
    ["author", getField(p, "author")],
    ["journal", server],
    ["year", getField(p, "year") || (dm && dm[1])],
    ["doi", doi],
    ["url", "https://www." + server.toLowerCase() + ".org/content/" + doi],
    ["note", "Preprint"]
  ]);
}

if (typeof module !== "undefined") {
  module.exports = { parseBibtex, buildGeneric, buildArxiv, buildBiorxiv,
    arxivIdFromDoi, isPreprintServerDoi, makeKey, texify, protectCaps, extractDoi };
}
