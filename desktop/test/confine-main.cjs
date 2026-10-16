// The Electron half of test/confine.mjs: the app's own export driver
// (electronDriver in main/pdf.js) printing one built document through
// pdf-core.mjs, with the rule for local files that the app passes
// (local-files.mjs's fileUrlAllowed) – or, as the control, with none at
// all, so the test can see that the fixture would leak.
//
// Run by confine.mjs as: electron confine-main.cjs <view.html> <engineDir>
// <out.pdf> <rule|open>. One line of JSON on stdout, the exit code says
// whether it got that far.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app } = require('electron');
const { electronDriver, loadCore, loadLocalFiles } = require('../main/pdf.js');

const [view, engineDir, out, mode] = process.argv.slice(-4);

app.on('window-all-closed', () => { /* the export's windows are its own business */ });

app.whenReady().then(async () => {
  if (app.dock) app.dock.hide();
  const driver = electronDriver();
  try {
    const core = await loadCore(engineDir);
    const { fileUrlAllowed } = await loadLocalFiles(engineDir);
    const dir = path.dirname(view);
    const allowFile = mode === 'open' ? () => true : (u) => fileUrlAllowed(u, dir);
    const r = await core.exportDocument(driver, { url: pathToFileURL(view).href, allowFile });
    fs.writeFileSync(out, r.pdf);
    process.stdout.write(JSON.stringify({ pages: r.pages, refusedFiles: r.refusedFiles, pageErrors: r.pageErrors }) + '\n');
    await driver.close();
    app.exit(0);
  } catch (e) {
    process.stderr.write(String((e && e.stack) || e) + '\n');
    await driver.close().catch(() => {});
    app.exit(1);
  }
});
