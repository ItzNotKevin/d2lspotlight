const groups = [
  { field: 'Computer science', course: 'CS246', documents: [
    ['cs-hierarchies', 'Class hierarchies', 'Course Notes / Object oriented programming'],
    ['cs-complexity', 'Asymptotic analysis', 'Course Notes / Algorithms'],
    ['cs-databases', 'Relational normal forms', 'Database design'],
    ['cs-a2', 'Assignment 2', 'Programming projects'],
    ['cs-a12', 'Assignment 12', 'Programming projects / Assignment 2 recap'],
    ['cs-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['class hierarchies', ['cs-hierarchies'], 'exact', 'calibration'],
    ['how running time grows with input size', ['cs-complexity'], 'paraphrase', 'calibration'],
    ['blockchain consensus protocol', [], 'unanswerable', 'calibration'],
    ['cs246 inheritance notes', ['cs-hierarchies'], 'paraphrase', 'test'],
    ['algorithm efficiency slides', ['cs-complexity'], 'paraphrase', 'test'],
    ['removing redundant data from database tables', ['cs-databases'], 'paraphrase', 'test'],
    ['cs246 a2', ['cs-a2'], 'identifier', 'test'],
    ['relational normal forms', ['cs-databases'], 'exact', 'test'],
    ['cs246 assn 12', ['cs-a12'], 'identifier', 'test'],
    ['compiler register allocation', [], 'unanswerable', 'test']
  ] },
  { field: 'Mathematics', course: 'MATH239', documents: [
    ['math-counting', 'Enumeration', 'Course Notes'],
    ['math-graphs', 'Paths, cycles and trees', 'Graph theory'],
    ['math-probability', 'Random variables and distributions', 'Probability'],
    ['math-algebra', 'Eigenvalues and eigenspaces', 'Linear algebra'],
    ['math-a2', 'Assignment 2', 'Weekly exercises'],
    ['math-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['eigenvalues and eigenspaces', ['math-algebra'], 'exact', 'calibration'],
    ['counting arrangements and selections', ['math-counting'], 'paraphrase', 'calibration'],
    ['complex contour integration', [], 'unanswerable', 'calibration'],
    ['combinatorics textbook', ['math-counting'], 'paraphrase', 'test'],
    ['combinatorics notes', ['math-counting'], 'paraphrase', 'test'],
    ['connected routes and loops in networks', ['math-graphs'], 'paraphrase', 'test'],
    ['probability slides', ['math-probability'], 'paraphrase', 'test'],
    ['math239 a2', ['math-a2'], 'identifier', 'test'],
    ['eigenvlaues', ['math-algebra'], 'typo', 'test'],
    ['Fourier series convergence proofs', [], 'unanswerable', 'test']
  ] },
  { field: 'Biology', course: 'BIO130', documents: [
    ['bio-genetics', 'Mendelian genetics', 'Course Notes / Heredity'],
    ['bio-cell', 'Cellular respiration', 'Cell biology'],
    ['bio-evolution', 'Natural selection', 'Evolution'],
    ['bio-ecology', 'Food webs and trophic levels', 'Ecology'],
    ['bio-lab', 'Microscopy practical', 'Laboratory methods', 'DOC'],
    ['bio-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['cellular respiration', ['bio-cell'], 'exact', 'calibration'],
    ['how parents pass traits to offspring', ['bio-genetics'], 'paraphrase', 'calibration'],
    ['human kidney dialysis procedure', [], 'unanswerable', 'calibration'],
    ['bio130 inheritance notes', ['bio-genetics'], 'paraphrase', 'test'],
    ['how cells release energy from glucose', ['bio-cell'], 'paraphrase', 'test'],
    ['organisms adapting over generations', ['bio-evolution'], 'paraphrase', 'test'],
    ['energy transfer through ecosystems', ['bio-ecology'], 'paraphrase', 'test'],
    ['looking at cells under a microscope', ['bio-lab'], 'paraphrase', 'test'],
    ['Mendelian genetics', ['bio-genetics'], 'exact', 'test'],
    ['brain surgery techniques', [], 'unanswerable', 'test']
  ] },
  { field: 'Chemistry', course: 'CHEM120', documents: [
    ['chem-acid', 'Acid-base equilibria', 'Course Notes / Aqueous reactions'],
    ['chem-orbitals', 'Atomic orbitals and electron configuration', 'Atomic structure', 'SLIDES'],
    ['chem-rates', 'Reaction kinetics', 'Rates of chemical reactions'],
    ['chem-organic', 'Functional groups', 'Organic chemistry'],
    ['chem-lab', 'Titration practical', 'Laboratory methods', 'DOC'],
    ['chem-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['functional groups', ['chem-organic'], 'exact', 'calibration'],
    ['why some reactions happen faster', ['chem-rates'], 'paraphrase', 'calibration'],
    ['nuclear reactor fuel enrichment', [], 'unanswerable', 'calibration'],
    ['pH and buffer calculations', ['chem-acid'], 'paraphrase', 'test'],
    ['where electrons sit in an atom', ['chem-orbitals'], 'paraphrase', 'test'],
    ['chemical reaction speed notes', ['chem-rates'], 'paraphrase', 'test'],
    ['recognizing alcohols and carboxylic acids', ['chem-organic'], 'paraphrase', 'test'],
    ['measuring concentration by neutralization', ['chem-lab'], 'paraphrase', 'test'],
    ['acid-base equilibria', ['chem-acid'], 'exact', 'test'],
    ['industrial petroleum refinery design', [], 'unanswerable', 'test']
  ] },
  { field: 'Physics', course: 'PHYS121', documents: [
    ['phys-motion', "Newton's laws", 'Mechanics / Motion'],
    ['phys-energy', 'Conservation of energy', 'Mechanics'],
    ['phys-fields', 'Electric fields and potential', 'Electromagnetism'],
    ['phys-waves', 'Interference and diffraction', 'Wave optics'],
    ['phys-heat', 'Entropy and heat engines', 'Thermodynamics'],
    ['phys-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['conservation of energy', ['phys-energy'], 'exact', 'calibration'],
    ['light waves spreading through an opening', ['phys-waves'], 'paraphrase', 'calibration'],
    ['general relativity spacetime curvature', [], 'unanswerable', 'calibration'],
    ['forces and acceleration notes', ['phys-motion'], 'paraphrase', 'test'],
    ['work and kinetic energy', ['phys-energy'], 'paraphrase', 'test'],
    ['voltage and charges', ['phys-fields'], 'paraphrase', 'test'],
    ['light waves overlapping', ['phys-waves'], 'paraphrase', 'test'],
    ['why heat cannot be fully converted into work', ['phys-heat'], 'paraphrase', 'test'],
    ['electric fields and potential', ['phys-fields'], 'exact', 'test'],
    ['quantum computing hardware', [], 'unanswerable', 'test']
  ] },
  { field: 'Humanities', course: 'ENGL210', documents: [
    ['hum-narrator', 'The unreliable narrator', 'Literary analysis'],
    ['hum-sources', 'Primary source criticism', 'Historical methods', 'PDF', 'HIST101'],
    ['hum-revolution', 'The French Revolution', 'Modern European history', 'PDF', 'HIST101'],
    ['hum-poetry', 'Metre and prosody', 'Poetry'],
    ['hum-ethics', 'Consequentialism and deontology', 'Moral philosophy', 'PDF', 'PHIL101'],
    ['hum-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['the French Revolution', ['hum-revolution'], 'exact', 'calibration'],
    ['evaluating an original historical document', ['hum-sources'], 'paraphrase', 'calibration'],
    ['ancient Egyptian hieroglyph translation', [], 'unanswerable', 'calibration'],
    ['stories told by someone you cannot trust', ['hum-narrator'], 'paraphrase', 'test'],
    ['checking bias in historical evidence', ['hum-sources'], 'paraphrase', 'test'],
    ['the fall of the French monarchy', ['hum-revolution'], 'paraphrase', 'test'],
    ['rhythm and stressed syllables in poems', ['hum-poetry'], 'paraphrase', 'test'],
    ['judging actions by consequences versus duties', ['hum-ethics'], 'paraphrase', 'test'],
    ['metre and prosody', ['hum-poetry'], 'exact', 'test'],
    ['medieval Japanese manuscript translation', [], 'unanswerable', 'test']
  ] },
  { field: 'Arts', course: 'ART100', documents: [
    ['art-colour', 'Colour relationships', 'Painting / Studio practice'],
    ['art-light', 'Chiaroscuro', 'Painting / Light and shadow'],
    ['art-music', 'Tonal harmony', 'Music theory', 'PDF', 'MUSIC101'],
    ['art-film', 'Montage and continuity editing', 'Film production', 'PDF', 'FILM101'],
    ['art-acting', 'Stanislavski and the actor', 'Theatre practice', 'PDF', 'THR100'],
    ['art-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['tonal harmony', ['art-music'], 'exact', 'calibration'],
    ['contrasting light and dark in painting', ['art-light'], 'paraphrase', 'calibration'],
    ['ceramic kiln firing schedules', [], 'unanswerable', 'calibration'],
    ['mixing pigments and complementary colours', ['art-colour'], 'paraphrase', 'test'],
    ['dramatic lighting in paintings', ['art-light'], 'paraphrase', 'test'],
    ['how chords resolve in music', ['art-music'], 'paraphrase', 'test'],
    ['cutting between shots to tell a story', ['art-film'], 'paraphrase', 'test'],
    ['building a believable character on stage', ['art-acting'], 'paraphrase', 'test'],
    ['colour relationships', ['art-colour'], 'exact', 'test'],
    ['metal casting sculpture techniques', [], 'unanswerable', 'test']
  ] },
  { field: 'Social sciences', course: 'SOC101', documents: [
    ['soc-inequality', 'Social stratification', 'Sociology / Inequality'],
    ['soc-conditioning', 'Operant conditioning', 'Learning psychology', 'PDF', 'PSYCH101'],
    ['soc-market', 'Supply and demand', 'Economics / Markets', 'PDF', 'ECON101'],
    ['soc-ethics', 'Informed consent and participant welfare', 'Research methods'],
    ['soc-democracy', 'Electoral systems', 'Political science', 'PDF', 'PSCI101'],
    ['soc-generic', 'Lecture notes', 'Course overview']
  ], queries: [
    ['electoral systems', ['soc-democracy'], 'exact', 'calibration'],
    ['ethical treatment of people in research', ['soc-ethics'], 'paraphrase', 'calibration'],
    ['international maritime law treaties', [], 'unanswerable', 'calibration'],
    ['how class divisions shape inequality', ['soc-inequality'], 'paraphrase', 'test'],
    ['learning through rewards and punishments', ['soc-conditioning'], 'paraphrase', 'test'],
    ['how prices change when goods become scarce', ['soc-market'], 'paraphrase', 'test'],
    ['protecting volunteers in a study', ['soc-ethics'], 'paraphrase', 'test'],
    ['how votes translate into seats', ['soc-democracy'], 'paraphrase', 'test'],
    ['social stratification', ['soc-inequality'], 'exact', 'test'],
    ['auditing corporate financial statements', [], 'unanswerable', 'test']
  ] }
];

export const benchmark = {
  version: 1,
  provenance: 'Synthetic academic metadata and relevance labels authored for initial screening; not real course evidence.',
  resources: groups.flatMap((group) => group.documents.map(([id, title, path, type = 'PDF', course = group.course]) => ({
    id, title, path, type, course: `${course}_instructor_term_section_2026`, courseId: course,
    source: id.endsWith('generic') ? 'Piazza' : 'LEARN', field: group.field
  }))),
  queries: groups.flatMap((group) => group.queries.map(([text, relevant, kind, split], i) => ({
    id: `${group.course}-${i}`, text, relevant, kind, split, field: group.field
  })))
};
