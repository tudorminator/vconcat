'use strict';

// external dependencies
const chalk = require('chalk');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Resize video to required size and embed text subtitle using ffmpeg
 * @param {string} fileName Video file to process
 * @param {string} size Resize value (25|25%|w320|h240)
 * @param {string} destinationDir Folder to save processed file or complete path and file name for it
 * @returns {string} The path and name of the resulting file
 */
const processVideo = (fileName, size, destinationDir) => {
  const { resizePercentDisplay } = formatPercent(resizeRatio);
  const baseName = path.basename(fileName, path.extname(fileName));
  // const sourceVideoFile = path.resolve(fileName);
  const subFile = path.join(destinationDir, `${baseName}.ass`);
  const outputFile = path.join(destinationDir, `${baseName}${resizePercentDisplay}.mkv`);
  let subParams = '';
  if (fs.existsSync(subFile)){
    subParams = ` -i ${path.resolve(subFile)}`;
  }
  let filterParams = ` -codec copy -map 0${subParams ? ' -map 1' : ''}`;
  if (resizeRatio !== 1.0){
    // keep aspect ratio - iw:-1
    filterParams = ` -filter_complex [0:v]scale=iw*${resizeRatio}:-1:flags=lanczos[video] -map [video] -map 0:a -c:a copy${subParams ? ' -map 1' : ''}`;
  }
  // console.log({fileName, videoFile, subFile, outputFile});
  try {
    const shellCommand = `BAR_FILENAME_LENGTH=28 ffmpeg-bar -y -i ${path.resolve(fileName)}${subParams}${filterParams} ${path.resolve(outputFile)}`;
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