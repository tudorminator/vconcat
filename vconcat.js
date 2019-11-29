#!/usr/bin/env node

const chalk = require('chalk');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2); // argv[0] contains the script name, don't care

const scriptPath = path.parse(process.argv[1]);
const scriptName = scriptPath.base;

let targetDirectory = path.resolve(path.normalize(args[0]));
// ensure path ends with separator
// if(!targetDirectory.endsWith(path.posix.sep)){
//     targetDirectory += path.posix.sep
// }

// --------------- Methods ----------------- //

/**
 * Check if ffmpeg exists and is executable
 */
const isFfmpegPresent = () => {
	const shellCommand = 'which ffmpeg';
	try {
        let ffPath = execSync(shellCommand, {stdio: [null, null, 'ignore']}).toString().trim();
        if(ffPath.length){
            // will throw if not executable
            fs.accessSync(ffPath, fs.constants.X_OK);
        }
		return true;
	} catch (error) {
		const errorMessage = error.toString();
		console.warn(chalk.yellow(errorMessage));
		return false;
	}
}

/**
 * Convert SRT to ASS
 */
const assPreamble = `[Script Info]
Title: Default subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Roboto,16,&H00FFFFFF,&H000000FF,&H00000000,&H5A000000,-1,0,0,0,100,100,0,0,1,2,2,3,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
const lineTemplate = 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}';
// \1 - start time; \2 - end time; \3 - text
const timeCodeRegex = /([\d:,]+)/gi;
const dateRegex = /\[([^\]]+)\]/g
const months = 'ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie'.split('|');
const srtToAss = (srtFile) => {
    const srt = fs.readFileSync(path.join(targetDirectory, srtFile), 'utf8')
        .split('\n\n') //split on empty lines
        .filter((line, index) => line.length); //exclude empty lines
    let ass = `${assPreamble}\n`;
    srt.forEach((line, index) => {
        // get subtitle time codes
        let [timesLine, ...textLines] = line.split(/\n+/gm).slice(1); // split by lines, discard the first line (subtitle index)
        textLines = textLines.join('\\N');
        timeCodeRegex.lastIndex = 0; // reset regex
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
        if(dateTimeString.length){
            let date = null;
            let newDateText = '';
            if(Date.parse(dateTimeString)){
                // valid date
                date = new Date(dateTimeString);
                newDateText = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
            } else {
                // invalid date; try to reverse date string
                dateTimeString = dateTimeString.split(/\s+/)[0].split(/\D/).reverse().join('-');
                if(Date.parse(dateTimeString)){
                    date = new Date(dateTimeString);
                    newDateText = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
                }
            }
            if(newDateText.length){
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
    const assFile = srtFile.replace('.srt', '.ass');
    fs.writeFileSync(path.join(targetDirectory, assFile), ass, 'utf8');
}

/**
 * Print progress bar
 * 
 * ├────╴╴╴╴╴┤
 * ╟────╴╴╴╴╴╢
 * ╉────╴╴╴╴╴╊
 * ─────╴╴╴╴╴╴
 * ■■■■■■▫︎▫︎▫︎▫︎
 * ▪︎▪︎▪︎▪︎▪︎▪︎▫︎▫︎▫︎▫︎▫︎▫︎
 * |●●●●●□□□□□□|
 * ├●●●●●・・・╢
 * ├◉◉◉◉◉◉○○○○○╢
 * ❚❚❚❚❚❚███▫︎▫︎▫︎▫︎❘❘❘❘❘❘❘❘
 */
const totalTerminalColumns = process.stdout.columns;
const printProgressBar = (current, total) => {
    const emptyChar = '─';
    const filledChar = '━';
    const endings='||';
	const percent = Math.floor(current * 100 / total);
	const barLength = totalTerminalColumns - 1 - endings.length - 4; // 2 chars for bar ends, 4 chars for percent label
	const filledLength = Math.min(barLength, Math.floor(percent / 100 * barLength));
	const padLength = barLength - filledLength;
	// console.debug({current, total, percent, barLength, filledLength, padLength});
	process.stdout.write(`${chalk.gray(endings[0]||'')}${''.padEnd(filledLength, filledChar)}${chalk.gray(''.padEnd(padLength, emptyChar))}${chalk.gray(endings[1]||'')} ${percent.toString().padStart(3)}%\r`);
}

/**
 * Resize video to 1/4 and embed text subtitle using ffmpeg
 */
const resizeRatio = parseFloat(args[1]) || .25; // get a resize ratio from the second param, or default to 1/4
const resizePercent = `${(resizeRatio * 100).toFixed(0)}%`;
const resizePercentDisplay = ` (${resizePercent})`;

const resizeAndEmbedSub = fileName => {
    const baseName = path.basename(fileName, path.extname(fileName));
    const videoFile = path.join(targetDirectory, `${baseName}.mp4`);
    const subFile = path.join(targetDirectory, `${baseName}.ass`);
    const outputFile = path.join(targetDirectory, `${baseName}${resizePercentDisplay}.mkv`);
    let subParams = '';
    if(fs.existsSync(subFile)){
        subParams = ` -i "${subFile}"`;
    }
    let filterParams = ` -codec copy -map 0${subParams ? ' -map 1':''}`;
    if(resizeRatio !== 1){
        filterParams = ` -filter_complex "[0:v]scale=iw*${resizeRatio}:ih*${resizeRatio}[video]" -map [video] -map 0:a -c:a copy${subParams ? ' -map 1':''}`;
    }
    // console.log({fileName, videoFile, subFile, outputFile});
    try {
        // is readable?
        // fs.accessSync(videoFile, fs.constants.R_OK);
        const shellCommand = `ffmpeg -y -hide_banner -loglevel fatal -i "${videoFile}"${subParams}${filterParams} "${outputFile}"`;
        // console.info('➜', shellCommand);
        console.log('\n');
        execSync(shellCommand, {stdio: [null, null, 'inherit']});
    } catch(err){
        // move cursor 3 lines up to return to progress bar position after ffmpeg's error output
        process.stdout.write('\033[K\033[3A\r');
    }
}

const extractTime = fileName => {
    const arr = Array.from(fileName.slice(11, 16).replace(/\D/g, ''));
    arr.splice(2, 0, '\u{2236}');
    return arr.join('');
}

const extractDate = fileName => fileName.slice(0, 10).replace(/\D/g, '-');

// --------------- Main ----------------- //

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
const allFiles = fs.readdirSync(targetDirectory).sort();
const videoFiles = allFiles.filter(file => file.endsWith('.mp4'));
const subtitleFiles = allFiles.filter(file => file.endsWith('.srt'));
// console.dir(videoFiles);
// console.dir({videoFiles, subtitleFiles});

// check if ffmpeg is present
if(!isFfmpegPresent()){
    console.warn(chalk.red('Fatal error: ffmpeg not found or not executable.'));
    process.exit(1);
}

// convert SRT to ASS subtitles
if(subtitleFiles.length){
    console.log('Converting subtitles...');
    printProgressBar(0, 1);
    subtitleFiles.forEach((subFile, index, arr) => {
        srtToAss(subFile);
        printProgressBar(index + 1, arr.length);
    });
    console.log('\n');
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
if(videoFiles.length){
    console.log('Resizing and embedding subtitles...');
    printProgressBar(0, 1);
    // move cursor 2 lines up to return to progress bar position
    // process.stdout.write('\033[K\033[2A\r');
    videoFiles.forEach((videoFile, index, arr) => {
        resizeAndEmbedSub(videoFile);
        process.stdout.write('\033[K\033[2A\r');
        printProgressBar(index + 1, arr.length);
    });
    console.log('\n');
}

const mkvFiles = fs.readdirSync(targetDirectory).filter(file => file.endsWith('.mkv') && file.includes(resizePercentDisplay));
// concat files
if(mkvFiles.length){
    // process.stdout.write('\033[K');
    console.log('Concatenating...');
    // create playlist file
    const concatPlaylist = path.join(targetDirectory, 'concat-playlist.txt');
    const playlistText = mkvFiles.map(file => `file ${file.replace(/\s/gi, '\\ ')}`).join('\n');
    // console.log({concatPlaylist, playlistText});
    try {
        fs.writeFileSync(concatPlaylist, playlistText);
    } catch(err){
        console.error('Concat playlist error :::', err.toString());
    }
    // try to create an output filename by looking at the existing file names
    const firstFileName = videoFiles[0];
    const lastFileName = videoFiles[videoFiles.length - 1];
    let concatVideoFile = path.join(targetDirectory, `combined${resizePercentDisplay}.mkv`);
    if(extractDate(firstFileName) === extractDate(lastFileName)){
        const date = extractDate(firstFileName);
        const startTime = extractTime(firstFileName);
        const endTime = extractTime(lastFileName);
        concatVideoFile = path.join(targetDirectory, `${date} ${startTime}\u{2026}${endTime}${resizePercentDisplay}.mkv`);
        // console.log({concatVideoFile});
    }

    try {
        const shellCommand = `ffmpeg -y -hide_banner -loglevel fatal -f concat -safe 0 -i "${concatPlaylist}" -c copy "${concatVideoFile}"`;
        execSync(shellCommand, {stdio: [null, null, 'inherit']});
    } catch(err){
        console.error(err.toString());
    }
}

console.log(`Done in ${process.uptime().toFixed(1)} seconds.`);