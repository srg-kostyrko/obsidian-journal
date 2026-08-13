import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// bump version in manifest-beta.json
let manifestBeta = JSON.parse(readFileSync("manifest-beta.json", "utf8"));
manifestBeta.version = targetVersion;
writeFileSync("manifest-beta.json", JSON.stringify(manifestBeta, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

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
