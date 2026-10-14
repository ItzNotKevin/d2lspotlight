import { canOpenResource } from './services.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookOpen, ChevronRight, Clock3, FileText, LayoutGrid, Presentation, Search } from 'lucide-react';

import { prepareQuery, rankResource } from './search/rank.js';
import { hybridSearch } from './search/hybrid.js';
import { useSemanticSearch } from './search/semantic/useSemanticSearch.jsx';
import { sampleResources } from './sampleResources.js';
import { usePdfSearch } from './search/pdf/usePdfSearch.jsx';
import { mergePdfResults } from './search/pdf/core.js';
import { filterResources } from './learn/search.js';
import { matchingSnippet } from './search/snippet.js';

const EMPTY_HISTORY = {};

function matches(resource, query) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = `${resource.title} ${resource.course} ${resource.path} ${resource.type}`.toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

function HighlightText({ text, query }) {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!terms.length) return text;

  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = String(text).split(new RegExp(`(${escaped.join('|')})`, 'gi'));

  return parts.map((part, index) =>
    index % 2 === 1 ? <mark className="ls-match" key={index}>{part}</mark> : part
  );
}

function isFilterActive(filter, scope, documents, recent) {
  if (filter === 'all' || filter === 'course') return scope === filter;
  if (filter === 'documents') return documents;
  return recent;
}

// The component names and motion structure follow the Spotlight reference.
function ShortcutButton({ shortcut, active, onClick, onHover }) {
  const Icon = shortcut.icon;
  return (
    <button
      type="button"
      className={`ls-shortcut ${active ? 'is-active' : ''}`}
      aria-label={shortcut.label}
      aria-pressed={active}
      title={shortcut.label}
      onClick={onClick}
      onMouseEnter={() => onHover(shortcut.label)}
      onMouseLeave={() => onHover(null)}
      tabIndex={-1}
    >
      <span className="ls-shortcut-icon"><Icon aria-hidden="true" size={19} strokeWidth={1.65} /></span>
      <span className="ls-shortcut-label" aria-hidden="true">{shortcut.shortLabel}</span>
    </button>
  );
}

function SpotlightPlaceholder({ text }) {
  return (
    <span className="ls-placeholder" aria-hidden="true">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function SpotlightInput({ inputRef, value, onChange, onKeyDown, placeholder, expanded, activeId }) {
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  return (
    <div className="ls-search">
      <motion.span layoutId="search-icon" className="ls-search-icon" aria-hidden="true">
        <Search size={24} strokeWidth={1.8} />
      </motion.span>
      <div className="ls-input-wrap">
        {!value && <SpotlightPlaceholder text={placeholder} />}
        <input
          ref={inputRef}
          className="ls-input"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-label="Search course resources"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? 'ls-results' : undefined}
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck="false"
        />
      </div>
      <span className="ls-key" aria-hidden="true">ESC</span>
    </div>
  );
}

function SearchResultCard({ id, resource, query, selected, onSelect, onHover }) {
  const snippet = matchingSnippet(resource, query);
  let destination = '';
  try { destination = new URL(resource.url).hostname; } catch {}
  const fuzzy = query.trim() && rankResource(resource, prepareQuery(query))?.fuzzy;
  const Icon = resource.type === 'SLIDES' ? Presentation : resource.type === 'PDF' ? BookOpen : FileText;
  // Selection follows mouse movement, not mouse position, so rows sliding under
  // a resting cursor (typing, keyboard scrolling) don't steal the selection.
  return (
    <button
      type="button"
      id={id}
      className={`ls-row ${selected ? 'is-selected' : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseMove={selected ? undefined : onHover}
      onClick={onSelect}
    >
      <span className={`ls-row-icon ls-type-${resource.type.toLowerCase()}`} aria-hidden="true"><Icon size={19} strokeWidth={1.65} /></span>
      <span className="ls-row-copy">
        <span className="ls-row-title"><HighlightText text={resource.title} query={query} /></span>
        <span className="ls-row-meta">
          <span className="ls-type-label"><HighlightText text={resource.type} query={query} /></span>
          {resource.source && <span>{resource.source}</span>}
          {resource.service && <span>{resource.service}</span>}
          {resource.directLink && <span>Opens directly</span>}
          {resource.pdfMatch && <span>PDF page {resource.pdfPage}{resource.pdfPartial ? ' · partial index' : ''}</span>}
          {resource.websiteSection && <span>Website section</span>}
          {resource.websiteReference && <span title="Linked from the course site; destination contents have not been indexed.">Linked reference</span>}
          {resource.instructor && <span>{resource.instructor}</span>}
          {fuzzy && <span>Similar spelling</span>}
          {resource.outlineWeek ? <span title="Topics inferred from the course outline’s weekly plan; document contents have not been read.">Outline suggests Week {resource.outlineWeek.week}</span> : resource.semanticMatch && <span>Related meaning</span>}
          <span className="ls-row-path"><HighlightText text={resource.path} query={query} /></span>
        </span>
        {resource.source === 'Website' && destination && <span className="ls-row-origin">{resource.websiteReference ? 'Reference destination' : 'Course website'} · {destination}</span>}
        {snippet && <span className="ls-row-snippet"><HighlightText text={snippet} query={query} /></span>}
      </span>
      <span className="ls-course"><HighlightText text={resource.course} query={query} /></span>
      <ChevronRight className="ls-chevron" size={16} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );
}

function SearchResultsContainer({ listRef, results, query, selectedIndex, onHover, onSelect, heading = 'Matching resources', emptyMessage = 'Try another title, course code, or remove a filter.' }) {
  return (
    <div className="ls-results" ref={listRef}>
      <div className="ls-section" aria-hidden="true"><span>{heading}</span><span>{results.length} shown</span></div>
      <div id="ls-results" role="listbox" aria-label="Course resources">
        {results.map((resource, index) => (
          <motion.div
            key={resource.id || `${resource.course}-${resource.title}`}
            role="presentation"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, delay: Math.min(index * 0.035, 0.14) }}
          >
            <SearchResultCard
              id={`ls-option-${index}`}
              resource={resource}
              query={query}
              selected={index === selectedIndex}
              onHover={() => onHover(index)}
              onSelect={() => onSelect(index)}
            />
          </motion.div>
        ))}
      </div>
      {!results.length && (
        <div className="ls-empty"><strong>No matching resources</strong><span>{emptyMessage}</span></div>
      )}
    </div>
  );
}

export function Spotlight({ isOpen = true, handleClose = () => {}, onExited = () => {}, resources = sampleResources, demo = true, connection = null, courseLabel = 'MATH 239', footer = 'Sample resources · design preview', courses = [], history = EMPTY_HISTORY, onResourceOpen = () => {}, remoteResults = null, onQueryChange, onSearch, semanticEnabled = false, pdfSearchEnabled = true, pdfRevision = 0, onFiltersChange, onLabelNotes }) {
  const shortcuts = [
    { id: 'all', label: 'All courses', shortLabel: 'All', icon: LayoutGrid },
    ...(demo ? [{ id: 'course', label: courseLabel, shortLabel: 'Course', icon: BookOpen }] : []),
    { id: 'documents', label: 'Documents', shortLabel: 'Docs', icon: FileText },
    { id: 'recent', label: 'Recent', shortLabel: 'Recent', icon: Clock3 }
  ];
  const [hovered, setHovered] = useState(false);
  const [hoveredShortcut, setHoveredShortcut] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [scope, setScope] = useState('all');
  const [courseId, setCourseId] = useState('');
  const [source, setSource] = useState('');
  const [notesSection, setNotesSection] = useState('');
  const [instructor, setInstructor] = useState('');
  const [instructorLabel, setInstructorLabel] = useState('');
  const [documents, setDocuments] = useState(false);
  const [recent, setRecent] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const backdropRef = useRef(null);
  const keyboardMoved = useRef(false);
  const reducedMotion = useReducedMotion();
  const hasQuery = Boolean(searchValue.trim());
  const expanded = hasQuery || !demo;
  const semantic = useSemanticSearch({ enabled: semanticEnabled && !demo && remoteResults === null,
    isOpen, resources, query: searchValue, courseId, source, documents, recent, history });
  const filters = useMemo(() => ({ courseId, source, documents, recent, notesSection, instructor }), [courseId, source, documents, recent, notesSection, instructor]);
  const pdf = usePdfSearch({ isOpen: isOpen && pdfSearchEnabled && !demo && remoteResults === null, query: searchValue, filters, resources, revision: pdfRevision, history });
  useEffect(() => { onFiltersChange?.(filters); }, [filters, onFiltersChange]);
  const scopedPdfs = useMemo(() => filterResources(resources, { courseId, source }).filter(resource => resource.type === 'PDF'), [resources, courseId, source]);
  const sections = [...new Map(scopedPdfs.filter(resource => resource.notesSection).map(resource => [resource.notesSection, resource])).values()];
  const instructors = [...new Set(scopedPdfs.map(resource => resource.instructor).filter(Boolean))].sort();
  useEffect(() => {
    if (notesSection && !scopedPdfs.some(resource => resource.notesSection === notesSection)) setNotesSection('');
    if (instructor && !scopedPdfs.some(resource => resource.instructor === instructor)) setInstructor('');
  }, [scopedPdfs, notesSection, instructor]);

  const searchResults = useMemo(() => {
    if (remoteResults !== null) return remoteResults;
    if (!demo) return mergePdfResults(hybridSearch(resources, { query: searchValue, ...filters, history }, semantic.matches), pdf.matches);
    if (!hasQuery) return [];
    return resources.filter((resource) =>
      matches(resource, searchValue) &&
      (scope === 'all' || resource.course === courseLabel) &&
      (!documents || ['PDF', 'DOC', 'NOTES', 'SLIDES'].includes(resource.type)) &&
      (!recent || resource.recent)
    );
  }, [resources, courseLabel, documents, hasQuery, recent, scope, searchValue, demo, courseId, source, history, remoteResults, semantic.matches, filters, pdf.matches]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const previousResults = useRef({ query: searchValue, items: searchResults });
  useEffect(() => {
    const previous = previousResults.current;
    const selectedId = previous.items[selectedIndex]?.id;
    const preserved = previous.query === searchValue ? searchResults.findIndex((item) => item.id === selectedId) : -1;
    const next = preserved >= 0 ? preserved : 0;
    if (next !== selectedIndex) setSelectedIndex(next);
    if (previous.query !== searchValue && listRef.current) listRef.current.scrollTop = 0;
    previousResults.current = { query: searchValue, items: searchResults };
  }, [searchResults, searchValue, selectedIndex]);

  // Keep the keyboard selection visible; hover selection is already under the cursor.
  useEffect(() => {
    if (!keyboardMoved.current || !listRef.current) return;
    keyboardMoved.current = false;
    if (selectedIndex === 0) listRef.current.scrollTop = 0;
    else listRef.current.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Stop wheel scrolling from reaching the page behind the overlay. React's wheel
  // listeners are passive, so this needs a native listener to call preventDefault.
  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    function blockPageScroll(event) {
      const path = event.composedPath();
      const containers = [listRef.current, backdrop.querySelector('.ls-panel')];
      const scrollable = containers.some((node) => node && path.includes(node)
        && node.scrollHeight > node.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY));
      if (!scrollable) event.preventDefault();
    }
    backdrop.addEventListener('wheel', blockPageScroll, { passive: false });
    return () => backdrop.removeEventListener('wheel', blockPageScroll);
  }, [isOpen]);

  function changeSearch(value) {
    setSearchValue(value);
    onQueryChange?.(value);
    setSelectedIndex(0);
    setNotice('');
  }

  function selectFilter(filter) {
    if (filter === 'all' || filter === 'course') setScope(filter);
    if (filter === 'all') { setCourseId(''); setSource(''); setNotesSection(''); setInstructor(''); }
    if (filter === 'documents') setDocuments((current) => !current);
    if (filter === 'recent') setRecent((current) => !current);
    setSelectedIndex(0);
  }

  function selectResult(index) {
    if (!searchResults[index]) return;
    if (!demo) {
      if (!canOpenResource(searchResults[index].url)) return;
      const url = new URL(searchResults[index].url);
      window.open(url.href, '_blank', 'noopener,noreferrer');
      onResourceOpen(searchResults[index]);
      return;
    }
    setNotice('Preview only — links come later');
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3200);
  }

  function handleInputKeyDown(event) {
    if (event.key === 'ArrowDown' && searchResults.length) {
      event.preventDefault();
      keyboardMoved.current = true;
      setSelectedIndex((index) => (index + 1) % searchResults.length);
    }
    if (event.key === 'ArrowUp' && searchResults.length) {
      event.preventDefault();
      keyboardMoved.current = true;
      setSelectedIndex((index) => (index - 1 + searchResults.length) % searchResults.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (onSearch && !searchResults.length) onSearch();
      else selectResult(selectedIndex);
    }
  }

  function handleDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Like macOS Spotlight: the first Esc clears the query, the second closes.
      if (searchValue) {
        changeSearch('');
        // Chips unmount when results collapse; keep focus inside the dialog.
        inputRef.current?.focus();
      } else {
        handleClose();
      }
    }
    if (event.key === 'Tab') {
      // Result rows are reached with the arrow keys, not Tab (listbox pattern).
      const focusables = [...event.currentTarget.querySelectorAll('input, button:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea, a[href], summary')].filter(element => element.getClientRects().length);
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && event.target === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  const placeholder = hoveredShortcut ? `Search ${hoveredShortcut.toLowerCase()}…` : 'Search your course materials…';
  const motionTiming = reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 530, damping: 47 };

  return (
    <AnimatePresence mode="wait" onExitComplete={onExited}>
      {isOpen ? (
        <motion.div
          key="spotlight"
          ref={backdropRef}
          className="ls-backdrop"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) handleClose(); }}
          onKeyDown={handleDialogKeyDown}
        >
          <motion.div
            className="ls-launcher"
            initial={reducedMotion ? false : { opacity: 0, y: -10, scaleX: 1.035, scaleY: 0.97, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scaleX: 1, scaleY: 1, filter: 'blur(0px)' }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98, filter: 'blur(6px)' }}
            transition={motionTiming}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setHoveredShortcut(null); }}
          >
            <motion.section
              layout
              className={`ls-panel ${expanded ? 'is-expanded' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label="Learn Spotlight search"
              transition={{ layout: motionTiming }}
            >
              <SpotlightInput
                inputRef={inputRef}
                value={searchValue}
                onChange={changeSearch}
                onKeyDown={handleInputKeyDown}
                placeholder={placeholder}
                expanded={expanded}
                activeId={expanded && searchResults[selectedIndex] ? `ls-option-${selectedIndex}` : undefined}
              />
              {connection}
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    key="results"
                    className="ls-expanded-content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {remoteResults === null && <div className="ls-filters" role="group" aria-label="Search filters">
                      {!demo && <select className="ls-course-filter" aria-label="Search source" value={source} onChange={(event) => { setSource(event.target.value); setCourseId(''); setNotesSection(''); setInstructor(''); }}>
                        <option value="">All sources</option>
                        <option value="LEARN">LEARN only</option>
                        <option value="Piazza">Piazza only</option>
                        <option value="Website">Course websites only</option>
                      </select>}
                      {shortcuts.map((shortcut) => {
                        const Icon = shortcut.icon;
                        const active = shortcut.id === 'all' && !demo ? !courseId && !source : isFilterActive(shortcut.id, scope, documents, recent);
                        return <button key={shortcut.id} className="ls-chip" type="button" aria-pressed={active} onClick={() => selectFilter(shortcut.id)}><Icon size={13} strokeWidth={1.7} aria-hidden="true" />{shortcut.label}</button>;
                      })}
                      {!demo && courses.length > 0 && <select className="ls-course-filter" aria-label="Filter by course" value={courseId} onChange={(event) => { setCourseId(event.target.value); setNotesSection(''); setInstructor(''); setSelectedIndex(0); }}>
                        <option value="">All courses</option>
                        {courses.filter((course) => !source || resources.some(resource => resource.courseId === course.id && resource.source === source)).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                      </select>}
                      {!demo && sections.length > 0 && <select className="ls-course-filter" aria-label="Filter by notes section" value={notesSection} onChange={event => {
                        setNotesSection(event.target.value); setInstructorLabel(sections.find(resource => resource.notesSection === event.target.value)?.instructor || '');
                      }}>
                        <option value="">All notes sections</option>
                        {sections.map(resource => <option key={resource.notesSection} value={resource.notesSection}>{!courseId ? `${resource.course} · ` : ''}{resource.path || 'Course root'}</option>)}
                      </select>}
                      {!demo && instructors.length > 0 && <select className="ls-course-filter" aria-label="Filter by instructor" value={instructor} onChange={event => setInstructor(event.target.value)}>
                        <option value="">All instructors</option>
                        {instructors.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>}
                      {!demo && notesSection && onLabelNotes && <label className="ls-instructor-label">Instructor for this notes section
                        <input aria-label="Instructor for this notes section" value={instructorLabel} maxLength={100} onChange={event => setInstructorLabel(event.target.value)} placeholder="Enter instructor name" />
                        <button className="ls-chip" onClick={() => onLabelNotes(notesSection, instructorLabel)}>Save instructor</button>
                      </label>}
                    </div>}
                    <SearchResultsContainer listRef={listRef} results={searchResults} query={searchValue} selectedIndex={selectedIndex} onHover={setSelectedIndex} onSelect={selectResult}
                      heading={remoteResults !== null ? 'Piazza posts' : hasQuery ? 'Matching resources' : searchResults.some((item) => history[item.id]) ? 'Recently opened' : 'Start exploring'}
                      emptyMessage={remoteResults !== null ? 'Type to search Piazza.' : !resources.length ? 'Open Spotlight on LEARN or in a Piazza class to load resources.' : !hasQuery && recent ? 'Open a resource through Spotlight to see it here.' : 'Try another title, course code, or remove a filter.'} />
                    <div className="ls-footer"><span>{footer}</span><span className="ls-hints"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Select</span></span><span className="ls-notice" role="status" aria-live="polite">{notice || pdf.message || semantic.message}</span></div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.section>
            <AnimatePresence>
              {hovered && !expanded ? (
                <motion.div className="ls-shortcuts" key="shortcuts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {shortcuts.map((shortcut, index) => (
                    <motion.div
                      key={shortcut.id}
                      initial={reducedMotion ? false : { opacity: 0, scale: 0.72, x: -18 * (index + 1) }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.8, x: -8 }}
                      transition={{ ...motionTiming, delay: reducedMotion ? 0 : index * 0.035 }}
                    >
                      <ShortcutButton
                        shortcut={shortcut}
                        active={isFilterActive(shortcut.id, scope, documents, recent)}
                        onClick={() => selectFilter(shortcut.id)}
                        onHover={setHoveredShortcut}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
