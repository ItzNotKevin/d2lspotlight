import { extractCourseCode } from '../search/courseCode.js';

const text = element => (element?.textContent || '').replace(/\s+/g, ' ').trim();
function passages(value) {
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + 1500);
    if (end < value.length) {
      const boundary = value.lastIndexOf(' ', end);
      if (boundary > start + 750) end = boundary;
    }
    chunks.push(value.slice(start, end).trim());
    start = end;
    while (value[start] === ' ') start++;
  }
  return chunks;
}
export function parseCoursePage(html, url, Parser = DOMParser) {
  const inert = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:img|iframe|object|embed|source|audio|video|link)\b[^>]*>/gi, '');
  const document = new Parser().parseFromString(inert, 'text/html');
  const documentTitle = text(document.querySelector('title'));
  const links = [...document.querySelectorAll('a[href]')].slice(0, 200).flatMap(anchor => {
    try {
      const destination = new URL(anchor.getAttribute('href'), url);
      if (destination.protocol !== 'https:' || destination.username || destination.password) return [];
      return [{ url: destination.href, label: text(anchor).slice(0, 150), context: text(anchor.closest('p,li') || anchor).slice(0, 300),
        reference: !anchor.closest('nav,aside,header,footer,.navbar,.sidebar,.navigation') }];
    } catch { return []; }
  });
  for (const node of document.querySelectorAll('script,style,noscript,template,iframe,object,embed,form,nav,aside,header,footer,.navbar,.sidebar,.navigation,[hidden],[aria-hidden="true"]')) node.remove();
  const content = document.querySelector('main,[role="main"],#content,.content') || document.body;
  const headings = [...content.querySelectorAll('h1,h2,h3,h4')];
  const title = text([...content.querySelectorAll('h1')].at(-1)) || documentTitle || 'Course website';
  const outlineReferences = links.filter(link => link.reference && /^https:\/\/outline\.uwaterloo\.ca\/viewer\/view\/[^?#]+$/.test(link.url));
  const referral = outlineReferences.length === 1 ? text(content).slice(title.length).replace(outlineReferences[0].label, '').trim() : '';
  const referralOnly = /^(?:the\s+)?(?:course\s+)?outline(?:\s+for\s+(?:fall|winter|spring|summer)\s+20\d{2})?\s+(?:can\s+be\s+viewed\s+at|can\s+be\s+found\s+at|is\s+available\s+at|is\s+available|is)[\s:.!]*$/i.test(referral);
  const forwardUrl = /^course outline$/i.test(title) && headings.length === 1 && text(content).length < 400 && outlineReferences.length === 1 && referralOnly
    ? outlineReferences[0].url : null;
  const sections = [];
  let truncated = false;
  for (const heading of headings.slice(0, 12)) {
    const parts = [];
    let sibling = heading.nextSibling;
    while (sibling && !(sibling.nodeType === 1 && /^H[1-4]$/.test(sibling.tagName))) {
      if (sibling.nodeType === 1 || sibling.nodeType === 3) parts.push(text(sibling));
      if (parts.join(' ').length > 24000) break;
      sibling = sibling.nextSibling;
    }
    const body = parts.join(' ').trim().slice(0, 24000);
    if (!body) continue;
    const anchor = heading.id || heading.querySelector('a[id],a[name]')?.getAttribute('id') || heading.querySelector('a[name]')?.getAttribute('name');
    const name = text(heading).slice(0, 200);
    for (const [part, passage] of passages(body).entries()) {
      const destination = new URL(url);
      if (anchor && !part) destination.hash = anchor;
      else {
        const quote = passage.length > 120 ? passage.slice(0, 120).replace(/\s+\S*$/, '').trim() : passage;
        destination.hash = `:~:text=${encodeURIComponent(quote)}`;
      }
      sections.push({ title: part ? `${name} · continued` : name, text: passage, url: destination.href,
        aliases: /^lates?$/i.test(name) ? ['late policy', 'late submission', 'late assignments'] : [] });
    }
    truncated ||= parts.join(' ').length > 24000;
  }
  return { title: title.slice(0, 200), courseCode: extractCourseCode(documentTitle), intro: text(content).slice(0, 1500),
    sections, links, forwardUrl, partial: truncated || headings.length > 12 || text(content).length > 24000 };
}

if (typeof chrome !== 'undefined' && typeof window !== 'undefined') chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== 'site-parser' || sender.id !== chrome.runtime.id || sender.tab) return;
  try {
    if (typeof message.html !== 'string' || message.html.length > 262144) throw new Error('Page too large.');
    reply({ ok: true, page: parseCoursePage(message.html, message.url) });
  } catch { reply({ ok: false, error: 'Could not parse course website page.' }); }
});
