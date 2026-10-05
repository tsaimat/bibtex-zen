const COMMAND = "copy-bibtex-page";

const KEY_NAMES = { Comma: "Comma", Period: "Period", Space: "Space", Home: "Home", End: "End",
  PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert", Delete: "Delete",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };

// Turn a keydown event into a WebExtension shortcut string, or null if it is only a modifier.
function shortcutFromEvent(e, isMac) {
  let key = null;
  let m;
  if ((m = /^Key([A-Z])$/.exec(e.code))) key = m[1];
  else if ((m = /^Digit(\d)$/.exec(e.code))) key = m[1];
  else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
  else if (KEY_NAMES[e.code]) key = KEY_NAMES[e.code];
  if (!key) return null;

  const mods = [];
  // On macOS the manifest's "Ctrl" is the Command key and "MacCtrl" is the Control key.
  if (isMac) {
    if (e.metaKey) mods.push("Ctrl");
    if (e.ctrlKey) mods.push("MacCtrl");
  } else if (e.ctrlKey) {
    mods.push("Ctrl");
  }
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return mods.concat(key).join("+");
}

if (typeof document !== "undefined") {
  const input = document.getElementById("sc");
  const msg = document.getElementById("msg");
  const saveBtn = document.getElementById("save");
  const resetBtn = document.getElementById("reset");
  const isMac = /^Mac/i.test(navigator.platform);
  const say = (text, cls) => { msg.textContent = text; msg.className = cls || ""; };

  // Some contexts (e.g. the file opened straight from disk) have no extension API.
  const api = (typeof browser !== "undefined" && browser.commands) ? browser : null;

  if (!api) {
    input.disabled = saveBtn.disabled = resetBtn.disabled = true;
    say("The extension API isn't available on this page. Open it via Add-ons \u2192 bibtex-zen \u2192 " +
        "Options, or change the shortcut under Add-ons \u2192 gear icon \u2192 Manage Extension Shortcuts.", "err");
  } else {
    let pending = null;

    const showCurrent = async () => {
      const cmds = await api.commands.getAll();
      const c = cmds.find(x => x.name === COMMAND);
      input.value = (c && c.shortcut) || "";
      pending = null;
    };

    input.addEventListener("keydown", (e) => {
      e.preventDefault();
      const s = shortcutFromEvent(e, isMac);
      if (!s) return;
      pending = s;
      input.value = s;
      say("Press Save to apply.", "");
    });

    saveBtn.addEventListener("click", async () => {
      if (!pending) { say("Press a key combination first.", "err"); return; }
      try {
        await api.commands.update({ name: COMMAND, shortcut: pending });
        await showCurrent();
        say("Saved.", "ok");
      } catch (e) {
        say("Firefox rejected that shortcut: " + (e && e.message ? e.message : e), "err");
      }
    });

    resetBtn.addEventListener("click", async () => {
      try {
        await api.commands.reset(COMMAND);
        await showCurrent();
        say("Reset to default.", "ok");
      } catch (e) { say(String((e && e.message) || e), "err"); }
    });

    showCurrent().catch(e => say("Could not read the current shortcut: " + e.message, "err"));
  }
}

if (typeof module !== "undefined") module.exports = { shortcutFromEvent };
