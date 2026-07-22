/** Minimal declarations for dependencies that ship no types. */

declare module 'word-extractor' {
  interface ExtractedDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
  }

  export default class WordExtractor {
    extract(filePath: string): Promise<ExtractedDocument>;
  }
}

declare module 'psd' {
  interface PsdImage {
    toPng(): Promise<{ data: Buffer }>;
  }

  interface PsdDocument {
    image: PsdImage;
  }

  const PSD: {
    open(filePath: string): Promise<PsdDocument>;
  };

  export default PSD;
}
