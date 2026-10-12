/** Maps file names to the language tag used on Markdown code fences and XML attributes. */

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', jsonc: 'jsonc', json5: 'json5',
  md: 'markdown', mdx: 'mdx', markdown: 'markdown', rst: 'rst', txt: 'text',
  py: 'python', pyi: 'python', ipynb: 'json',
  rb: 'ruby', erb: 'erb', rake: 'ruby',
  php: 'php', phtml: 'php',
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', groovy: 'groovy', gradle: 'groovy',
  cs: 'csharp', fs: 'fsharp', vb: 'vb',
  go: 'go', rs: 'rust', swift: 'swift', dart: 'dart', zig: 'zig', nim: 'nim',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  m: 'objectivec', mm: 'objectivec',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish', ps1: 'powershell', psm1: 'powershell',
  bat: 'bat', cmd: 'bat',
  sql: 'sql', prisma: 'prisma', graphql: 'graphql', gql: 'graphql', proto: 'protobuf',
  html: 'html', htm: 'html', vue: 'vue', svelte: 'svelte', astro: 'astro',
  css: 'css', scss: 'scss', sass: 'sass', less: 'less', styl: 'stylus',
  xml: 'xml', svg: 'xml', xsl: 'xml', xsd: 'xml', plist: 'xml',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'dotenv',
  lua: 'lua', r: 'r', jl: 'julia', pl: 'perl', pm: 'perl', tcl: 'tcl',
  ex: 'elixir', exs: 'elixir', erl: 'erlang', hrl: 'erlang', clj: 'clojure', cljs: 'clojure',
  hs: 'haskell', ml: 'ocaml', mli: 'ocaml', elm: 'elm', lisp: 'lisp', el: 'lisp', scm: 'scheme',
  tf: 'hcl', hcl: 'hcl', tfvars: 'hcl', nix: 'nix',
  sol: 'solidity', vy: 'python', wasm: 'wasm', wat: 'wasm',
  tex: 'latex', bib: 'bibtex', csv: 'csv', tsv: 'tsv', diff: 'diff', patch: 'diff',
  twig: 'twig', hbs: 'handlebars', ejs: 'ejs', pug: 'pug', liquid: 'liquid',
  cmake: 'cmake', mk: 'makefile', mak: 'makefile',
};

const BY_FILENAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  cmakelists: 'cmake',
  gemfile: 'ruby',
  rakefile: 'ruby',
  podfile: 'ruby',
  vagrantfile: 'ruby',
  jenkinsfile: 'groovy',
  procfile: 'yaml',
  '.gitignore': 'gitignore',
  '.dockerignore': 'gitignore',
  '.editorconfig': 'ini',
  '.env': 'dotenv',
};

export function languageFor(path: string): string {
  const name = (path.split('/').pop() ?? path).toLowerCase();
  if (name.endsWith('.blade.php')) return 'blade';
  if (name.endsWith('.d.ts')) return 'typescript';
  if (BY_FILENAME[name]) return BY_FILENAME[name];
  if (name.startsWith('dockerfile.')) return 'dockerfile';
  if (name.startsWith('.env.')) return 'dotenv';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return BY_EXTENSION[name.slice(dot + 1)] ?? '';
}
