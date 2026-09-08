const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  session,
  net,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
app.setName("Room to Write");
if (process.env.RTW_QA_PROFILE)
  app.setPath("userData", path.resolve(process.env.RTW_QA_PROFILE));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "rtwrite",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let window;
const root = path.resolve(__dirname, "..");
const runtime = new Set(["index.html", "app.js", "engine.js", "styles.css"]);
const assetFiles = new Set(
  fs.readdirSync(path.join(root, "assets")).map((n) => "assets/" + n),
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`)
  .join(" ");
const csp = `default-src 'none'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;
function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 390,
    minHeight: 550,
    title: "Room to Write",
    backgroundColor: "#14221b",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== "rtwrite://app/index.html") event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    window = null;
  });
  window.loadURL("rtwrite://app/index.html");
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app.whenReady().then(() => {
    protocol.handle("rtwrite", async (request) => {
      const url = new URL(request.url);
      const file =
        decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html";
      if (url.host !== "app" || (!runtime.has(file) && !assetFiles.has(file)))
        return new Response("Not found", { status: 404 });
      const response = await net.fetch(
        pathToFileURL(path.join(root, file)).href,
      );
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", csp);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers });
    });
    session.defaultSession.setPermissionRequestHandler(
      (wc, permission, callback) =>
        callback(
          permission === "fullscreen" &&
            wc?.getURL() === "rtwrite://app/index.html",
        ),
    );
    session.defaultSession.setPermissionCheckHandler(
      (wc, permission) =>
        permission === "fullscreen" &&
        wc?.getURL() === "rtwrite://app/index.html",
    );
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*"] },
      (_details, callback) => callback({ cancel: true }),
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Room to Write",
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        {
          label: "File",
          submenu: [
            {
              label: "New note",
              accelerator: "CmdOrCtrl+N",
              click: () =>
                window?.webContents.executeJavaScript(
                  `(() => {if(document.querySelector('dialog[open]'))return;const ids=['paused-new-button','new-button','menu-new-button','begin-button']; const id=document.body.classList.contains('completed')?'new-button':!document.querySelector('#suspended').hidden?'paused-new-button':!document.querySelector('#landing').hidden?'begin-button':'menu-new-button';document.getElementById(id).click();})()`,
                ),
            },
            { role: "close" },
          ],
        },
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { role: "togglefullscreen" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
          ],
        },
        { role: "windowMenu" },
      ]),
    );
    createWindow();
    app.on("activate", () => {
      if (!window) createWindow();
      else window.show();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
