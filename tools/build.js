// Builds dist/foxy-fight.html: the whole game (code, styles, baked data)
// in one file. Used for the Claude-hosted copy; also handy to email or upload.
const fs = require('fs'), path = require('path');
const rootDir = path.join(__dirname, '..');
require('./bake.js');
const read = f => fs.readFileSync(path.join(rootDir, f), 'utf8');
const inline = f => `<script>/* ${f} */\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`;
// The Claude-hosted copy can't make outside connections, so it leaves PeerJS out
// and the Versus screen explains where online play works.
const core = ['src/data.js', 'src/engine.js', 'src/ai.js', 'src/progression.js', 'src/art.js'];
const tail = ['src/baked-data.js', 'src/ui.js'];
const scripts = [...core, 'src/net.js', ...tail].map(inline).join('\n');
const scriptsWithNet = [...core, 'src/vendor/peerjs.min.js', 'src/net.js', ...tail].map(inline).join('\n');
const page = scr => `<title>Foxy Fight</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Josefin+Sans:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@500;600&family=Limelight&display=swap">
<style>\n${read('src/styles.css')}\n</style>
<div id="app" class="app"></div>
${scr}
`;
fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
// Fragment (no <html>/<head>/<body>) for hosts that wrap the page themselves
fs.writeFileSync(path.join(rootDir, 'dist', 'foxy-fight-fragment.html'), page(scripts));
// Full standalone document
fs.writeFileSync(path.join(rootDir, 'dist', 'foxy-fight.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page(scriptsWithNet)}</body>\n</html>\n`);
console.log('Built dist/foxy-fight.html and dist/foxy-fight-fragment.html');
