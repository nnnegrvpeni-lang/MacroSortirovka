const fs = require('fs');
const path = require('path');
const Store = require('./store');
const Organizer = require('./organizer');

// 1. Setup Test Environment
const testDir = path.join(__dirname, 'test_sandbox');
const configFile = path.join(__dirname, 'test-settings.json');

// Helper to clean directory
function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
  }
}

console.log('--- Starting AutoSorter Test Suite ---');
cleanup();
fs.mkdirSync(testDir, { recursive: true });

// Mock store options
const defaultRules = {
  Images: ['.jpg', '.jpeg', '.png'],
  Documents: ['.pdf', '.txt'],
  Audio: ['.mp3'],
  Video: ['.mp4'],
  Others: []
};

// Instantiate mock store pointing to local test settings
const store = new Store({
  configName: 'test-settings',
  defaults: {
    folders: [],
    rules: defaultRules,
    stats: { totalFiles: 0, totalBytes: 0, categoryCounts: {} },
    history: []
  }
});
// Override store path to avoid polluting appData during testing
store.path = configFile;
store.set('rules', defaultRules);

// Dummy IPC renderer callback
const mockSend = (channel, data) => {
  console.log(`[IPC SEND -> ${channel}]:`, typeof data === 'object' ? JSON.stringify(data).slice(0, 80) + '...' : data);
};

// Instantiate Organizer
const organizer = new Organizer(store, mockSend);

// 2. Create Dummy Files
const filesToTest = [
  { name: 'vacation.jpg', content: 'dummy jpg data', expectedCat: 'Images' },
  { name: 'resume.pdf', content: 'dummy pdf data', expectedCat: 'Documents' },
  { name: 'notes.txt', content: 'some text content', expectedCat: 'Documents' },
  { name: 'podcast.mp3', content: 'mp3 sound bytes', expectedCat: 'Audio' },
  { name: 'movie.mp4', content: 'h264 stream', expectedCat: 'Video' },
  { name: 'random_file.unknown', content: 'unknown binary format', expectedCat: 'Others' }
];

console.log('\nCreating test files inside sandbox...');
filesToTest.forEach(f => {
  const filePath = path.join(testDir, f.name);
  fs.writeFileSync(filePath, f.content);
  console.log(`Created: ${f.name} (${f.content.length} bytes)`);
});

// Verify file creation
let createdCount = fs.readdirSync(testDir).filter(f => fs.statSync(path.join(testDir, f)).isFile()).length;
if (createdCount !== filesToTest.length) {
  console.error(`FAILED: Expected ${filesToTest.length} files created, found ${createdCount}`);
  process.exit(1);
}
console.log('SUCCESS: All test files created.');

// 3. Perform Scan & Sort
console.log('\nRunning manual Scan & Sort on sandbox directory...');
const sorted = organizer.scanFolder(testDir, false);

console.log(`Sorted ${sorted.length} files:`);
sorted.forEach(s => {
  console.log(`- ${s.fileName} -> ${s.category}`);
});

// Verify sorting outputs
console.log('\nVerifying sorting folders...');
filesToTest.forEach(f => {
  const targetPath = path.join(testDir, f.expectedCat, f.name);
  const rootPath = path.join(testDir, f.name);
  
  if (fs.existsSync(rootPath)) {
    console.error(`FAILED: File ${f.name} still exists in root!`);
    process.exit(1);
  }
  
  if (!fs.existsSync(targetPath)) {
    console.error(`FAILED: File ${f.name} was NOT sorted to ${f.expectedCat}/`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(targetPath, 'utf8');
  if (content !== f.content) {
    console.error(`FAILED: File content mismatch for ${f.name}!`);
    process.exit(1);
  }
});
console.log('SUCCESS: All files correctly moved to their subdirectories.');

// Verify stats in store
const stats = store.get('stats');
console.log('\nChecking statistics in store...');
console.log('Stats:', JSON.stringify(stats, null, 2));
if (stats.totalFiles !== filesToTest.length) {
  console.error(`FAILED: Expected totalFiles = ${filesToTest.length}, found ${stats.totalFiles}`);
  process.exit(1);
}
console.log('SUCCESS: Statistics are accurate.');

// Verify history in store
const history = store.get('history');
console.log('\nChecking history in store...');
if (history.length !== 1) {
  console.error(`FAILED: Expected 1 transaction in history, found ${history.length}`);
  process.exit(1);
}
const tx = history[0];
console.log(`Transaction ID: ${tx.id}, files count: ${tx.files.length}`);
console.log('SUCCESS: History log created.');

// 4. Perform Undo
console.log('\nUndoing transaction...');
const undone = organizer.undoTransaction(tx.id);
console.log(`Undone ${undone.length} files.`);

// Verify undo files restored to root
console.log('\nVerifying file restoration to root...');
filesToTest.forEach(f => {
  const targetPath = path.join(testDir, f.expectedCat, f.name);
  const rootPath = path.join(testDir, f.name);
  
  if (!fs.existsSync(rootPath)) {
    console.error(`FAILED: File ${f.name} was NOT restored to root!`);
    process.exit(1);
  }
  
  if (fs.existsSync(targetPath)) {
    console.error(`FAILED: File ${f.name} still exists in category folder ${f.expectedCat}!`);
    process.exit(1);
  }
});
console.log('SUCCESS: All files successfully restored to their original paths.');

// Verify empty subdirectories cleaned up
const remainingDirs = fs.readdirSync(testDir).filter(f => fs.statSync(path.join(testDir, f)).isDirectory());
if (remainingDirs.length > 0) {
  console.error(`FAILED: Expected all category subdirs to be deleted upon empty, found:`, remainingDirs);
  process.exit(1);
}
console.log('SUCCESS: Empty category directories deleted.');

// Verify stats reset to 0
const resetStats = store.get('stats');
if (resetStats.totalFiles !== 0 || resetStats.totalBytes !== 0) {
  console.error('FAILED: Stats were not reset to 0 after undo. Current stats:', resetStats);
  process.exit(1);
}
console.log('SUCCESS: Statistics successfully decremented.');

// Verify history is empty
const resetHistory = store.get('history');
if (resetHistory.length !== 0) {
  console.error('FAILED: History is not empty after undo.');
  process.exit(1);
}
console.log('SUCCESS: History transaction removed.');

// 5. Clean up
cleanup();
console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
process.exit(0);
