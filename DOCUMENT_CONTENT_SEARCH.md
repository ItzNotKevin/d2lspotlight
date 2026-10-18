# Office document content search

Version 0.7.0 extends the existing PDF pipeline to modern PowerPoint and Word files linked in accessible LEARN course contents. Refresh courses on signed-in LEARN after upgrading. Settings → LEARN and documents controls indexing, retries, course selection, and pins for all supported formats.

| Format | Search coverage | Match location | Opening behavior |
| --- | --- | --- | --- |
| PDF | Existing extracted page text | Physical page | PDF URL with page fragment |
| PPTX | Slide text boxes and tables, in presentation order | Slide number | Original LEARN viewer |
| DOCX | Body paragraphs and tables | Paragraph range | Original LEARN viewer |
| PPT / DOC | Titles and course metadata | None | Original LEARN viewer |

Office locations are guidance for finding a passage after opening; automatic Office page/slide navigation is not provided. Word pagination depends on layout and is not inferred. DOCX paragraphs are grouped into roughly 2,000-character passages without splitting formatting runs. Slide order comes from presentation relationships rather than ZIP entry order or filenames. Blank slides retain their slide number.

Images, handwriting, speaker notes, headers/footers, comments, embedded objects, and linked external content are not searched. Encrypted, damaged, unsupported, or oversized archives fail with a retryable error. Truncated text and textless passages contribute to incomplete-coverage warnings. The formats are recognized from the file extension in LEARN's content URL; legacy metadata is refreshed after upgrading.

## Storage and limits

Extraction runs locally in the extension offscreen document using Chrome's XML parser and streaming decompressor. Downloads use the existing signed-in LEARN origin only, with redirects rejected. No Office contents are sent to another service and no new extension permissions are required.

The shared cache holds up to 100 documents and 8 million text characters. Existing account isolation, revision checks, cancellation, persistent progress/failures, pin protection, and replacement rules apply to Office files. Existing PDF revision keys are unchanged. Clearing document text clears cached PDF, PPTX, and DOCX text together.

PowerPoint and Word downloads are limited to 32 MiB; PDFs retain their 12 MiB limit. Embedded media is not decompressed for text search. Extracted text is limited to 1 million characters per document, 30,000 characters per slide/passage, and 400 slides/passages per document. Office archives may contain up to 4,096 entries. Only required XML parts are inflated, with a 4 MiB limit per part and 16 MiB total. Actual decompressed size and CRC are verified; encrypted entries, traversal paths, unsupported compression, and external slide relationships are rejected. ZIP64 and multipart archives are unsupported. Extraction has a 60-second timeout.

Implementation references: [Microsoft PresentationML text extraction](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-get-all-the-text-in-a-slide-in-a-presentation), [WordprocessingML structure](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document), [PKWARE ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT), and the [Compression Streams standard](https://compression.spec.whatwg.org/).

## Validation

`npm test` includes Office archive, extraction, search, filtering, revision/account isolation, progress, download, and malformed-file tests. `npm run check:pdf:extension` exercises the built extension in disposable Chrome, including real TOC discovery, direct and file-API Office downloads, offscreen extraction, cache persistence, slide/paragraph labels, and LEARN viewer opening. Fixture files contain no private course content. Live course files still need user verification.
