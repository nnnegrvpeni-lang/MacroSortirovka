const fs = require('fs');
const path = require('path');

const latestYmlPath = path.join(__dirname, 'dist', 'latest.yml');
if (fs.existsSync(latestYmlPath)) {
  let content = fs.readFileSync(latestYmlPath, 'utf8');
  
  // Read package.json version
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;
  
  const githubUrl = `https://github.com/nnnegrvpeni-lang/MacroSortirovka/releases/download/v${version}/Macro-Sorter-Setup-${version}.exe`;
  const filename = `Macro-Sorter-Setup-${version}.exe`;
  
  // Replace relative filename with absolute github link in latest.yml
  content = content.replace(new RegExp(filename, 'g'), githubUrl);
  
  fs.writeFileSync(latestYmlPath, content, 'utf8');
  console.log('Successfully injected absolute GitHub Release URL into latest.yml!');
  console.log('Target URL:', githubUrl);
} else {
  console.error('Error: dist/latest.yml not found. Run npm run dist first.');
}
