import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@hearth/shared';

import { galleryFor, stepFamilyOf } from '../../web/src/features/mantel/viewerFor.js';

/**
 * Which files a viewer may step between.
 *
 * The rule is per-kind on purpose: flicking through a folder of photos is
 * browsing, but the same arrow landing on a spreadsheet, then a half-read novel,
 * then back on a photo is not. And a book or a text file is something you are
 * *in* — a "next" that abandons your place mid-chapter loses your page.
 */

const file = (name: string, mimeType = 'application/octet-stream'): FileEntry => ({
  name,
  path: `folder/${name}`,
  size: 1,
  mtime: '2026-01-01T00:00:00.000Z',
  mimeType,
  isDirectory: false,
});

const folder = (name: string): FileEntry => ({ ...file(name), isDirectory: true, mimeType: 'inode/directory' });

const image = (name: string) => file(name, 'image/jpeg');
const video = (name: string) => file(name, 'video/mp4');
const audio = (name: string) => file(name, 'audio/mpeg');
const text = (name: string) => file(name, 'text/plain');

describe('stepFamilyOf', () => {
  it('groups pictures, video and audio into their own families', () => {
    expect(stepFamilyOf(image('a.jpg'))).toBe('image');
    expect(stepFamilyOf(video('a.mp4'))).toBe('video');
    expect(stepFamilyOf(audio('a.mp3'))).toBe('audio');
  });

  it('lets comics step, because a series is read volume by volume', () => {
    expect(stepFamilyOf(file('v1.cbz'))).toBe('comic');
  });

  it('refuses to step for things you are reading', () => {
    expect(stepFamilyOf(file('book.epub'))).toBeNull();
    expect(stepFamilyOf(text('notes.txt'))).toBeNull();
    expect(stepFamilyOf(file('paper.pdf'))).toBeNull();
  });

  it('never steps a directory', () => {
    expect(stepFamilyOf(folder('sub'))).toBeNull();
  });
});

describe('galleryFor', () => {
  const siblings = [
    folder('sub'),
    image('1.jpg'),
    text('notes.txt'),
    image('2.png'),
    file('book.epub'),
    video('clip.mp4'),
    audio('song.mp3'),
    image('3.webp'),
  ];

  it('offers only the pictures when starting from a picture', () => {
    const gallery = galleryFor(image('1.jpg'), siblings);
    expect(gallery.map(entry => entry.name)).toEqual(['1.jpg', '2.png', '3.webp']);
  });

  it('does not mix video into the picture gallery', () => {
    expect(galleryFor(image('1.jpg'), siblings).some(e => e.name === 'clip.mp4')).toBe(false);
  });

  it('keeps audio and video apart — a playlist of one medium, not both', () => {
    expect(galleryFor(video('clip.mp4'), siblings).map(e => e.name)).toEqual(['clip.mp4']);
    expect(galleryFor(audio('song.mp3'), siblings).map(e => e.name)).toEqual(['song.mp3']);
  });

  it('gives a book no gallery at all, so no arrows appear', () => {
    expect(galleryFor(file('book.epub'), siblings)).toEqual([]);
    expect(galleryFor(text('notes.txt'), siblings)).toEqual([]);
  });

  it('preserves listing order, so "next" means the next one down the page', () => {
    const reversed = [image('3.webp'), image('1.jpg'), image('2.png')];
    expect(galleryFor(image('1.jpg'), reversed).map(e => e.name)).toEqual([
      '3.webp',
      '1.jpg',
      '2.png',
    ]);
  });

  it('excludes folders even among steppable kinds', () => {
    expect(galleryFor(image('1.jpg'), siblings).some(e => e.isDirectory)).toBe(false);
  });
});
