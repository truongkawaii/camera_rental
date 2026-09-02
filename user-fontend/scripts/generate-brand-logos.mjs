import fs from "node:fs";
import path from "node:path";
import { siDji, siFujifilm, siSony } from "simple-icons";

const outDir = path.join(process.cwd(), "public", "brands");
fs.mkdirSync(outDir, { recursive: true });

const icons = {
  fujifilm: { icon: siFujifilm, viewBox: "0 9.6 24 4.8" },
  sony: { icon: siSony, viewBox: "0 9.6 24 4.8" },
  dji: { icon: siDji, viewBox: "0 4 24 16" },
};

for (const [name, { icon, viewBox }] of Object.entries(icons)) {
  const svg = icon.svg.replace('viewBox="0 0 24 24"', `viewBox="${viewBox}"`);
  fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
}
