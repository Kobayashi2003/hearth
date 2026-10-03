// Downloads the self-hosted Ruffle build into web/public/ruffle, where the
// Flash viewer and HTML pages with embedded Flash load it. Pinned, so every
// install plays the same way; bump RUFFLE_VERSION to upgrade.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import AdmZip from 'adm-zip';

const RUFFLE_VERSION = '0.6.0';
const url = `https://github.com/ruffle-rs/ruffle/releases/download/v${RUFFLE_VERSION}/ruffle-${RUFFLE_VERSION}-web-selfhosted.zip`;
const target = path.resolve(fileURLToPath(import.meta.url), '../../web/public/ruffle');

const response = await fetch(url);
if (!response.ok) throw new Error(`Downloading Ruffle failed: ${response.status} ${url}`);
const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
zip.extractAllTo(target, true);
fs.writeFileSync(path.join(target, 'VERSION'), `${RUFFLE_VERSION}\n`);
console.log(`Ruffle ${RUFFLE_VERSION} installed in ${target}`);
