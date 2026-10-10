import { select } from '@inquirer/prompts';

export const cancelMessage = '已取消，未修改项目';

const theme = {
  prefix: { idle: '◇', done: '◆' },
  style: { highlight: text => `\u001B[36m${text}\u001B[39m` },
};

// 管道或测试里的输入流结束时 inquirer 会一直等待，这里把它变成取消。
function ask(prompt, config, { input = process.stdin, output = process.stdout } = {}) {
  const controller = new AbortController();
  let cancel;
  const closed = new Promise((_, reject) => {
    cancel = () => reject(new Error(cancelMessage));
    input.once('end', cancel);
    input.once('close', cancel);
  });
  const answer = prompt({ ...config, theme }, { input, output, signal: controller.signal });
  return Promise.race([answer, closed]).catch(error => {
    controller.abort();
    if (error?.name === 'ExitPromptError' || error?.name === 'AbortPromptError') throw new Error(cancelMessage);
    throw error;
  }).finally(() => {
    input.removeListener('end', cancel);
    input.removeListener('close', cancel);
  });
}

export function askSelect(config, streams) {
  return ask(select, config, streams);
}
