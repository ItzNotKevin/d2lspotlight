import { identifyService, extractKnownLinks, isContextLaunch, normalizeSearchText } from '../services.js';
import { learnLaunchUrl } from './normalize.js';

export function linkOnlyTarget({ links, remainingText, hasInteractive = false, hasMedia = false }) {
  if (hasInteractive || hasMedia || remainingText.trim() || links.length !== 1) return null;
  const service = identifyService(links[0].url);
  return service?.name === 'Möbius' && !isContextLaunch(service.url) ? service.url : null;
}

export function analyzeLinkPage(html, base, title = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const hasInteractive = Boolean(doc.querySelector('form,input,button,select,textarea,meta[http-equiv="refresh"]'));
  const hasMedia = Boolean(doc.querySelector('img,video,audio,iframe,object,embed,canvas,svg,math'));
  doc.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
  const anchors = [...doc.querySelectorAll('a[href]')];
  // Unknown extra links must also prevent an automatic shortcut.
  const allDestinations = new Set(anchors.map((anchor) => { try { return new URL(anchor.getAttribute('href'), base).href; } catch { return 'invalid'; } }));
  const links = extractKnownLinks(html, base);
  anchors.forEach((anchor) => anchor.remove());
  doc.querySelectorAll('h1,h2,h3').forEach((heading) => {
    if ([normalizeSearchText(title).trim(), 'mobius'].includes(normalizeSearchText(heading.textContent).trim())) heading.remove();
  });
  const remainingText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  const directUrl = allDestinations.size === 1 ? linkOnlyTarget({ links, remainingText, hasInteractive, hasMedia }) : null;
  const reason = directUrl ? 'DIRECT' : hasInteractive ? 'INTERACTIVE_CONTENT' : hasMedia ? 'MEDIA_CONTENT'
    : allDestinations.size !== 1 ? 'DESTINATION_COUNT' : remainingText ? 'PAGE_TEXT' : 'UNSUPPORTED_OR_CONTEXT_LINK';
  return { links, directUrl, reason, remainingTextLength: remainingText.length, destinationCount: allDestinations.size };
}

export function descriptionIsEmpty(description) {
  if (!description?.trim()) return true;
  if (typeof DOMParser === 'undefined') return false;
  // RichText often contains an empty paragraph rather than an empty string.
  const doc = new DOMParser().parseFromString(description, 'text/html');
  return !doc.body.textContent.replace(/\u00a0/g, ' ').trim()
    && !doc.querySelector('a[href],img,iframe,object,embed,video,audio,form,input,button,svg,math,script');
}

export async function enrichLearnLinks(resources, { loadHtml, loadTopic, signal, analyze = analyzeLinkPage, maximum = 30, onDiagnostic = () => {} } = {}) {
  const enriched = [];
  let loaded = 0;
  const positions = new Map(resources.map((resource, index) => [resource.id, index]));
  const priority = (resource) => identifyService(resource.targetUrl) || /\b(?:mobius|maple\s*ta)\b/.test(normalizeSearchText(resource.title)) ? 1 : 0;
  for (const saved of [...resources].sort((a, b) => priority(b) - priority(a))) {
    signal?.throwIfAborted();
    let resource = saved;
    let service = identifyService(resource.targetUrl);
    const mobiusCandidate = /\b(?:mobius|maple\s*ta)\b/.test(normalizeSearchText(resource.title));
    const report = (result, details = {}) => {
      if (mobiusCandidate || service?.name === 'Möbius') onDiagnostic({ stage: 'mobius-link', topicId: resource.topicId, result, ...details });
    };
    if ((service || mobiusCandidate || resource.launchUrl) && loadTopic && loaded < maximum && (!resource.descriptionChecked || resource.topicType === null)) {
      loaded++;
      try {
        const topic = await loadTopic(resource);
        signal?.throwIfAborted();
        resource = { ...resource, topicType: topic.TopicType, descriptionChecked: Object.hasOwn(topic, 'Description'),
          description: String(topic.Description?.Text || topic.Description?.Html || '') };
        service = identifyService(topic.Url);
        resource = { ...resource, launchUrl: learnLaunchUrl(topic.Url, resource.courseId) || undefined };
        if (topic.IsHidden || topic.IsLocked || topic.IsBroken) { enriched.push(saved); continue; }
        if (service) resource = { ...resource, targetUrl: service.url, service: service.name, aliases: service.aliases, destinationHost: service.hostname };
        else {
          try {
            const url = new URL(topic.Url, resource.url);
            if (url.origin === new URL(resource.url).origin && url.pathname.startsWith('/content/') && /\.html?$/i.test(url.pathname)) resource = { ...resource, contentUrl: url.href };
          } catch { /* Keep the accessible parent if metadata has no usable URL. */ }
        }
      } catch (error) {
        signal?.throwIfAborted();
        if (['RATE_LIMIT', 'SESSION', 'NOT_JSON'].includes(error.code)) throw error;
        report('TOPIC_FAILED', { code: error.code || 'FAILED' });
        enriched.push(saved);
        continue;
      }
    }
    if (resource.topicType === 3 && resource.descriptionChecked && descriptionIsEmpty(resource.description)
      && learnLaunchUrl(resource.launchUrl, resource.courseId)) {
      report('DIRECT_LEARN_LTI_LAUNCH');
      enriched.push({ ...resource, url: resource.launchUrl, parentUrl: resource.url, directLink: true });
      continue;
    }
    // D2L explicitly identifies ordinary URL topics with TopicType 3.
    if (resource.topicType === 3 && resource.descriptionChecked && service && !isContextLaunch(service.url) && descriptionIsEmpty(resource.description)) {
      report('DIRECT_TOPIC');
      enriched.push({ ...resource, url: service.url, parentUrl: resource.url, directLink: true });
      continue;
    }
    // Some topics put the only destination in their rich-text description.
    if (resource.descriptionChecked && resource.description?.trim() && !service && typeof DOMParser !== 'undefined') {
      const { directUrl, links } = analyze(resource.description, resource.url, resource.title);
      if (directUrl) {
        report('DIRECT_DESCRIPTION');
        const destination = links.find((link) => link.url === directUrl);
        enriched.push({ ...resource, url: directUrl, targetUrl: directUrl, parentUrl: resource.url, directLink: true,
          service: destination.name, aliases: destination.aliases, destinationHost: destination.hostname });
        continue;
      }
    }
    if (!resource.contentUrl || !loadHtml || loaded >= maximum) {
      report(loaded >= maximum ? 'INSPECTION_LIMIT' : 'NO_INSPECTABLE_PAGE', {
        topicType: resource.topicType, descriptionChecked: resource.descriptionChecked,
        descriptionLength: resource.description?.length || 0, targetHost: service?.hostname || null,
        contextLaunch: service ? isContextLaunch(service.url) : null
      });
      enriched.push(resource); continue;
    }
    loaded++;
    try {
      const html = await loadHtml(resource);
      signal?.throwIfAborted();
      const { links, directUrl, reason, remainingTextLength, destinationCount } = analyze(html, resource.contentUrl, resource.title);
      report(reason || (directUrl ? 'DIRECT_HTML' : 'KEPT_PARENT'), { remainingTextLength, destinationCount });
      const aliases = [...new Set([...(resource.aliases || []), ...links.flatMap((link) => link.aliases)])];
      enriched.push({ ...resource, aliases, ...(directUrl ? { url: directUrl, parentUrl: resource.url, directLink: true, service: 'Möbius' } : {}) });
      if (!directUrl) for (const link of links) {
        enriched.push({ ...resource, id: `${resource.id}:link:${link.url}`, title: `${link.name} · ${(link.label || resource.title).slice(0, 200)}`,
          type: 'LINK', path: `Linked from ${resource.title}`, service: link.name, aliases: link.aliases, destinationHost: link.hostname,
          url: resource.url, parentUrl: resource.url, targetUrl: link.url,
          // A meaningful parent page remains the entry point, including its instructions.
          contentUrl: undefined });
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (['RATE_LIMIT', 'SESSION'].includes(error.code)) throw error;
      report('HTML_FAILED', { code: error.code || 'FAILED' });
      // Optional enrichment failure must not remove the accessible LEARN result.
      enriched.push(resource);
    }
  }
  return enriched.sort((a, b) => positions.get(a.id.split(':link:')[0]) - positions.get(b.id.split(':link:')[0]));
}
