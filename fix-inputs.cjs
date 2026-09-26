const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Find all className="..." attributes inside <input, <select, <textarea tags
  // Since JSX can span multiple lines, we'll just do a simpler string replacement for common input classes.
  // We'll target any className that contains "focus:border-indigo-500" because that's the standard form control class used in the app.
  
  const classRegex = /className="([^"]*focus:border-indigo-500[^"]*)"/g;
  
  content = content.replace(classRegex, (match, classNames) => {
    let classes = classNames.split(/\s+/);
    
    if (!classes.includes('bg-white')) classes.push('bg-white');
    if (!classes.includes('dark:bg-slate-900')) classes.push('dark:bg-slate-900');
    if (!classes.includes('text-slate-900')) classes.push('text-slate-900');
    if (!classes.includes('dark:text-slate-100')) classes.push('dark:text-slate-100');
    
    return `className="${classes.join(' ')}"`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated form inputs in ${filePath}`);
  }
}

walkDir('src/components', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    processFile(filePath);
  }
});
