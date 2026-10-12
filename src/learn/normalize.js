import { identifyService } from '../services.js';
import { LEARN_ORIGIN, LearnError } from './client.js';

// Use only the course-bound launch URL supplied by LEARN; never manufacture it
// from the external tool endpoint, which cannot carry the LTI launch context.
export function learnLaunchUrl(value, courseId) {
  try {
    const url = new URL(value, LEARN_ORIGIN);
    if (url.origin !== LEARN_ORIGIN || url.username || url.password
      || !/^\/d2l\/common\/dialogs\/quickLink\/quickLink\.d2l$/i.test(url.pathname)
      || url.searchParams.get('ou') !== String(courseId)
      || !/^lti(?:launch)?$/i.test(url.searchParams.get('type') || '')) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeToc(toc, course, accountId) {
  if (!Array.isArray(toc?.Modules)) throw new LearnError('SCHEMA', 'Unexpected course contents response.');
  const resources = new Map();
  function walk(modules, parents = [], depth = 0) {
    if (depth > 50) throw new LearnError('SCHEMA', 'Course contents are nested too deeply.');
    for (const module of modules) {
      if (module.IsHidden || module.IsLocked) continue;
      const path = [...parents, String(module.Title || 'Module')];
      for (const topic of module.Topics || []) {
        const id = String(topic.TopicId ?? topic.Identifier ?? '');
        if (!/^\d+$/.test(id) || topic.IsHidden || topic.IsLocked || topic.IsBroken) continue;
        let sourceUrl;
        try { sourceUrl = new URL(topic.Url, LEARN_ORIGIN); } catch { sourceUrl = null; }
        const service = sourceUrl ? identifyService(sourceUrl.href) : null;
        const extension = sourceUrl?.pathname.split('.').pop().toLowerCase();
        const type = extension === 'pdf' ? 'PDF' : ['doc', 'docx'].includes(extension) ? 'DOC'
          : ['ppt', 'pptx'].includes(extension) ? 'SLIDES' : ['htm', 'html'].includes(extension) ? 'NOTES' : 'LINK';
        resources.set(id, {
          id: `${LEARN_ORIGIN}:${accountId}:${course.id}:${id}`, courseId: course.id,
          title: String(topic.Title || 'Untitled resource'), course: course.code,
          path: path.join(' / '), type, recent: false,
          // Open through LEARN so linked tools retain their course launch context.
          url: `${LEARN_ORIGIN}/d2l/le/content/${course.id}/viewContent/${id}/View`,
          modifiedAt: topic.LastModifiedDate || null,
          topicId: id, topicType: topic.TopicType ?? null,
          ...(learnLaunchUrl(topic.Url, course.id) ? { launchUrl: learnLaunchUrl(topic.Url, course.id) } : {}),
          // Raw URLs are kept only for accessible HTML content or a known tool.
          ...(service ? { targetUrl: service.url } : sourceUrl?.origin === LEARN_ORIGIN && /\.html?$/i.test(sourceUrl.pathname) ? { contentUrl: sourceUrl.href } : {}),
          description: String(topic.Description?.Text || topic.Description?.Html || ''),
          descriptionChecked: Object.hasOwn(topic, 'Description'),
          ...(service ? { service: service.name, aliases: service.aliases, destinationHost: service.hostname } : {})
        });
      }
      walk(module.Modules || [], path, depth + 1);
    }
  }
  walk(toc.Modules);
  return [...resources.values()];
}
