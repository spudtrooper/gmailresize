#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const manifestJsonPath = path.join(__dirname, "../chrome/", "manifest.json");
const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, "utf-8"));

const currentVersion = manifestJson.version;
const versionParts = currentVersion.split(".").map(Number);
if (versionParts.length !== 3) {
  console.error(`Invalid version format: ${currentVersion}`);
  process.exit(1);
}

versionParts[2] += 1; // Increment patch version
const newVersion = versionParts.join(".");

manifestJson.version = newVersion;
fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2) + "\n");

console.log(`Bumped version: ${currentVersion} -> ${newVersion}`);