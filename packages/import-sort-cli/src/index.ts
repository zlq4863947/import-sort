#!/usr/bin/env node

import * as yargs from "yargs";
import {getConfig, IResolvedConfig} from "import-sort-config";
import {walkSync} from "file";
import * as globby from "globby";
import * as path from "path";
import {dirname, extname} from "path";
import sortImports, {ISortResult} from "import-sort";
import {readFileSync, writeFileSync} from "fs";

yargs
  .usage(
`
Usage: import-sort [OPTION]... [FILE/GLOB]...

`.trim())
  .describe("list-different", "Print the names of files that are not sorted.")
  .boolean("list-different")
  .alias("list-different", "l")

  .describe("write", "Edit files in-place.")
  .boolean("write")

  .describe("with-node-modules", "Process files inside 'node_modules' directory..")
  .boolean("with-node-modules")

  .version(require("../package.json").version)
  .alias("version", "v")

  .help()
  .alias("help", "h");

const argv = yargs.argv;

let filePatterns = argv._;

const listDifferent = argv["list-different"];
const writeFiles = argv.write;
const ignoreNodeModules = !argv["with-node-modules"];

if (filePatterns.length === 0) {
  yargs.showHelp();
  process.exit(1);
}

if (ignoreNodeModules) {
  filePatterns = filePatterns.concat(["!**/node_modules/**", "!./node_modules/**"]);
}

let filePaths;

try {
  filePaths = globby
    .sync(filePatterns, {dot: true, expandDirectories: false})
    .map(filePath => path.relative(process.cwd(), filePath));
} catch (e) {
  console.error("Invalid file patterns");
  process.exit(2);
}

if (filePaths.length === 0) {
  console.error(`No files found for the given patterns: ${filePatterns.join(", ")}`);
  process.exit(2);
}

for (const filePath of filePaths) {
  let config;

  try {
    config = getAndCheckConfig(extname(filePath), dirname(filePath));
  } catch (e) {
    handleFilePathError(filePath, e);
    continue;
  }

  const unsortedCode = readFileSync(filePath).toString("utf8");

  const {parser, style, options} = config;
  let sortResult: ISortResult | undefined;

  try {
    sortResult = sortImports(unsortedCode, parser!, style!, filePath, options);
  } catch (e) {
    handleFilePathError(filePath, e);
    continue;
  }

  const {code: sortedCode, changes} = sortResult!;

  if (changes.length === 0) {
    if (listDifferent) {
      process.exitCode = 1;
    }
  }

  if (writeFiles) {
    writeFileSync(filePath, sortedCode, {encoding: "utf-8"});
  }

  if (listDifferent) {
    console.log(filePath);
  }

  if (!writeFiles && !listDifferent) {
    process.stdout.write(sortedCode);
  }
}

function getAndCheckConfig(extension: string, fileDirectory: string): IResolvedConfig {
  const resolvedConfig = getConfig(extension, fileDirectory);

  throwIf(!resolvedConfig, `No configuration found for file type ${extension}`);

  const rawParser = resolvedConfig!.config.parser;
  const rawStyle = resolvedConfig!.config.style;

  throwIf(!rawParser, `No parser defined for file type ${extension}`);
  throwIf(!rawStyle, `No style defined for file type ${extension}`);

  const parser = resolvedConfig!.parser;
  const style = resolvedConfig!.style;

  throwIf(!parser, `Parser "${rawParser}" could not be resolved`);
  throwIf(!style, `Style "${rawStyle}" could not be resolved`);

  return resolvedConfig!;
}

function handleFilePathError(filePath, e) {
  console.error(`${filePath}:`);
  console.error(e.toString());
  process.exitCode = 2;
}

function throwIf(condition: boolean, message: string) {
  if (condition) {
    throw new Error(message);
  }
}