const fs = require('node:fs');

const args = process.argv.slice(2);
const stdin = args.includes('--stdin');
const file = stdin ? args[args.indexOf('--stdin-filename') + 1] : args.at(-1);
const source = stdin ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');

if (source.includes('SLOW_LINT')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);

if (source.includes('BROKEN_LINT_JSON')) {
  process.stdout.write('not json');
  process.exitCode = 2;
} else {
  const messages = source.split('\n').flatMap((line, index) => {
    const column = line.indexOf('BAD');
    return column < 0 ? [] : [{ ruleId: 'demo/no-bad', severity: 2, message: 'bad token', line: index + 1, column: column + 1 }];
  });
  process.stdout.write(JSON.stringify([{ filePath: file, messages }]));
  if (messages.length) process.exitCode = 1;
}
