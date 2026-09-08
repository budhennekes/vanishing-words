import { packager } from "@electron/packager";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const stage = await fs.mkdtemp(
  path.join(os.tmpdir(), "room-to-write-package-"),
);
for (const file of ["index.html", "app.js", "engine.js", "styles.css"]) {
  let content = await fs.readFile(path.join(root, file), "utf8");
  if (file === "index.html" || file === "app.js")
    content = content
      .replaceAll("this browser", "this app")
      .replaceAll("Your browser restored", "This app restored")
      .replaceAll("Clearing browser data", "Removing app data")
      .replaceAll("clearing browser data", "removing app data");
  await fs.writeFile(path.join(stage, file), content);
}
await fs.cp(path.join(root, "assets"), path.join(stage, "assets"), {
  recursive: true,
});
await fs.mkdir(path.join(stage, "electron"));
await fs.copyFile(
  path.join(root, "electron/main.cjs"),
  path.join(stage, "electron/main.cjs"),
);
await fs.writeFile(
  path.join(stage, "package.json"),
  JSON.stringify({
    name: "room-to-write",
    productName: "Room to Write",
    version: "0.1.0",
    main: "electron/main.cjs",
  }),
);
const out = path.join(
  os.homedir(),
  "Documents",
  "RoomToWriteBuilds",
  new Date().toISOString().replaceAll(":", "-"),
);
const paths = await packager({
  dir: stage,
  out,
  name: "Room to Write",
  platform: "darwin",
  arch: process.arch,
  electronVersion: "44.2.0",
  appBundleId: "com.budhennekes.roomtowrite",
  appCategoryType: "public.app-category.productivity",
  asar: true,
  overwrite: false,
  icon: path.join(root, "electron/icon.icns"),
  prune: true,
});
await fs.writeFile(
  path.join(root, "node_modules/.room-to-write-build.json"),
  JSON.stringify({ paths }, null, 2),
);
console.log("Built:", paths.join("\n"));
