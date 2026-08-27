// Regenerate corpus.json from the live curriculum (src/lib/voiceLines.ts).
// Run after a curriculum change, before the generator. See README.
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spokenCorpus } from "../../src/lib/voiceLines.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const lines = spokenCorpus();
const chars = lines.reduce((n, l) => n + (l.say ?? l.text).length, 0);
const corpus = { count: lines.length, chars, lines };
writeFileSync(join(HERE, "corpus.json"), JSON.stringify(corpus));
console.log(`corpus.json: ${lines.length} lines, ${chars} chars`);
