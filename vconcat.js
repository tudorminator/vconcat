#!/usr/bin/env node

// --------------- Methods ----------------- //

const abort = message => {
    console.error(message.toString());
    process.exit(1);
}

const printHelpMessage = () => {
    const usage = `
${chalk.white(scriptName)} [${chalk.red('"/path/to/source/folder"')} [${chalk.magenta('scale')} [${chalk.blue('"path/to/destination/folder"')}]]]

Params:
  ${chalk.red('/path/to/source/folder')} - <string> optional: a folder containing .mp4 and .srt files; default: current directory

  ${chalk.magenta('scale')} - <number> optional: resize videos using this floating point number; default: .25 (25%)

  ${chalk.blue('"path/to/destination/folder"')} - <string> optional: where to save; defaults: source or current directory`;
    console.error(usage);
    process.exit(1);
}

const formatPercent = resizeRatio => {
    const resizePercent = `${(resizeRatio * 100).toFixed(0)}%`;
    const resizePercentDisplay = ` (${resizePercent})`;
    return { resizePercent, resizePercentDisplay };
}

const isValidDirectory = str => {
    const p = path.resolve(str);
    try {
       const stats = fs.statSync(p);
       // console.log({stats});
       if(!stats.isDirectory()){
           return false;
       }
    } catch (err){
        return false
    }
    return true;
}

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
const srtToAss = (srtFile) => {
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
    const dateRegex = /\[([^\]]+)\]/g
    const months = 'ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie'.split('|');
    const srt = fs.readFileSync(path.join(sourceDir, srtFile), 'utf8')
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
    fs.writeFileSync(path.join(destinationDir, assFile), ass, 'utf8');
}

/**
 * Print progress bar
 * 
 * ├────╴╴╴╴╴┤ * ╟────╴╴╴╴╴╢ * ╉────╴╴╴╴╴╊ * ─────╴╴╴╴╴╴ * ■■■■■■▫︎▫︎▫︎▫︎ * ▪︎▪︎▪︎▪︎▪︎▪︎▫︎▫︎▫︎▫︎▫︎▫︎ * |●●●●●□□□□□□| * ├●●●●●・・・╢ * ├◉◉◉◉◉◉○○○○○╢ * ❚❚❚❚❚❚███▫︎▫︎▫︎▫︎❘❘❘❘❘❘❘❘
 */
const printProgressBar = (current, total) => {
    const totalTerminalColumns = process.stdout.columns;
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
const resizeAndEmbedSub = fileName => {
    const { resizePercentDisplay } = formatPercent(resizeRatio);
    const baseName = path.basename(fileName, path.extname(fileName));
    const videoFile = path.join(sourceDir, `${baseName}.mp4`);
    const subFile = path.join(destinationDir, `${baseName}.ass`);
    const outputFile = path.join(destinationDir, `${baseName}${resizePercentDisplay}.mkv`);
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
        const shellCommand = `ffmpeg -y -hide_banner -loglevel fatal -i "${videoFile}"${subParams}${filterParams} "${outputFile}"`;
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

const cleanup = () => {
    if(mkvFiles.length){
        process.stdout.write('Removing temp videos...');
        mkvFiles.forEach(file => {
            try {
                fs.unlinkSync(path.join(destinationDir, file));
            } catch {
                console.error(`Failed to remove ${chalk.red(file)}!`);
            }
        });
        process.stdout.cursorTo(0);
        process.stdout.write(`Removing temp videos... \t\t\t\t[${chalk.cyan('OK')}]\n`);
    }
    if(subtitleFiles.length){
        process.stdout.write('Removing temp subtitles...');
        subtitleFiles.forEach(file => {
            assFile = file.replace('.srt', '.ass');
            try {
                fs.unlinkSync(path.join(destinationDir, assFile));
            } catch {
                console.error(`Failed to remove ${chalk.red(assFile)}!`);
            }
        });
        process.stdout.cursorTo(0);
        process.stdout.write(`\rRemoving temp subtitles... \t\t\t\t[${chalk.cyan('OK')}]\n`);
    }
    process.stdout.write(`\rRemoving temp file list...`);
    try {
        fs.unlinkSync(path.join(destinationDir, 'concat-playlist.txt'));
        process.stdout.cursorTo(0);
        process.stdout.write(`\rRemoving temp file list... \t\t\t\t[${chalk.cyan('OK')}]\n`);
    } catch (err){
        console.error(`Failed to remove ${chalk.red('concat-playlist.txt')}!`);
    }
}

const printDuration = () => {
    const dateObj = new Date(null);
    const s = process.uptime();
    dateObj.setSeconds(s);
    const [hours, minutes, seconds] = dateObj.toISOString().split('T')[1].split(':').map(val => parseInt(val.split('.')[0]));
    const hoursString = hours ? `${hours} hour${hours > 1 ? 's':''}` : '';
    const minutesString = minutes ? `${hours ? ', ':''}${minutes} minute${minutes > 1 ? 's':''}` : '';
    const secondsString = seconds ? `${hours || minutes ? ' and ':''}${seconds} second${seconds > 1 ? 's':''}` : '';
    console.log(`Done in ${hoursString}${minutesString}${secondsString}.`);
}
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

const chalk = require('chalk');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptPath = path.parse(process.argv[1]);
const scriptName = scriptPath.base;
const useHelpString = 'Use -h or --help for more info.';

// parse params
const args = process.argv.slice(2);
let sourceDir, destinationDir, resizeRatio = .25;
// no arguments; source and destination default to current folder, size defaults to .25
if(args.length === 0){
    sourceDir = destinationDir = process.pwd();
    resizeRatio = .25;
}
// one argument; can be the help switch or <source>
if(args.length === 1){
    const [ arg ] = args;
    if(arg === '-h' || arg === '--help'){
        printHelpMessage();
    }
    // check if it's a path
    if(isValidDirectory(arg)){
        sourceDir = destinationDir = path.resolve(arg);
    } else {
        abort(`Path not found or not a directory: ${chalk.red(arg)}. ${useHelpString}`);
    }
}
// two arguments; <source> <size>
if(args.length === 2){
    const [ arg1 , arg2 ] = args;
    // console.log({arg1, arg2});
    // check if it's a path
    if(isValidDirectory(arg1)){
        sourceDir = destinationDir = path.resolve(arg1);
    } else {
        abort(`Path not found or not a directory: ${chalk.red(arg1)}. ${useHelpString}`);
    }
    // check if it's a number
    const test = parseFloat(arg2);
    if(isNaN(test) || test < 0){
        abort(`Not a positive number: ${chalk.red(arg2)}. ${useHelpString}`);
    } else {
        resizeRatio = test;
    }
}
// three arguments: <source> <size> <destination>
if(args.length === 3){
    const [ arg1 , arg2, arg3 ] = args;
    // console.log({arg1, arg2, arg3});
    // check if it's a path
    if(isValidDirectory(arg1)){
        sourceDir = path.resolve(arg1);
    } else {
        abort(`Path not found or not a directory: ${chalk.red(arg1)}. ${useHelpString}`);
    }
    // check if it's a number
    const test = parseFloat(arg2);
    if(isNaN(test) || test < 0){
        abort(`Not a positive number: ${chalk.red(arg2)}. ${useHelpString}`);
    } else {
        resizeRatio = test;
    }
    // check if it's a path
    if(isValidDirectory(arg3)){
        destinationDir = path.resolve(arg3);
    } else {
        abort(`Path not found or not a directory: ${chalk.red(arg3)}. ${useHelpString}`);
    }
}

// console.log({sourceDir, destinationDir, resizeRatio});
// check if ffmpeg is present
if(!isFfmpegPresent()){
    abort(`${chalk.red('ffmpeg')} not found or not executable.`);
}

const allFiles = fs.readdirSync(sourceDir).sort();
const videoFiles = allFiles.filter(file => file.endsWith('.mp4'));
const subtitleFiles = allFiles.filter(file => file.endsWith('.srt'));

// convert SRT to ASS subtitles
if(subtitleFiles.length){
    console.log(`Converting ${subtitleFiles.length} subtitle files...`);
    printProgressBar(0, 1);
    subtitleFiles.forEach((subFile, index, arr) => {
        srtToAss(subFile);
        printProgressBar(index + 1, arr.length);
    });
    console.log('\n');
} else {
    console.log('No subtitle files found.');
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
    console.log(`Resizing ${videoFiles.length} file${videoFiles.length > 1 ? 's':''} and embedding subtitle${videoFiles.length > 1 ? 's':''}...`);
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

const { resizePercentDisplay } = formatPercent(resizeRatio);
const mkvFiles = fs
    .readdirSync(destinationDir)
    .filter(file => file.endsWith('.mkv') && file.includes(resizePercentDisplay) && !file.includes('\u{2026}') && !file.includes('combined'));

// concat files
if(mkvFiles.length){
    // process.stdout.write('\033[K');
    process.stdout.write(`Concatenating ${videoFiles.length} file${videoFiles.length > 1 ? 's':''}...`);
    // create playlist file
    const concatPlaylist = path.join(destinationDir, 'concat-playlist.txt');
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
    let concatVideoFile = path.join(destinationDir, `combined${resizePercentDisplay}.mkv`);
    if(extractDate(firstFileName) === extractDate(lastFileName)){
        const date = extractDate(firstFileName);
        const startTime = extractTime(firstFileName);
        const endTime = extractTime(lastFileName);
        concatVideoFile = path.join(destinationDir, `${date} ${startTime}\u{2026}${endTime}${resizePercentDisplay}.mkv`);
        // console.log({concatVideoFile});
    }

    try {
        const shellCommand = `ffmpeg -y -hide_banner -loglevel fatal -f concat -safe 0 -i "${concatPlaylist}" -c copy "${concatVideoFile}"`;
        execSync(shellCommand, {stdio: [null, null, 'inherit']});
    } catch(err){
        console.error(err.toString());
    }
    process.stdout.cursorTo(0);
    process.stdout.write(`Concatenating ${videoFiles.length} file${videoFiles.length > 1 ? 's':''}... \t\t\t\t[${chalk.cyan('OK')}]\n`);
} else {
    abort('No files to concatenate!');
}
// remove work files
console.log('Cleaning up...');
cleanup();

printDuration();