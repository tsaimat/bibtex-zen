# bibtex-zen

A small Firefox/[Zen](https://zen-browser.app) extension that copies a clean BibTeX entry to your clipboard from a DOI, a DOI link, or the page you are on.

## Usage

- **Right-click** a selected DOI, a DOI link, or anywhere on a paper's page and choose **Copy BibTeX from DOI / this page**.
- Or press the shortcut (default **Alt+Shift+B**) to do the same for your selection or the current page.

DOIs are found, in order, in: selected text, a link, the page URL, the page's metadata, and (as a last resort, with a warning) the first `doi.org` link on the page. arXiv URLs and `arXiv:ID` also work.

If no DOI is found or the lookup fails, you get a ⚠ notification explaining why.

## Output

Citation keys look like `smith2023example`: first author's surname, year, first meaningful title word.

```bibtex
@article{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish and Shazeer, Noam},
  journal = {arXiv},
  year = {2017},
  doi = {arXiv:1706.03762},
  url = {https://arxiv.org/abs/1706.03762},
  note = {Preprint}
}
```

- **All entries:** `keywords`, `copyright` and `month` are removed; capitals in titles are protected (`{BERT}`, `{mRNA}`); accented characters become LaTeX (`M{\"{u}}ller`).
- **arXiv** and **bioRxiv/medRxiv** preprints use the format above (`journal = {arXiv}` / `{bioRxiv}`, `note = {Preprint}`). bioRxiv URLs have no version suffix, so they point to the latest version.

## Install

**Temporary** (until restart): open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → select `manifest.json`.

Requires Firefox/Zen 140 or later.

## Shortcut

Change it under *Add-ons → ⚙ → Manage Extension Shortcuts*, or on the extension's Options page.

## Privacy

No tracking, no accounts, no data sent to the developer. Only when you trigger it, the DOI is sent to:

- `doi.org` (redirects to Crossref or DataCite) to fetch the citation
- `api.biorxiv.org` for `10.1101/…` DOIs, to tell bioRxiv from medRxiv

Permissions: `contextMenus`, `clipboardWrite`, `notifications`, `activeTab`, and the hosts above.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest |
| `background.js` | Menu, shortcut, DOI lookup, clipboard, notifications |
| `bibtex.js` | BibTeX parsing, formatting and DOI detection |
| `options.html`, `options.js` | Shortcut settings page |

Plain JavaScript, no build step or dependencies.

## License

See `LICENSE`.
