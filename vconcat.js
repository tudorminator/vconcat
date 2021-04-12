#!/usr/bin/env node
'use strict';

// external dependencies
const chalk = require('chalk');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// internal dependencies
const {
  introText,
  useHelpString,
  abort,
  debug,
  printHelpMessage,
  formatPercent,
  printDuration,
  getPathInfo,
  isCommandPresent,
  extractDate,
  extractTime,
} = require('./lib/util');

const srtToAss = require('./lib/srt-to-ass');

// --------------- Main ----------------- //
console.log(introText);
// parse args, store in global var so they can be accessed in external modules
global.options = require('./lib/parse-args');
debug('Options:', global.options);

if(global.options.help){
  printHelpMessage();
}

if(!global.options.paramsOK){
  if(global.options.unknown.length){
    const plural = global.options.unknown.length > 1 ? 's' : '';
    abort(`Unknown option${plural}: ${global.options.unknown.join(', ')}`);
  }
  if(Object.keys(global.options.invalid).length){
    const entries = Object.entries(global.options.invalid);
    const messages = entries.map((entry) => `\n\t'${entry[0]}': ${entry[1]}`).join('');
    const plural = entries.length > 1 ? 's' : '';
    abort(`Invalid value${plural}:${messages}`);
  }
}

process.exit();



// parse params
const args = process.argv.slice(2);
let sourceDir = null;
let sourceFile = null;
let destinationDir = null
let resizeRatio = .25;
// no arguments; source and destination default to current folder, size defaults to .25
if (args.length === 0){
  sourceDir = destinationDir = process.pwd();
  resizeRatio = .25;
}
// one argument; can be the help switch or <source>
if (args.length === 1){
  const [arg] = args;
  if (arg === '-h' || arg === '--help'){
    printHelpMessage();
  }
  const sourceInfo = getPathInfo(arg);
  // console.log(sourceInfo);
  // check path
  if (sourceInfo.exists && sourceInfo.isDirectory){
    sourceDir = destinationDir = path.resolve(arg);
  } else if (sourceInfo.exists && sourceInfo.isFile){
    sourceFile = path.resolve(arg);
    // save in the same directory
    destinationDir = path.dirname(sourceFile);
  } else {
    abort(`No such file or directory: ${chalk.red(arg)}. ${useHelpString}`);
  }
}
// two arguments; <source> <size>
if (args.length === 2){
  const [arg1, arg2] = args;
  const sourceInfo = getPathInfo(arg1);
  // check path
  if (sourceInfo.exists && sourceInfo.isDirectory){
    sourceDir = destinationDir = path.resolve(arg1);
  } else if (sourceInfo.exists && sourceInfo.isFile){
    sourceFile = path.resolve(arg1);
    // save in the same directory
    destinationDir = path.dirname(sourceFile);
  } else {
    abort(`No such file or directory: ${chalk.red(arg1)}. ${useHelpString}`);
  }
  // check if it's a number
  const ratio = parseFloat(arg2);
  if (isNaN(ratio) || ratio < 0){
    abort(`Not a positive number: ${chalk.red(arg2)}. ${useHelpString}`);
  } else {
    resizeRatio = ratio;
  }
}
// three arguments: <source> <size> <destination>
if (args.length === 3){
  const [arg1, arg2, arg3] = args;
  // console.log({arg1, arg2, arg3});
  // check if it's a path
  const sourceInfo = getPathInfo(arg1);
  // check path
  if (sourceInfo.exists && sourceInfo.isDirectory){
    sourceDir = path.resolve(arg1);
  } else if (sourceInfo.exists && sourceInfo.isFile){
    sourceFile = path.resolve(arg1);
  } else {
    abort(`No such file or directory: ${chalk.red(arg1)}. ${useHelpString}`);
  }

  // check if it's a number
  const ratio  = parseFloat(arg2);
  if (isNaN(ratio) || ratio < 0){
    abort(`Not a number or not positive: ${chalk.red(arg2)}. ${useHelpString}`);
  } else {
    resizeRatio = ratio;
  }

  // check path
  const destInfo = getPathInfo(arg3);
  if (destInfo.exists && destInfo.isDirectory){
    destinationDir = path.resolve(arg3);
  } else {
    abort(`No such directory: ${chalk.red(arg3)}. ${useHelpString}`);
  }
}

// console.log({sourceDir, destinationDir, resizeRatio});
// check if ffmpeg-bar is present
if (!isCommandPresent('ffmpeg-bar')){
  abort(`${chalk.red('ffmpeg-bar')} not found or not executable.`);
}

// check if ffmpeg is present
if (!isCommandPresent('ffmpeg')){
  abort(`${chalk.red('ffmpeg')} not found or not executable.`);
}

const allFiles = sourceFile
  ? [sourceFile, sourceFile.replace(path.extname(sourceFile), '.srt')]
  : fs.readdirSync(sourceDir).sort();
const videoFiles = allFiles
  .filter(file => file.endsWith('.mp4'))
  .map(file => path.join(sourceDir || path.dirname(sourceFile), path.basename(file)));
const subtitleFiles = allFiles
  .filter(file => file.endsWith('.srt'))
  .map(file => path.join(sourceDir || path.dirname(sourceFile), path.basename(file)));

// convert SRT to ASS subtitles
let tempSubtitleFiles = [];
if (subtitleFiles.length){
  // printProgressBar(0, 1);
  process.stdout.write(`Converting ${subtitleFiles.length} subtitle file${subtitleFiles.length > 1 ? 's' : ''}\u2026`);
  subtitleFiles.forEach((subFile, index, arr) => {
    tempSubtitleFiles.push(srtToAss(subFile, destinationDir));
    // printProgressBar(index + 1, arr.length);
  });
  process.stdout.cursorTo(0);
  process.stdout.clearScreenDown();
  process.stdout.write(`Converting ${subtitleFiles.length} subtitle file${subtitleFiles.length > 1 ? 's' : ''}\u2026 \t\t[${chalk.cyan('Done')}]\n\n`);
} else {
  !sourceFile && console.log('No subtitle files found.');
}

/*
// add subs:
ffmpeg -i <fileName>.mp4 -i <fileName>.srt  -codec copy -map 0 -map 1 <output>.mkv

// concat:
ffmpeg -f concat -safe 0 -i <playlist>.txt -c copy <output>.mkv

// resize:
ffmpeg -i <fileName>.mkv -vf "scale=iw/4:ih/4" <FileName-small>.mkv

// resize 1/4 AND add subs:
ffmpeg -i <fileName>.mp4 -i <fileName>.ass -filter_complex "[0:v]scale=iw/4:ih/4[video]"  -map [video] -map 0:a -c:a copy -map 1 <out>.mkv
*/

// use ffmpeg to convert movies to MKV with embedded subtitles
let tempVideoFiles = [];
if (videoFiles.length){
  // printProgressBar(0, 1);
  // move cursor 2 lines up to return to progress bar position
  // process.stdout.write('\033[K\033[2A\r');
  console.log(`Resizing ${videoFiles.length} file${videoFiles.length > 1 ? 's' : ''}\u2026`);
  videoFiles.forEach((videoFile, index, arr) => {
    resizeAndEmbedSub(videoFile);
    // process.stdout.write('\033[K\033[4A');
    // process.stdout.clearScreenDown();
    // printProgressBar(index + 1, arr.length);
  });
  // process.stdout.cursorTo(0);
  console.log(`Resizing ${videoFiles.length} file${videoFiles.length > 1 ? 's' : ''}\u2026 \t\t\t[${chalk.cyan('Done')}]\n\n`);
}

const { resizePercentDisplay } = formatPercent(resizeRatio);
const mkvFiles = fs
    .readdirSync(destinationDir)
    .filter(file => file.endsWith('.mkv') && file.includes(resizePercentDisplay) && !file.includes('\u{2026}') && !file.includes('combined'));

// concat files
if (!sourceFile && mkvFiles.length > 1){
  process.stdout.clearScreenDown();
  process.stdout.write(`Concatenating ${mkvFiles.length} file${mkvFiles.length > 1 ? 's' : ''}\u2026`);
  // create playlist file
  const concatPlaylist = path.join(destinationDir, 'concat-playlist.txt');
  const playlistText = mkvFiles.map(file => `file ${file.replace(/\s/gi, '\\ ')}`).join('\n');
  // console.log({concatPlaylist, playlistText});
  try {
    fs.writeFileSync(concatPlaylist, playlistText);
  } catch (err){
    console.error('Concat playlist error :::', err.toString());
  }
  // try to create an output filename by looking at the existing file names
  const firstFileName = mkvFiles[0];
  const lastFileName = mkvFiles[mkvFiles.length - 1];
  let concatVideoFile = path.join(destinationDir, `combined${resizePercentDisplay}.mkv`);
  if (extractDate(firstFileName) === extractDate(lastFileName)){
    const date = extractDate(firstFileName);
    const startTime = extractTime(firstFileName);
    const endTime = extractTime(lastFileName);
    concatVideoFile = path.join(destinationDir, `${date} ${startTime}\u{2026}${endTime}${resizePercentDisplay}.mkv`);
    // console.log({concatVideoFile});
  }

  try {
    const shellCommand = `ffmpeg -y -hide_banner -loglevel fatal -f concat -safe 0 -i "${concatPlaylist}" -c copy "${concatVideoFile}"`;
    execSync(shellCommand, { stdio: [null, null, 'inherit'] });
  } catch (err){
    console.error(err.toString());
  }
  process.stdout.cursorTo(0);
  process.stdout.write(`Concatenating ${mkvFiles.length} file${mkvFiles.length > 1 ? 's' : ''}\u2026 \t\t[${chalk.cyan('Done')}]\n\n`);
}
// remove work files
cleanup();
printDuration();

/*
// test progress bar
const sleep = (n) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

for(let i = 0; i <= 100; i++){
    printProgressBar(i, 100);
    sleep(50);
}
console.log('\n');
process.exit();
 */
