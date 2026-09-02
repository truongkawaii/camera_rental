import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const componentsDir = path.join(root, "src", "components");
const imagesDir = path.join(root, "public", "images", "unsplash");

fs.mkdirSync(imagesDir, { recursive: true });

const files = fs
  .readdirSync(componentsDir)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => path.join(componentsDir, file));

const urls = new Set();

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/https:\/\/images\.unsplash\.com\/[^'"`\s)]+/g)) {
    urls.add(match[0]);
  }
}

const urlToLocalPath = new Map();
const failedUrls = [];
let index = 1;

for (const url of urls) {
  const id = url.match(/photo-[^?]+/)?.[0] ?? `image-${index}`;
  const filename = `${String(index).padStart(2, "0")}-${id}.jpg`;
  const outputPath = path.join(imagesDir, filename);
  const localPath = `/images/unsplash/${filename}`;

  if (!fs.existsSync(outputPath)) {
    const response = await fetch(url);
    if (!response.ok) {
      failedUrls.push({ url, status: `${response.status} ${response.statusText}` });
      index += 1;
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
  }

  urlToLocalPath.set(url, localPath);
  index += 1;
}

if (failedUrls.length > 0) {
  const fallback = [...urlToLocalPath.values()][0];

  if (!fallback) {
    throw new Error(
      `All downloads failed:\n${failedUrls
        .map(({ url, status }) => `- ${status}: ${url}`)
        .join("\n")}`,
    );
  }

  for (const { url } of failedUrls) {
    urlToLocalPath.set(url, fallback);
  }

  console.warn(
    `Used fallback ${fallback} for ${failedUrls.length} failed URLs:\n${failedUrls
      .map(({ url, status }) => `- ${status}: ${url}`)
      .join("\n")}`,
  );
}

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");

  for (const [url, localPath] of urlToLocalPath) {
    content = content.split(url).join(localPath);
  }

  fs.writeFileSync(file, content);
}

console.log(`Localized ${urlToLocalPath.size} Unsplash image URLs.`);
