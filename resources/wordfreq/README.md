# Word frequency lists

The files `en.txt`, `es.txt`, `fr.txt`, `ja.txt`, `de.txt`, `ko.txt`, `it.txt`, `zh.txt`, `pt.txt` and `hi.txt`
list the most common words of each language, most common first, one per line (up to 30,000 per language).
Yujian reads them to tell how many uncommon words a reply contains, so that a reply can be kept within
the learner's current level.

## Source and licence

The lists are derived from the data files of **wordfreq 3.1.1** by Robyn Speer
(<https://github.com/rspeer/wordfreq>). Changes made here: only the rank order of the most common
30,000 entries is kept, entries are lower-cased and NFC-normalised, and entries without a letter are dropped.
`scripts/build-wordfreq.py` reproduces them.

wordfreq's data files are redistributable under the
[Creative Commons Attribution-ShareAlike 4.0 licence](https://creativecommons.org/licenses/by-sa/4.0/).
**The lists in this directory are redistributed under the same licence (CC BY-SA 4.0).** This applies to
the files in this directory only, not to the rest of the application.

> Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. https://doi.org/10.5281/zenodo.7199437

## Sources wordfreq is built on

As stated by wordfreq:

- Google Books Ngrams (<http://books.google.com/ngrams>) and Google Books Syntactic Ngrams. Ngram Viewer
  graphs and data may be freely used for any purpose; acknowledgement of Google Books Ngram Viewer as the
  source is appreciated.
- The Leeds Internet Corpus, University of Leeds Centre for Translation Studies
  (<http://corpus.leeds.ac.uk/list.html>).
- Wikipedia, the free encyclopedia (<http://www.wikipedia.org>).
- ParaCrawl, a multilingual Web crawl (<https://paracrawl.eu>).
- OPUS OpenSubtitles 2018 (<http://opus.nlpl.eu/OpenSubtitles.php>), whose data originates from the
  OpenSubtitles project (<http://www.opensubtitles.org/>).
- The SUBTLEX word lists SUBTLEX-US, SUBTLEX-UK, SUBTLEX-CH, SUBTLEX-DE and SUBTLEX-NL, created by
  Marc Brysbaert et al., freely available at <http://crr.ugent.be/programs-data/subtitle-frequencies>.
- Word statistics collected from the streaming Twitter API; no Twitter content is included.

The full list of citations is in the wordfreq README:
<https://github.com/rspeer/wordfreq#citations-to-work-that-wordfreq-is-built-on>.
