import { describe, expect, it } from 'vitest';

import { isGitName, pathProblem } from './paths';

describe('pathProblem', () => {
  it.each([
    ['a.md'],
    ['docs/a.md'],
    ['.gitignore'],
    ['.github/workflows/ci.yml'],
    ['a/.gitkeep'],
    ['git'],
    ['notes/.gіt'], // a Cyrillic і: a different name on every file system
    ['with space/and-ünïcode.md'],
  ])('allows %s', (path) => {
    expect(pathProblem(path)).toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['/etc/passwd', 'absolute'],
    ['../outside.md', '".." segment'],
    ['a/../../b', '".." segment'],
    ['a/..', '".." segment'],
    ['./a.md', '"." segment'],
    ['a//b', 'empty segment'],
    ['a/', 'empty segment'],
    ['a\\b', 'backslash'],
    ['..\\outside', 'backslash'],
    ['a\0b', 'NUL'],
    ['.git/config', "git's own folder"],
    ['sub/.git/HEAD', "git's own folder"],
    ['.GIT/config', "git's own folder"],
    ['.Git/config', "git's own folder"],
    ['.git./config', "git's own folder"],
    ['.git /config', "git's own folder"],
    ['.g‌it/config', "git's own folder"],
    ['﻿.git/config', "git's own folder"],
    ['GIT~1/config', "git's own folder"],
  ])('refuses %j (%s)', (path, why) => {
    expect(pathProblem(path)).toContain(why);
  });

  it('refuses what is not a string', () => {
    expect(pathProblem(undefined)).not.toBeNull();
    expect(pathProblem(['a'])).not.toBeNull();
  });
});

describe('isGitName', () => {
  it('is only the names git takes for its folder', () => {
    expect(isGitName('.git')).toBe(true);
    expect(isGitName('.gitignore')).toBe(false);
    expect(isGitName('.github')).toBe(false);
    expect(isGitName('git')).toBe(false);
  });
});
