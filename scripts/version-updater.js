module.exports.readVersion = (contents) => contents.trim().replace(/^v/, "");
module.exports.writeVersion = (contents, version) => `v${version}`;
