"use strict";

const versions = require("./version.cjs");

module.exports.resolveEngine = (requested) => {
  if (!requested) return versions.CURRENT;

  if (!versions.SUPPORTED.includes(requested)) {
    throw new Error(`Unsupported rule engine version: ${requested}`);
  }

  return requested;
};
