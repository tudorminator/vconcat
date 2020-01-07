#!/usr/bin/env node
'use strict';

const path = require('path');
const process = require('process');

const argsList = process.argv.slice(2);
const cwd = path.resolve(process.cwd());
const defaults = {
  'destination': cwd,
  'help': false,
  'noCleanup': false,
  'noConcat': false,
  'resize': 'w320',
  'source': cwd,
};
const validParams = Object.keys(defaults);
const boolParams = ['help', 'noCleanup', 'noConcat'];

const getCanonicalParamName = name => name.replace(/^-+/g, '').trim() // replace starting double dash and trim
  .split('-') // split by dash (no-cleanup | no-concat)
  .map((str, index) => index ? `${str[0].toLocaleUpperCase()}${str.slice(1)}` : str) // camel case
  .join('');

const getParamValuePair = str => {
  const split = str.split('=');
  const argName = getCanonicalParamName(split[0]);
  let valuePair = {};
  let valid = Object.keys(defaults).includes(argName);
  switch (split.length){
    case 1:{
      // there is no value
      if(boolParams.includes(argName)){
        valuePair[argName] = true;
      } else {
        valuePair[argName] = null;
        // invalid because not a boolean argument
        valid = false;
      }
      break;
    }
    case 2:{
      if(boolParams.includes(argName)){
        const val = split[1];
        if(val !== 'nul' && val !== 'nil' && val !== 'no' && val !== 'off' && val !== '0'){
          valuePair[argName] = true;
        } else {
          valuePair[argName] = false;
        }
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