import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// prettier owns these files now, so match its output: 2 spaces and a trailing newline
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeJson("manifest.json", manifest);

// bump version in manifest-beta.json
let manifestBeta = JSON.parse(readFileSync("manifest-beta.json", "utf8"));
manifestBeta.version = targetVersion;
writeJson("manifest-beta.json", manifestBeta);

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeJson("versions.json", versions);

// release the changelog's unreleased section under the target version
const changelog = readFileSync("CHANGELOG.md", "utf8");
if (changelog.includes(`\n## [${targetVersion}]`)) {
  console.warn(`CHANGELOG.md already has a [${targetVersion}] section - left untouched.`);
} else if (changelog.includes("\n## [Unreleased]")) {
  // en-CA formats as YYYY-MM-DD in local time, unlike toISOString's UTC
  const releaseDate = new Date().toLocaleDateString("en-CA");
  writeFileSync("CHANGELOG.md", changelog.replace("\n## [Unreleased]", `\n## [${targetVersion}] - ${releaseDate}`));
} else {
  console.warn("CHANGELOG.md has no [Unreleased] section - nothing to release.");
}
