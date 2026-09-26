import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookOpen, ChevronRight, Clock3, FileText, LayoutGrid, Presentation, Search } from 'lucide-react';

const resources = [
  { title: 'Bijections and counting', course: 'MATH 239', path: 'Unit 04 / Counting techniques', type: 'PDF', recent: true },
  { title: 'Proof techniques: injections and surjections', course: 'MATH 239', path: 'Unit 03 / Lecture notes', type: 'NOTES', recent: false },
  { title: 'Graph theory — chapter readings', course: 'MATH 239', path: 'Unit 06 / Textbook', type: 'PDF', recent: true },
  { title: 'Logic and proof systems', course: 'CS 245', path: 'Week 05 / Slides', type: 'SLIDES', recent: true },
  { title: 'Relations and functions', course: 'MATH 135', path: 'Week 07 / Course notes', type: 'PDF', recent: false },
  { title: 'Practice problems: direct proofs', course: 'CS 245', path: 'Week 03 / Tutorials', type: 'DOC', recent: false }
];

const shortcuts = [
  { id: 'all', label: 'All courses', icon: LayoutGrid },
  { id: 'course', label: 'This course', icon: BookOpen },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'recent', label: 'Recent', icon: Clock3 }
];

function matches(resource, query) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = `${resource.title} ${resource.course} ${resource.path} ${resource.type}`.toLocaleLowerCase();
  return words.every((word) => text.includes(word));
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
      <Icon aria-hidden="true" size={19} strokeWidth={1.65} />
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

function SpotlightInput({ value, onChange, onKeyDown, placeholder }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
          aria-label="Search course resources"
          aria-expanded={Boolean(value.trim())}
          aria-controls="ls-results"
          autoComplete="off"
          spellCheck="false"
        />
      </div>
      <span className="ls-key" aria-hidden="true">ESC</span>
    </div>
  );
}

function SearchResultCard({ resource, selected, onSelect, onHover }) {
  const Icon = resource.type === 'SLIDES' ? Presentation : resource.type === 'PDF' ? BookOpen : FileText;
  return (
    <button
      type="button"
      className={`ls-row ${selected ? 'is-selected' : ''}`}
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      onClick={onSelect}
    >
      <span className={`ls-row-icon ls-type-${resource.type.toLowerCase()}`} aria-hidden="true"><Icon size={19} strokeWidth={1.65} /></span>
      <span className="ls-row-copy"><span className="ls-row-title">{resource.title}</span><span className="ls-row-path">{resource.path}</span></span>
      <span className="ls-course">{resource.course}</span>
      <ChevronRight className="ls-chevron" size={16} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );
}

function SearchResultsContainer({ results, selectedIndex, onHover, onSelect }) {
  return (
    <div className="ls-results" id="ls-results" role="listbox" aria-label="Sample resources">
      <div className="ls-section"><span>Matching resources</span><span>{results.length} shown</span></div>
      {results.length ? results.map((resource, index) => (
        <motion.div
          key={`${resource.course}-${resource.title}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, delay: Math.min(index * 0.035, 0.14) }}
        >
          <SearchResultCard
            resource={resource}
            selected={index === selectedIndex}
            onHover={() => onHover(index)}
            onSelect={() => onSelect(index)}
          />
        </motion.div>
      )) : (
        <div className="ls-empty"><strong>No sample resources found</strong><span>Try another title, course code, or remove a filter.</span></div>
      )}
    </div>
  );
}

export function AppleSpotlight({ isOpen = true, handleClose = () => {}, onExited = () => {} }) {
  const [hovered, setHovered] = useState(false);
  const [hoveredShortcut, setHoveredShortcut] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [scope, setScope] = useState('all');
  const [documents, setDocuments] = useState(false);
  const [recent, setRecent] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(null);
  const reducedMotion = useReducedMotion();
  const hasQuery = Boolean(searchValue.trim());

  const searchResults = useMemo(() => {
    if (!hasQuery) return [];
    return resources.filter((resource) =>
      matches(resource, searchValue) &&
      (scope === 'all' || resource.course === 'MATH 239') &&
      (!documents || ['PDF', 'DOC', 'NOTES'].includes(resource.type)) &&
      (!recent || resource.recent)
    );
  }, [documents, hasQuery, recent, scope, searchValue]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  function changeSearch(value) {
    setSearchValue(value);
    setSelectedIndex(0);
    setNotice('');
  }

  function selectFilter(filter) {
    if (filter === 'all' || filter === 'course') setScope(filter);
    if (filter === 'documents') setDocuments((current) => !current);
    if (filter === 'recent') setRecent((current) => !current);
    setSelectedIndex(0);
  }

  function selectResult(index) {
    if (!searchResults[index]) return;
    setNotice('Preview only — links come later');
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3200);
  }

  function handleInputKeyDown(event) {
    if (event.key === 'ArrowDown' && searchResults.length) {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % searchResults.length);
    }
    if (event.key === 'ArrowUp' && searchResults.length) {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + searchResults.length) % searchResults.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(selectedIndex);
    }
  }

  function handleDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    }
    if (event.key === 'Tab') {
      const focusables = [...event.currentTarget.querySelectorAll('input, .ls-chip, .ls-row')];
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
              className={`ls-panel ${hasQuery ? 'is-expanded' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label="Learn Spotlight search"
              transition={{ layout: motionTiming }}
            >
              <SpotlightInput value={searchValue} onChange={changeSearch} onKeyDown={handleInputKeyDown} placeholder={placeholder} />
              <AnimatePresence initial={false}>
                {hasQuery ? (
                  <motion.div
                    key="results"
                    className="ls-expanded-content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="ls-filters" role="group" aria-label="Search filters">
                      {shortcuts.map((shortcut) => {
                        const Icon = shortcut.icon;
                        const active = isFilterActive(shortcut.id, scope, documents, recent);
                        return <button key={shortcut.id} className="ls-chip" type="button" aria-pressed={active} onClick={() => selectFilter(shortcut.id)}><Icon size={13} strokeWidth={1.7} aria-hidden="true" />{shortcut.label}</button>;
                      })}
                    </div>
                    <SearchResultsContainer results={searchResults} selectedIndex={selectedIndex} onHover={setSelectedIndex} onSelect={selectResult} />
                    <div className="ls-footer"><span>Sample resources · LEARN not connected</span><span className="ls-hints"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Select</span></span><span className="ls-notice" role="status" aria-live="polite">{notice}</span></div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.section>
            <AnimatePresence>
              {hovered && !hasQuery ? (
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
