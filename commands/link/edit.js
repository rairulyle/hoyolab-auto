const { openEditor } = require("./editor.js");

const run = async (interaction) => await openEditor(interaction);

module.exports = { run };
