const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const replacements = [
  { search: /bg-white(?!\s+dark:bg-slate-900)/g, replace: 'bg-white dark:bg-slate-900' },
  { search: /bg-slate-50(?!\s+dark:bg-slate-800\/50)/g, replace: 'bg-slate-50 dark:bg-slate-800/50' },
  { search: /border-slate-200(?!\s+dark:border-slate-800)/g, replace: 'border-slate-200 dark:border-slate-800' },
  { search: /border-slate-300(?!\s+dark:border-slate-700)/g, replace: 'border-slate-300 dark:border-slate-700' },
  { search: /text-slate-900(?!\s+dark:text-slate-100)/g, replace: 'text-slate-900 dark:text-slate-100' },
  { search: /text-slate-700(?!\s+dark:text-slate-300)/g, replace: 'text-slate-700 dark:text-slate-300' },
  { search: /text-slate-500(?!\s+dark:text-slate-400)/g, replace: 'text-slate-500 dark:text-slate-400' },
  { search: /divide-slate-200(?!\s+dark:divide-slate-800)/g, replace: 'divide-slate-200 dark:divide-slate-800' },
  { search: /hover:bg-slate-50(?!\s+dark:hover:bg-slate-800\/50)/g, replace: 'hover:bg-slate-50 dark:hover:bg-slate-800/50' }
];

walkDir('src/components', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    for (const { search, replace } of replacements) {
      content = content.replace(search, replace);
    }
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});
