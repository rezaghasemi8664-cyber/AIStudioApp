"use strict";

function createProvider(provider) {
  if (!provider || typeof provider.sendPattern !== "function") {
    throw new Error("Invalid SMS provider");
  }
  return provider;
}

module.exports = {
  createProvider,
};
