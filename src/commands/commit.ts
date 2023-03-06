import { execa } from 'execa';
import {
  GenerateCommitMessageErrorEnum,
  generateCommitMessageWithChatCompletion
} from '../generateCommitMessageFromGitDiff';
import { assertGitRepo, getStagedGitDiff } from '../utils/git';
import { spinner, confirm, outro, isCancel, intro } from '@clack/prompts';
import chalk from 'chalk';

const generateCommitMessageFromGitDiff = async (
  diff: string
): Promise<void> => {
  await assertGitRepo();

  const commitSpinner = spinner();
  commitSpinner.start('Generating the commit message');
  const commitMessage = await generateCommitMessageWithChatCompletion(diff);

  if (typeof commitMessage !== 'string') {
    const errorMessages = {
      [GenerateCommitMessageErrorEnum.emptyMessage]:
        'empty openAI response, weird, try again',
      [GenerateCommitMessageErrorEnum.internalError]:
        'internal error, try again',
      [GenerateCommitMessageErrorEnum.tooMuchTokens]:
        'too much tokens in git diff, stage and commit files in parts'
    };

    outro(`${chalk.red('✖')} ${errorMessages[commitMessage.error]}`);
    process.exit(1);
  }

  commitSpinner.stop('📝 Commit message generated');

  outro(
    `Commit message:
${chalk.grey('——————————————————')}
${commitMessage}
${chalk.grey('——————————————————')}`
  );

  const isCommitConfirmedByUser = await confirm({
    message: 'Confirm the commit message'
  });

  if (isCommitConfirmedByUser && !isCancel(isCommitConfirmedByUser)) {
    await execa('git', ['commit', '-m', commitMessage]);
    outro(`${chalk.green('✔')} successfully committed`);
  } else outro(`${chalk.gray('✖')} process cancelled`);
};

export async function commit(isStageAllFlag = false) {
  intro('open-commit');

  const stagedFilesSpinner = spinner();
  stagedFilesSpinner.start('Counting staged files');
  const staged = await getStagedGitDiff(isStageAllFlag);

  if (!staged && isStageAllFlag) {
    outro(
      `${chalk.red(
        'No changes detected'
      )} — write some code, stage the files ${chalk
        .hex('0000FF')
        .bold('`git add .`')} and rerun ${chalk
        .hex('0000FF')
        .bold('`oc`')} command.`
    );

    process.exit(1);
  }

  if (!staged) {
    outro(
      `${chalk.red('Nothing to commit')} — stage the files ${chalk
        .hex('0000FF')
        .bold('`git add .`')} and rerun ${chalk
        .hex('0000FF')
        .bold('`oc`')} command.`
    );

    stagedFilesSpinner.stop('Counting staged files');
    const isStageAllAndCommitConfirmedByUser = await confirm({
      message: 'Do you want to stage all files and generate commit message?'
    });

    if (
      isStageAllAndCommitConfirmedByUser &&
      !isCancel(isStageAllAndCommitConfirmedByUser)
    ) {
      await commit(true);
    }

    process.exit(1);
  }

  stagedFilesSpinner.stop(
    `${staged.files.length} staged files:\n${staged.files
      .map((file) => `  ${file}`)
      .join('\n')}`
  );

  await generateCommitMessageFromGitDiff(staged.diff);
}
