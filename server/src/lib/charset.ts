import iconv from 'iconv-lite';

const BYTE_ORDER_MARKS: ReadonlyArray<{ bytes: number[]; encoding: string }> = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf8' },
  { bytes: [0xff, 0xfe], encoding: 'utf16le' },
  { bytes: [0xfe, 0xff], encoding: 'utf16be' },
];

/** The legacy multi-byte encodings a personal library actually contains. */
const CANDIDATES = ['gb18030', 'big5', 'shift_jis', 'euc-kr'] as const;

/** How much text to weigh; enough to decide, cheap on a large file. */
const SAMPLE_BYTES = 64 * 1024;

/**
 * Characters frequent in real Chinese text. A wrong decoding also lands in the
 * CJK block, but rarely on these; they are what tells GB18030 from Big5.
 */
const COMMON_HAN = new Set(
  '的一是不了人我在有他这中大来上国个到说们为子和你地出道也时年得就那要下以生会自着去之过家学对可她里后小么心多天而能好都然没日于起还发成事只作当想看文无开手十用主行方又如前所本见经头面公同三已老从动两长知民样现分将外但身些与高意进把法此实回二理美点月明其种声全工己话儿者向情部正名定女问力机给等几很业最间新什打便位因重被走电四第门相次东海口使教西再平真听世气信北少关并内加化由却代军产入先山五太水万市眼体别处总才场师书比住员九笑性通目华报立马命张活难神数件安表原车白应路期叫死常提感金何更反合放做系计或司利受光王果亲界及今京务制解各任至清物台象记边共风战干接它许八特觉望直服毛林题建南度统色字请交爱让认算论百吃义科怎元社术结六功指思非流每青管夫连远资队跟带花快条院变联言权往展该领传近留红治决周保达办运武半候七必城父强步完革深区即求品士转量空甚众技轻程告江语英基派满式李息写呢识极令黄德收脸钱党倒未持取设始版双历越史商千片容研像找友孩站广改议形委早房音火际则首单据导影失拿网香似斯专石若兵弟谁校' +
    '這來國個們為說時會過學對後麼沒於還發當開經頭動兩長樣現將與實點種話兒問機給幾業間電門東無從見車總書員報馬張難數應聽氣關並內軍產萬處場師體別眼讀題',
);

/** Code point ranges outside ASCII, and what a character there says about a guess. */
const WEIGHTS: ReadonlyArray<[low: number, high: number, weight: number]> = [
  [0x3040, 0x30ff, 2], // hiragana, katakana
  [0x4e00, 0x9fff, 1], // CJK ideographs
  [0xac00, 0xd7a3, 1.2], // hangul
  [0xff61, 0xff9f, -1], // half-width kana: GBK misread as Shift_JIS
  [0x3000, 0x303f, 1], // CJK punctuation
  [0xff01, 0xff60, 1], // full-width forms
];

function weightOf(character: string): number {
  const code = character.codePointAt(0)!;
  if (code === 0xfffd) return -20;
  if (code < 0x20) return code === 9 || code === 10 || code === 13 ? 0 : -5;
  if (code < 0x80) return 0;
  if (COMMON_HAN.has(character)) return 3;
  const range = WEIGHTS.find(([low, high]) => code >= low && code <= high);
  return range ? range[2] : -1;
}

function score(text: string): number {
  let total = 0;
  for (const character of text) total += weightOf(character);
  return total;
}
function startsWith(buffer: Uint8Array, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isAscii(buffer: Uint8Array): boolean {
  for (const byte of buffer) if (byte >= 0x80) return false;
  return true;
}

function isValidUtf8(buffer: Uint8Array): boolean {
  // A truncated sample may cut the last multi-byte sequence in half.
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const replacement = decoded.indexOf('�');
  return replacement === -1 || replacement >= decoded.length - 4;
}

/**
 * BOM, then valid UTF-8, then whichever CJK legacy encoding reads most like
 * real text, else Windows-1252 (which never fails to decode). The result is an
 * iconv-lite name; viewers still offer a manual override.
 */
export function detectEncoding(input: Uint8Array): string {
  const buffer = input.subarray(0, SAMPLE_BYTES);
  for (const mark of BYTE_ORDER_MARKS) {
    if (startsWith(buffer, mark.bytes)) return mark.encoding;
  }
  if (isAscii(buffer) || isValidUtf8(buffer)) return 'utf8';

  let best = 'win1252';
  let bestScore = 0;
  for (const candidate of CANDIDATES) {
    const candidateScore = score(iconv.decode(Buffer.from(buffer), candidate));
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
}

function stripByteOrderMark(buffer: Buffer, encoding: string): Buffer {
  const mark = BYTE_ORDER_MARKS.find(candidate => candidate.encoding === encoding);
  return mark && startsWith(buffer, mark.bytes) ? buffer.subarray(mark.bytes.length) : buffer;
}

/** Detect (unless told) and decode. */
export function decodeText(buffer: Buffer, encoding = detectEncoding(buffer)): string {
  return iconv.decode(stripByteOrderMark(buffer, encoding), encoding);
}

/** The charset an HTML document declares for itself, if iconv knows it. */
export function declaredHtmlCharset(head: Buffer): string | null {
  const text = head.subarray(0, 4096).toString('latin1');
  const match = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(text);
  const name = match?.[1]?.toLowerCase();
  return name && iconv.encodingExists(name) ? name : null;
}
