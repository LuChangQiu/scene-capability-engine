const fc = require('fast-check');

const { buildPackageDiff } = require('../../../lib/commands/scene');

function sortStrings(values) {
  return values.slice().sort((left, right) => left.localeCompare(right));
}

const filePathArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]{1,6}$/),
    fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 0, maxLength: 2 }),
    fc.constantFrom('.txt', '.md', '.json')
  )
  .map(([name, segments, extension]) => [...segments, `${name}${extension}`].join('/'));

const fileEntryArb = fc.record({
  relativePath: filePathArb,
  content: fc.uint8Array({ maxLength: 32 }).map((value) => Buffer.from(value))
});

const fileSetArb = fc.uniqueArray(fileEntryArb, {
  selector: (entry) => entry.relativePath,
  maxLength: 8
});

describe('Scene diff properties', () => {
  test('buildPackageDiff is symmetric for added and removed paths', async () => {
    await fc.assert(
      fc.property(fileSetArb, fileSetArb, (fromFiles, toFiles) => {
        const forward = buildPackageDiff(fromFiles, toFiles);
        const reverse = buildPackageDiff(toFiles, fromFiles);

        expect(forward.added).toEqual(reverse.removed);
        expect(forward.removed).toEqual(reverse.added);
        expect(sortStrings(forward.unchanged)).toEqual(sortStrings(reverse.unchanged));
      }),
      { numRuns: 100 }
    );
  });

  test('buildPackageDiff partitions the union of all paths completely', async () => {
    await fc.assert(
      fc.property(fileSetArb, fileSetArb, (fromFiles, toFiles) => {
        const diff = buildPackageDiff(fromFiles, toFiles);
        const unionSize = new Set([
          ...fromFiles.map((entry) => entry.relativePath),
          ...toFiles.map((entry) => entry.relativePath)
        ]).size;
        const partitionSize = diff.added.length
          + diff.removed.length
          + diff.modified.length
          + diff.unchanged.length;

        expect(partitionSize).toBe(unionSize);
      }),
      { numRuns: 100 }
    );
  });
});
