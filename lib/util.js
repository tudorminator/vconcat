#!/usr/bin/env node
'use strict';

// external dependencies
const chalk = require('chalk');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptPath = path.parse(process.argv[1]);
const scriptName = scriptPath.base;
const scriptVersion = '0.2';
const introText = `                               |    
.    ,,---.,---.,---.,---.,---.|--- 
 \\  / |    |   ||   ||    ,---||    
  \`'  \`---'\`---'\`   '\`---'\`---^\`---'
                  
${chalk.bold(scriptName)} version ${scriptVersion}, ©${new Date().getFullYear()} Tudor Iordăchescu\nhttps://github.com/tudorminator/vconcat\n`;
const useHelpString = 'Use -h or --help for more info.';

// utility methods
/**
 *
 * @param {string} message Optional message to display before exiting
 */
const abort = message => {
  message && console.error(message.toString());
  process.exit(1);
}

const debugTitle = chalk.red('⁘⁙⁘ Debug '.padEnd(process.stdout.columns, '⁘⁙')) + '\n';
const debugSeparator = '\n' + chalk.red(''.padEnd(process.stdout.columns, '⁘⁙'));
const debug = (...args) => global.options.verbose && !global.options.help && console.debug(debugTitle, args, debugSeparator);

/**
 * Print help message and abort execution
 */
const printHelpMessage = () => {
  const usage = `Options:

  ${chalk.cyan('-h, --help')}
  Show this help message and exit;
  no other processing occurs, even if other valid options are present.

  ${chalk.cyan('-s, --source')}="/path/to/source/folder/or/file"
  Path to a folder containing .mp4 and .srt files, or a video file to be processed;
  default value: current directory.

  ${chalk.cyan('-t, --target')}="/path/to/destination/folder/or/file"
  Path to a folder where files will be saved, or the file name of the resulting combined video file;
  default value: current directory.

  ${chalk.cyan('-r, --resize')}=<number>%|w<number>|h<number>
  Resize using the provided number.
  If value starts with letters ”w” or ”h”, resize so witdh/height equals <number> of pixels;
  otherwise, treat <number> as a percentage (percent sign may be skipped);
  default value: "w320" i.e. 320px.

  ${chalk.cyan('-v --verbose')}
  Print diagnostic messages.
  
  ${chalk.cyan('-n --no-concat')}
  Do not combine the resulting video files; assumes source is a folder with multiple files.
  
  ${chalk.cyan('-k --keep')}
  Do not remove temporary files created during processing.
`;

  abort(usage);
}

/**
 * Format a number as a percent for display purposes
 * @param {number} resizeRatio Percent to display
 * @returns {object} {{number} resizePrecent, {string} resizePercentDisplay}
 */
const formatPercent = resizeRatio => {
  const resizePercent = `${(resizeRatio * 100).toFixed(0)}%`;
  const resizePercentDisplay = `-${resizePercent}`;
  return { resizePercent, resizePercentDisplay };
}

/**
 * Log script running duration to console
 */
const printDuration = () => {
  const dateObj = new Date(null);
  const s = process.uptime();
  dateObj.setSeconds(s);
  const [hours, minutes, seconds] = dateObj.toISOString().split('T')[1].split(':').map(val => parseInt(val.split('.')[0]));
  const hoursString = hours ? `${hours} hour${hours > 1 ? 's' : ''}` : '';
  const minutesString = minutes ? `${hours ? ', ' : ''}${minutes} minute${minutes > 1 ? 's' : ''}` : '';
  const secondsString = seconds ? `${hours || minutes ? ' and ' : ''}${seconds} second${seconds > 1 ? 's' : ''}` : '';
  console.log(`Done in ${hoursString}${minutesString}${secondsString}.`);
}

/**
 * Get info about a path
 * @param {string} str Path to file or folder
 * @returns {object} {{boolean} exits, {boolean} isDirectory, {boolean} isFile, {string|null} error}
 */
const getPathInfo = str => {
  const p = path.resolve(str);
  let ret = {
    'exists': false,
    'isDirectory': false,
    'isFile': false,
    'error': null
  };
  try {
    fs.accessSync(p);
    const stats = fs.statSync(p);
    Object.assign(ret, {
      'exists': true,
      'isDirectory': stats.isDirectory(),
      'isFile': stats.isFile(),
    });
  } catch (err){
    ret.error = err.code;
  }
  return ret;
}

/**
 * Check if ffmpeg and ffmpeg-bar exist and are executable
 * @param {str} exec Name of executable to check (ffmpeg | ffmpeg-bar)
 * @returns {boolean}
 */
const isCommandPresent = (exec) => {
  const shellCommand = `which ${exec}`;
  try {
    let ffPath = execSync(shellCommand, { stdio: [null, null, 'ignore'] }).toString().trim();
    if (ffPath.length){
      // will throw if not executable
      fs.accessSync(ffPath, fs.constants.X_OK);
    }
    return true;
  } catch (error){
    const errorMessage = error.toString();
    console.warn(chalk.yellow(errorMessage));
    return false;
  }
}

/**
 * Print progress bar
 * @param {number} current Current progress bar value
 * @param {number} total Total progress bar value
 *
 * ├────╴╴╴╴╴┤ * ╟────╴╴╴╴╴╢ * ╉────╴╴╴╴╴╊ * ─────╴╴╴╴╴╴ * ■■■■■■▫︎▫︎▫︎▫︎ * ▪︎▪︎▪︎▪︎▪︎▪︎▫︎▫︎▫︎▫︎▫︎▫︎ * |●●●●●□□□□□□| * ├●●●●●・・・╢ * ├◉◉◉◉◉◉○○○○○╢ * ❚❚❚❚❚❚███▫︎▫︎▫︎▫︎❘❘❘❘❘❘❘❘
 */
// eslint-disable-next-line no-unused-vars
const printProgressBar = (current, total) => {
  const totalTerminalColumns = process.stdout.columns;
  const emptyChar = '─';
  const filledChar = '━';
  const endings = '||';
  const percent = Math.floor(current * 100 / total);
  const barLength = totalTerminalColumns - 1 - endings.length - 4; // 2 chars for bar ends, 4 chars for percent label
  const filledLength = Math.min(barLength, Math.floor(percent / 100 * barLength));
  const padLength = barLength - filledLength;
  // console.debug({current, total, percent, barLength, filledLength, padLength});
  process.stdout.write(`${chalk.gray(endings[0] || '')}${''.padEnd(filledLength, filledChar)}${chalk.gray(''.padEnd(padLength, emptyChar))}${chalk.gray(endings[1] || '')} ${percent.toString().padStart(3)}%\r`);
}

/**
 * Extract a date from a filename formatted as ”2020_01_07_08_56_45.mp4”
 * @param {string} fileName Name of file to extract the time from
 * @returns {string} "YYY-MM-DD" e.g. "08∶56"
 */
const extractDate = fileName => path.basename(fileName).slice(0, 10).replace(/\D/g, '-');

/**
 * Extract a time from a filename formatted as ”2020_01_07_08_56_45.mp4”
 * @param {string} fileName Name of file to extract the time from
 * @returns {string} "HH∶mm" e.g. "08∶56"
 */
const extractTime = fileName => {
  const arr = Array.from(fileName.slice(11, 16).replace(/\D/g, ''));
  arr.splice(2, 0, '\u{2236}');
  return arr.join('');
}

const unlinkFile = fileName => {
  const pathInfo = getPathInfo(fileName);
  if(pathInfo.exists){
    if(pathInfo.isFile){
      process.stdout.write(`Removing ${chalk.white(path.basename(fileName))} \u2026`);
      try {
        fs.unlinkSync(fileName);
      } catch(err){
        console.error(`Failed to remove ${chalk.red(path.basename(fileName))}!`);
      }
    } else {
      console.error(`Not removing directory ${chalk.red(path.basename(fileName))}!`);
    }
  }
}

/**
 * Remove temporary files created during processing
 * @param {array} tempVideoFiles Array of temp video files to remove
 * @param {array} tempSubtitleFiles Array of temp subtitle files to remove
 */
const cleanup = (tempVideoFiles, tempSubtitleFiles) => {
  process.stdout.clearScreenDown();

  if (!sourceFile && tempVideoFiles.length > 1){
    process.stdout.write('Removing temp videos\u2026');
    tempVideoFiles.forEach(file => {
      try {
        fs.unlinkSync(path.join(destinationDir, path.basename(file)));
      } catch (err){
        console.error(`Failed to remove ${chalk.red(file)}!`);
      }
    });
    process.stdout.cursorTo(0);
    process.stdout.write(`Removing temp videos\u2026 \t\t\t[${chalk.cyan('Done')}]\n`);
  }

  if (tempSubtitleFiles.length){
    process.stdout.write('Removing temp subtitles\u2026');
    tempSubtitleFiles.forEach(file => {
      try {
        fs.unlinkSync(path.join(destinationDir, path.basename(file)));
      } catch (err){
        console.error(`Failed to remove ${chalk.red(file)}!`);
      }
    });
    process.stdout.cursorTo(0);
    process.stdout.write(`\rRemoving temp subtitles\u2026 \t\t[${chalk.cyan('Done')}]\n`);
  }

  if (!sourceFile){
    process.stdout.write(`\rRemoving temp file list\u2026`);
    try {
      fs.unlinkSync(path.join(destinationDir, 'concat-playlist.txt'));
      process.stdout.cursorTo(0);
      process.stdout.write(`\rRemoving temp file list\u2026 \t\t[${chalk.cyan('Done')}]\n`);
    } catch (err){
      // console.error(`Failed to remove ${chalk.red('concat-playlist.txt')}!`);
      process.stdout.cursorTo(0);
      process.stdout.write(`\rRemoving temp file list\u2026 \t\t[${chalk.red('Failed')}]\n`);
    }
  }
}

// exports
module.exports = {
  introText,
  useHelpString,
  abort,
  debug,
  printHelpMessage,
  formatPercent,
  printDuration,
  getPathInfo,
  isCommandPresent,
  printProgressBar,
  extractDate,
  extractTime
}