export function normalizeSearchText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

const services = [
  { name: 'Möbius', hosts: ['mapleserver.com', 'mobius.cloud'], subdomains: true, aliases: ['mobius', 'möbius', 'maple ta', 'mapleta'] },
  { name: 'Marmoset', hosts: ['marmoset.student.cs.uwaterloo.ca'], aliases: ['marmoset', 'programming submission', 'autograder'] },
  { name: 'Crowdmark', hosts: ['crowdmark.com'], subdomains: true, aliases: ['crowdmark', 'crowd mark'] },
  { name: 'Gradescope', hosts: ['gradescope.com'], subdomains: true, aliases: ['gradescope', 'grade scope'] },
  { name: 'GitHub', hosts: ['github.com'], aliases: ['github', 'git', 'repository', 'repo', 'source code'] },
  { name: 'GitLab', hosts: ['gitlab.com', 'git.uwaterloo.ca'], aliases: ['gitlab', 'git', 'repository', 'repo', 'source code'] },
  { name: 'Course website', hosts: ['student.cs.uwaterloo.ca', 'www.student.cs.uwaterloo.ca', 'cs.uwaterloo.ca', 'www.cs.uwaterloo.ca'], aliases: ['course website', 'course site'] }
];

export function isContextLaunch(value) {
  try {
    const url = new URL(value);
    return /(?:^|\/)(?:lti[^/]*|launch|quicklink)(?:\/|$|\.)/i.test(url.pathname) || [...url.searchParams.keys()].some((key) => /^lti|launch/i.test(key));
  } catch { return true; }
}

// Identify the service by its hostname, never by a potentially misleading label.
export function identifyService(value, base) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.href.length > 4096 || [...url.searchParams.keys()].some((key) => /token|signature|session|password|secret|authorization/i.test(key))) return null;
    const service = services.find((item) => item.hosts.some((host) => url.hostname === host || item.subdomains && url.hostname.endsWith(`.${host}`)));
    if (service) return { name: service.name, aliases: service.aliases, hostname: url.hostname, url: url.href };
  } catch {}
  return null;
}

export function knownLinks(candidates, base) {
  const links = new Map();
  for (const candidate of candidates) {
    const service = identifyService(candidate.href, base);
    if (service && !links.has(service.url)) links.set(service.url, { ...service, label: candidate.label || '' });
  }
  return [...links.values()].slice(0, 20);
}

export function extractKnownLinks(html, base) {
  const candidates = [];
  let text = String(html || '');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('script,style,iframe,object').forEach((node) => node.remove());
    doc.querySelectorAll('a[href]').forEach((anchor) => candidates.push({ href: anchor.getAttribute('href'), label: anchor.textContent.trim() }));
    text = doc.body.textContent || '';
  }
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/gi)) {
    candidates.push({ href: match[0].replace(/[.,;!?)]+$/, ''), label: '' });
  }
  return knownLinks(candidates, base);
}

export function canOpenResource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return ['https://piazza.com', 'https://learn.uwaterloo.ca'].includes(url.origin) || Boolean(identifyService(url.href));
  } catch { return false; }
}
