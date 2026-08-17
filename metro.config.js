// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite's web implementation loads a wa-sqlite WebAssembly binary.
config.resolver.assetExts.push("wasm");

module.exports = config;
