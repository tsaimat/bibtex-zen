const MENU_ID = "doi-to-bibtex";
const COMMAND_ID = "copy-bibtex-page";

browser.contextMenus.create({
  id: MENU_ID,
  title: "Copy BibTeX from DOI / this page",
  contexts: ["selection", "link", "page"]
});

function notify(title, message) {
  browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icon.svg"),
    title,
    message
  });
}

async function shortcutHint() {
  try {
    const cmds = await browser.commands.getAll();
    const c = cmds.find(x => x.name === COMMAND_ID);
    return c && c.shortcut ? c.shortcut : null;
  } catch (e) { return null; }
}

// Runs inside the page: looks for the paper's own DOI / arXiv id in its metadata.
async function doiFromPageContent(tabId) {
  const code = `(function () {
    var DOI = /10\\.\\d{4,9}\\/[^\\s"'<>]+/;
    var metas = document.getElementsByTagName("meta");
    var arx = null, found = null;
    var names = ["citation_doi","dc.identifier","dc.identifier.doi","prism.doi","doi",
                 "bepress_citation_doi","rft_id","citation_pdf_url","og:url"];
    for (var i = 0; i < metas.length; i++) {
      var n = (metas[i].getAttribute("name") || metas[i].getAttribute("property") || "").toLowerCase();
      var c = metas[i].getAttribute("content") || "";
      if (n === "citation_arxiv_id" && c) arx = c;
      if (!found && names.indexOf(n) >= 0 && DOI.test(c)) found = c;
    }
    if (arx) return "arXiv:" + arx;
    if (found) return found;
    var ld = document.querySelectorAll('script[type="application/ld+json"]');
    for (var j = 0; j < ld.length; j++) {
      var m = ld[j].textContent.match(DOI);
      if (m) return m[0];
    }
    var a = document.querySelector('a[href*="doi.org/10."]');
    return a ? "GUESS:" + a.href : "";
  })()`;
  try {
    const res = await browser.tabs.executeScript(tabId, { code });
    return (res && res[0]) || null;
  } catch (e) {
    return null;   // e.g. built-in PDF viewer or restricted pages
  }
}

async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

async function fetchBibtex(doi) {
  let resp;
  try {
    resp = await fetchWithTimeout("https://doi.org/" + encodeURI(doi), {
      headers: { Accept: "application/x-bibtex" },
      redirect: "follow"
    });
  } catch (e) {
    throw new Error(e && e.name === "AbortError"
      ? "the request timed out"
      : "network error, check your connection");
  }
  if (resp.status === 404) throw new Error("doi.org has no record of this DOI (check it for typos)");
  if (!resp.ok) throw new Error("doi.org returned HTTP " + resp.status);
  const text = (await resp.text()).trim();
  if (!text.startsWith("@")) throw new Error("the DOI registry returned no BibTeX for it");
  return text;
}

// "bioRxiv" or "medRxiv" (they share the 10.1101 prefix); defaults to bioRxiv on failure
async function fetchPreprintServer(doi) {
  for (const server of ["biorxiv", "medrxiv"]) {
    try {
      const resp = await fetchWithTimeout(
        "https://api.biorxiv.org/details/" + server + "/" + encodeURI(doi));
      if (!resp.ok) continue;
      const coll = (await resp.json()).collection || [];
      if (coll.length) return server === "medrxiv" ? "medRxiv" : "bioRxiv";
    } catch (e) { /* try next */ }
  }
  return "bioRxiv";
}

async function buildEntry(doi) {
  const raw = await fetchBibtex(doi);
  const p = parseBibtex(raw);
  if (!p) return raw;

  const arxivId = arxivIdFromDoi(doi);
  if (arxivId) return buildArxiv(p, arxivId);
  if (isPreprintServerDoi(doi)) return buildBiorxiv(p, doi, await fetchPreprintServer(doi));
  return buildGeneric(p);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// Selected text on the page (also inside text boxes and iframes), "" if none
async function selectionFromPage(tabId) {
  const code = `(function () {
    var a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") &&
        typeof a.selectionStart === "number" && a.selectionEnd > a.selectionStart) {
      return a.value.substring(a.selectionStart, a.selectionEnd);
    }
    var s = window.getSelection();
    return s ? s.toString() : "";
  })()`;
  try {
    const res = await browser.tabs.executeScript(tabId, { code, allFrames: true });
    return (res || []).find(x => x && x.trim()) || "";
  } catch (e) { return ""; }
}

// Shared by the right-click menu and the keyboard shortcut.
async function run({ selectionText, linkUrl, pageUrl, tabId }) {
  const warnings = [];
  let doi = extractDoi(selectionText, false);
  if (!doi && selectionText && selectionText.trim()) {
    warnings.push("your selection contained no DOI, so the page's DOI was used");
  }
  if (!doi) doi = extractDoi(linkUrl, true);
  if (!doi) doi = extractDoi(pageUrl, true);
  if (!doi && tabId != null) {
    let v = await doiFromPageContent(tabId);
    if (v && v.startsWith("GUESS:")) {
      v = v.slice(6);
      warnings.push("the DOI was guessed from a link on the page, please verify it");
    }
    doi = extractDoi(v, true);
  }

  if (!doi) {
    const sc = await shortcutHint();
    notify("\u26A0 No DOI found",
      "Couldn't find a DOI for this page. Select the exact DOI (e.g. 10.1038/nature12373) " +
      "and " + (sc ? "press " + sc + " or " : "") + "right-click \u2192 Copy BibTeX.");
    return;
  }

  try {
    await copy(await buildEntry(doi));
    if (warnings.length) {
      notify("\u26A0 BibTeX copied, but check it", doi + ": " + warnings.join("; ") + ".");
    } else {
      notify("BibTeX copied", doi);
    }
  } catch (e) {
    notify("\u26A0 BibTeX lookup failed",
      doi + ": " + String(e.message || e) +
      ". If the DOI looks wrong, select the exact DOI and try again.");
  }
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  return run({
    selectionText: info.selectionText,
    linkUrl: info.linkUrl,
    pageUrl: info.pageUrl || (tab && tab.url),
    tabId: tab ? tab.id : null
  });
});

browser.commands.onCommand.addListener(async (name) => {
  if (name !== COMMAND_ID) return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  return run({
    selectionText: await selectionFromPage(tab.id),
    pageUrl: tab.url,
    tabId: tab.id
  });
});
