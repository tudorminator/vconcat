#!/usr/bin/env node
'use strict';

// external dependencies
const path = require('path');
const fs = require('fs');
const {getPathInfo} = require('./util');

/**
 * Convert SRT to ASS
 * @param {string} srtFile Path to SRT subitle file
 * @param {string} destinationDir Where to write the converted subtitle file
 * @returns {string} Path to written ASS file
 */
const srtToAss = (srtFile, destinationDir) => {
  // srtFile = path.join(sourceDir, path.basename(srtFile));
  const fileInfo = getPathInfo(srtFile);
  if (!fileInfo.exists || !fileInfo.isFile){
    return;
  }
  const assPreamble = `[Script Info]
Title: Default subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Roboto,16,&H00FFFFFF,&H000000FF,&H00000000,&H5A000000,-1,0,0,0,100,100,0,0,1,1,1,3,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  const lineTemplate = 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}';
  const timeCodeRegex = /([\d:,]+)/gi;
  const dateRegex = /\[([^\]]+)\]/g; // anything enclosed between straight parens
  const isLocaleSupported = Intl.DateTimeFormat.supportedLocalesOf('ro-RO')[0] === 'ro-RO';
  let dateFormatter = null;
  if (isLocaleSupported){
    dateFormatter = new Intl.DateTimeFormat('ro-Ro', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    });
  }
  // poor man's intl
  const months = 'ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie'.split('|');
  const days = 'duminică|luni|marți|miercuri|joi|vineri|sîmbătă'.split('|');
  /**
   * Node will use this ICU datafile if the environment variable NODE_ICU_DATA is set to “/usr/local/lib/node_modules/full-icu”
   * or with node --icu-data-dir=/usr/local/lib/node_modules/full-icu YOURAPP.js
   */
  const srt = fs.readFileSync(srtFile, 'utf8');
  const srtData = srt
    .split('\n\n') //split on empty lines
    .filter(line => line.length) // filter out empty lines
    .map(sub => sub.replace(/^[\d]+$/gm, '').trim()); // filter out lines containing only digits (i. e. subtitle index)
  let ass = `${assPreamble}\n`;
  srtData.forEach(line => {
    // get subtitle time codes and text
    let [timesLine, ...textLines] = line.split(/\n+/gm); // split by lines
    textLines = textLines.join('\\N');
    timeCodeRegex.lastIndex = 0; // reset regex match index
    const [startTime] = timeCodeRegex.exec(timesLine);
    const [endTime] = timeCodeRegex.exec(timesLine);
    const newStartTime = startTime
      .replace(',', '.') // uses . as decimals separator
      .slice(1, -1); // uses less digits
    const newEndTime = endTime
      .replace(',', '.')
      .slice(1, -1);
    // console.dir({timesLine, startTime, newStartTime, endTime, newEndTime});

    // get date and time
    dateRegex.lastIndex = 0;
    let dateTimeString = (dateRegex.exec(textLines) || ['', ''])[1];
    if (dateTimeString.length){
      let date = null;
      let newDateText = '';
      if (Date.parse(dateTimeString)){
        // valid date
        date = new Date(dateTimeString);
        if (isLocaleSupported){
          newDateText = dateFormatter.format(date);
        } else {
          const minutes = date.getMinutes().toString().padStart(2, '0');
          const seconds = date.getSeconds().toString().padStart(2, '0');
          newDateText = `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${date.getHours()}:${minutes}:${seconds}`;
        }
      } else {
        // invalid date; try to reverse date string
        // dateTimeString = dateTimeString.split(/\s+/)[0].split(/\D/).reverse().join('-');
        let [dateString, timeString] = dateTimeString.split(/\s+/);
        if (dateString.length){
          dateTimeString = `${dateString.split(/\D/).reverse().join('-')} ${timeString}`;
        }
        // try parsing the date one more time
        if (Date.parse(dateTimeString)){
          date = new Date(dateTimeString);
          if (isLocaleSupported){
            newDateText = dateFormatter.format(date);
          } else {
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const seconds = date.getSeconds().toString().padStart(2, '0');
            newDateText = `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${date.getHours()}:${minutes}:${seconds}`;
          }
        }
      }
      if (newDateText.length){
        textLines = textLines.replace(dateRegex, newDateText);
      }
    }
    // remove superfluous ”0MPH” && ”0KM/H” speeds
    textLines = textLines.replace(/\s+0K?MP?\/?H/gi, '');
    ass += lineTemplate
      .replace('{start}', newStartTime)
      .replace('{end}', newEndTime)
      .replace('{text}', textLines) + '\n';
    // console.dir({newText});
  });
  const assFile = path.join(destinationDir, path.basename(srtFile).replace(path.extname(srtFile), '.ass'));
  fs.writeFileSync(assFile, ass, 'utf8');
  return assFile;
}

module.exports = { srtToAss }