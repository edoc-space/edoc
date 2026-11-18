import { verifyMdxFingerprints } from './mdx-components-fingerprints.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { prepareMdxComponentsFixture } from './mdx-components-fixture.mjs';

const fixture = prepareMdxComponentsFixture(process.argv[2] ?? 'default');
const build = spawnSync('yarn', ['build'], { encoding: 'utf8', env: process.env });
writeFileSync('/evidence/pc3-production-build.log', build.stdout + build.stderr);
assert.equal(build.status, 0, build.stdout + build.stderr);
verifyMdxFingerprints(fixture);
