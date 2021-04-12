#!/usr/bin/env node
'use strict';

const path = require('path');
const process = require('process');

const argsList = process.argv.slice(2);
const cwd = path.resolve(process.cwd());
// default values for options
const defaults = {
  'source': cwd,
  'target': cwd,
  'resize': 'w320',
  'noConcat': false,
  'keep': false,
  'help': false,
  'verbose': false,
};
// short options mapped to long options
const shortOptions = {
  's': 'source',
  't': 'target',
  'r': 'resize',
  'n': 'noConcat',
  'k': 'keep',
  'h': 'help',
  'v': 'verbose',
};
// boolean options; TRUE if present, no matter the value (if any)
const boolParams = [
  'noConcat', 'n',
  'keep', 'k',
  'help', 'h',
  'verbose', 'v',
];
const validParams = Object.keys(defaults);

const getCanonicalParamName = name => {
  const newName = name.trim()
    .replace(/^-+/g, '') // replace starting double dash
    .split('-') // split by dash (no-cleanup | no-concat)
    .map((str, index) => index ? `${str[0].toLocaleUpperCase()}${str.slice(1)}` : str) // camel case
    .join('');
  return shortOptions[newName] || newName;
}

const getParamValuePair = str => {
  const split = str.split('=');
  const argName = getCanonicalParamName(split[0]);
  let valuePair = {};
  let valid = Object.keys(defaults).concat(Object.keys(shortOptions)).includes(argName);
  switch (split.length){
    case 1:{
      // there is no value
      if(boolParams.includes(argName)){
        valuePair[argName] = true;
      } else {
        valuePair[argName] = 'must have a value';
        // invalid because not a boolean argument
        valid = false;
      }
      break;
    }
    case 2:{
      if(boolParams.includes(argName)){
        valuePair[argName] = true;
      } else {
        valuePair[argName] = split[1];
      }
      break;
    }
    default:{
      valuePair[argName] = 'unsupported character "="';
      valid = false;
    }
  }
  return { valuePair, valid };
}

let parsed = {};
let unknown = [];
let invalid = {};
argsList.forEach((current, index, arr) => {
  const { valuePair, valid } = getParamValuePair(current);
  const argName = Object.keys(valuePair)[0];
  // const argValue = valuePair[argName];
  if(valid){
    parsed = Object.assign(parsed, valuePair);
  } else {
    if(validParams.includes(argName)){
      invalid = Object.assign(invalid, valuePair);
    } else {
      unknown = unknown.concat(Object.keys(valuePair));
    }
  }
});

module.exports = Object.assign(
  defaults,
  parsed,
  {invalid},
  {unknown},
  {paramsOK: !unknown.length && !Object.keys(invalid).length}
);