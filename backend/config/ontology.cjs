"use strict";

const fs = require("fs");
const path = require("path");

const ontologyPath = path.resolve(
  __dirname,
  "brs_market_ontology.json"
);

let ontology;

try {
  const raw = fs.readFileSync(ontologyPath, "utf-8");
  ontology = JSON.parse(raw);
} catch (err) {
  console.error("? FAILED TO LOAD BRS ONTOLOGY");
  console.error(err.message);
  process.exit(1); // FAIL-FAST
}

Object.freeze(ontology);
Object.freeze(ontology.domains);
Object.freeze(ontology.meta);

module.exports = ontology;
