import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const config = JSON.parse(await read('opencode.json'));
assert.equal(config.$schema, 'https://opencode.ai/config.json');
assert.deepEqual(Object.keys(config).sort(), ['$schema', 'instructions', 'skills']);
assert.deepEqual(config.instructions, ['AGENTS.md']);
assert.deepEqual(config.skills, { paths: ['.agents/skills'] });
for (const path of config.instructions) {
  assert.ok((await stat(resolve(root, path))).isFile(), `Missing instruction: ${path}`);
}

const lock = JSON.parse(await read('skills-lock.json'));
assert.equal(lock.version, 1);
const expectedSources = new Set([
  'mattpocock/skills',
  'obra/superpowers',
  'vercel-labs/agent-skills',
  'trailofbits/skills',
]);
const counts = new Map();
const entries = Object.entries(lock.skills);
assert.ok(entries.length > 0, 'Empty skills catalog');
const folders = await readdir(resolve(root, '.agents/skills'), { withFileTypes: true });
assert.deepEqual(
  folders.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
  entries.map(([name]) => name).sort(),
  'Installed folders and lockfile differ',
);
for (const [name, entry] of entries) {
  assert.ok(expectedSources.has(entry.source), `Unexpected source for ${name}`);
  assert.equal(entry.sourceType, 'github');
  assert.match(entry.computedHash, /^[a-f0-9]{64}$/);
  const content = await read(`.agents/skills/${name}/SKILL.md`);
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  assert.ok(frontmatter, `Missing frontmatter: ${name}`);
  const declaredName = frontmatter.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1];
  assert.equal(declaredName, name, `Skill name/folder mismatch: ${name}`);
  assert.match(frontmatter, /^description:\s*\S/m, `Missing description: ${name}`);
  counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
}
assert.deepEqual(new Set(counts.keys()), expectedSources);

const guide = await read('docs/14_AGENT_SKILLS.md');
const table = guide.split('## Task-to-skill routing')[1]?.split('## Precedence')[0];
assert.ok(table, 'Missing routing table');
for (const [, name] of table.matchAll(/`([a-z][a-z0-9-]*)`/g)) {
  if (['impeccable', 'insecure-defaults', 'customize-opencode'].includes(name)) continue;
  assert.ok(Object.hasOwn(lock.skills, name), `Routing references missing skill: ${name}`);
}
const instructions = await read('AGENTS.md');
assert.ok(instructions.includes('docs/14_AGENT_SKILLS.md'));
assert.ok(instructions.includes('Automatically select and apply relevant installed skills'));
assert.ok(instructions.includes('Work silently: omit skill announcements'));
const routing = instructions.split('Default routing:')[1]?.split('\n')[0];
assert.ok(routing, 'Missing ambient routing');
for (const [, name] of routing.matchAll(/`([a-z][a-z0-9-]*)`/g)) {
  assert.ok(Object.hasOwn(lock.skills, name), `Ambient routing references missing skill: ${name}`);
}

console.log('PASS: OpenCode config structure, instruction paths, skill metadata, lockfile, and routing.');
console.log(`Installed: ${entries.length} skills`);
for (const [source, count] of counts) console.log(`  ${source}: ${count}`);
