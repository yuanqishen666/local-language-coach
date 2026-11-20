#!/usr/bin/env python3
"""Rebuilds resources/wordfreq/<language>.txt from the wordfreq package.

Each output file lists the most common words of one learning language, most common first,
one per line. The server reads them to tell how many uncommon words a reply contains.

The lists are data from wordfreq (https://github.com/rspeer/wordfreq) by Robyn Speer,
redistributed under CC BY-SA 4.0. See resources/wordfreq/README.md.

Usage:
  python3 -m pip download wordfreq --no-deps -d /tmp/wf && unzip -q /tmp/wf/wordfreq-*.whl -d /tmp/wf/unpacked
  python3 -m pip install msgpack --target /tmp/wf/py
  PYTHONPATH=/tmp/wf/py python3 scripts/build-wordfreq.py /tmp/wf/unpacked/wordfreq/data
"""
import gzip
import os
import sys
import unicodedata

import msgpack

LANGUAGES = ['en', 'es', 'fr', 'ja', 'de', 'ko', 'it', 'zh', 'pt', 'hi']
KEEP = 30000


def has_letter(word: str) -> bool:
    return any(unicodedata.category(ch).startswith('L') for ch in word)


def ranked_words(path: str):
    with gzip.open(path, 'rb') as stream:
        packed = msgpack.unpack(stream, raw=False)
    header = packed[0]
    if header.get('format') != 'cB' or header.get('version') != 1:
        raise SystemExit(f'Unexpected format in {path}: {header}')
    # Every later element holds the words of one frequency step, most frequent step first.
    for step in packed[1:]:
        for word in step:
            yield word


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    source = sys.argv[1]
    target = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'resources', 'wordfreq')
    os.makedirs(target, exist_ok=True)
    for language in LANGUAGES:
        large = os.path.join(source, f'large_{language}.msgpack.gz')
        small = os.path.join(source, f'small_{language}.msgpack.gz')
        path = large if os.path.exists(large) else small
        words = []
        seen = set()
        for word in ranked_words(path):
            word = unicodedata.normalize('NFC', word).strip().lower()
            if not word or word in seen or not has_letter(word) or any(ch.isspace() for ch in word):
                continue
            seen.add(word)
            words.append(word)
            if len(words) >= KEEP:
                break
        with open(os.path.join(target, f'{language}.txt'), 'w', encoding='utf-8') as out:
            out.write('\n'.join(words) + '\n')
        print(f'{language}: {len(words)} words from {os.path.basename(path)}')


if __name__ == '__main__':
    main()
