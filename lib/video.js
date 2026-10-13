'use strict';

// external dependencies
// const chalk = require('chalk');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const { debug } = require('./util');

/**
 * Resize video to required size and embed text subtitle using ffmpeg
 * @param {string} fileName Video file to process
 * @param {string} size Resize value (25|25%|w320|h240)
 * @param {string} destinationDir Folder to save processed file or complete path and file name for it
 * @returns {string} The path and name of the resulting file
 */
const processVideo = (fileName) => {
  // const { resizePercentDisplay } = formatPercent(resizeRatio);
  const baseName = path.basename(fileName, path.extname(fileName));
  // const sourceVideoFile = path.resolve(fileName);
  const subFile = path.join(global.options.target, `${baseName}.ass`);
  const outputFileName = `${baseName} (${global.options.resize}).mkv`;
  const outputFile = path.join(global.options.target, outputFileName);
  let subParams = '';
  if (fs.existsSync(subFile)){
    subParams = ` -i ${path.resolve(subFile)}`;
  }
  let filterParams = ` -codec copy -map 0${subParams ? ' -map 1' : ''}`;
  if(/^[wh]/i.test(global.options.resize.toLowerCase())){
    // sesize option was passed a value such as ”w320”
    // resize to a fixed dimension in pixels
    const side = global.options.resize[0].toLowerCase();
    let value = parseInt(global.options.resize.slice(1), 10);

    if(isNaN(value)){
      value = side === 'w' ? 320 : 240;
      debug(`Defaulting 'resize' option to ${side}${value} due to invalid value.`)
    }

    if(side === 'w'){
      filterParams = ` -filter_complex [0:v]scale=${value}:-1:force_original_aspect_ratio=decrease:flags=lanczos[video] -map [video] -map 0:a -c:a copy${subParams ? ' -map 1' : ''}`;
    } else if(side === 'h'){
      filterParams = ` -filter_complex [0:v]scale=-1:${value}:force_original_aspect_ratio=decrease:flags=lanczos[video] -map [video] -map 0:a -c:a copy${subParams ? ' -map 1' : ''}`;
    }
  } else {
    // size option was passed a number
    // try to parse ignoring anything after the first non-digit character
    // e.g. '11a22b33' will yeld 11, and so will '11.3'
    // don't really need fractional percent values (do I?)
    let value = parseInt(global.options.resize.split(/\D/)[0], 10);
    if(isNaN(value) || value <= 0){
      value = parseFloat((25 / 100).toPrecision(2));
    } else {
      value = parseFloat((value / 100).toPrecision(2));
    }

    if (value !== 1.0){
      // keep aspect ratio - iw:-1
      filterParams = ` -filter_complex [0:v]scale=iw*${value}:-1:force_original_aspect_ratio=decrease:flags=lanczos[video], -map [video] -map 0:a -c:a copy${subParams ? ' -map 1' : ''}`;
    }
  }
  // console.log({fileName, videoFile, subFile, outputFile});
  try {
    const shellCommand = `BAR_FILENAME_LENGTH=${outputFileName.length} ffmpeg-bar -y -i ${path.resolve(fileName)}${subParams}${filterParams} ${path.resolve(outputFile)}`;
    // console.log({shellCommand});
    // const shellCommand = `ffmpeg-bar -y -i "${fileName}"${subParams}${filterParams} "${outputFile}"`;
    // console.log('\n');
    execSync(shellCommand, { stdio: 'inherit' });
    return outputFile;
  } catch (err){
    console.error(err.toString());
  }
}

module.exports = {
  processVideo
}