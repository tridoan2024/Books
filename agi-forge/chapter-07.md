# Chapter 7: The Research CLI — Knowledge Engine

---

Every multi-agent system has a bottleneck that has nothing to do with compute, context windows, or model intelligence. It's knowledge. The Orchestrator can decompose tasks with surgical precision. The Planner can draft architectures that would make a staff engineer nod. The Coder can implement those architectures in clean, tested code. But none of them can do any of this well if they're operating on stale information, incomplete understanding, or — worst of all — confident hallucinations about how a library works, what an API returns, or whether a framework is still maintained.

The Research CLI exists to solve this. It is the team's eyes and ears — a specialized agent whose entire purpose is finding, verifying, analyzing, and storing knowledge that every other CLI in the system consumes. When the Orchestrator receives "Build a real-time collaborative editor," it doesn't ask the Coder to start implementing immediately. It dispatches the Research CLI first: "What are the current CRDT libraries for JavaScript? What are the tradeoffs between Yjs and Automerge? What does the WebSocket vs WebTransport landscape look like in 2026? What authentication patterns work best for collaborative apps?" The Research CLI answers these questions with sources, confidence scores, and structured data that flows into shared memory for every downstream CLI to read.

This chapter builds the Research CLI from scratch. You will implement four custom tools — `WebSearchTool`, `DocumentRAGTool`, `SourceAnalyzerTool`, and `APIExplorerTool` — using Claude Code's tool interface. You will design the memory schema that turns raw research into structured, queryable knowledge. You will see the full lifecycle of a research task, from the Orchestrator's initial dispatch through multi-source search, synthesis, and knowledge graph construction. And you will walk away with a complete `CLAUDE.md` template that turns a generic Claude Code instance into a dedicated research agent.

---

## 7.1 Why Research Needs Its Own CLI

You might ask why research can't just be a phase within the Orchestrator or the Planner. After all, Claude Code already has `WebSearchTool` and `WebFetchTool` built in. Any CLI can search the web and read documentation pages. Why dedicate an entire agent to research?

Three reasons. Each is independently sufficient.

### Context Budget Isolation

A serious research task consumes enormous amounts of context. Searching for "best authentication libraries for Node.js" sounds simple until you actually do it properly. You need to search multiple sources — npm registry, GitHub trending, recent blog posts, security advisories, the OWASP authentication cheat sheet. Each search returns results that need to be fetched, read, and analyzed. A single WebFetch of a documentation page can return 20,000–50,000 tokens of markdown. Comparing four libraries means reading four documentation sites, four GitHub READMEs, four sets of API references. You're looking at 100,000–200,000 tokens of raw material before you've even started synthesizing.

If that research happens inside the Orchestrator's context window, the Orchestrator loses its ability to do anything else. Its task decomposition logic, its inter-CLI communication state, its understanding of the overall project — all of it gets squeezed by research artifacts. The Orchestrator compacts, loses the specifics of what it researched, and is left with vague summaries that defeat the purpose of researching in the first place.

The Research CLI burns its own context window reading documentation, comparing APIs, and building understanding maps. When it finishes, it writes a structured summary to shared memory — maybe 2,000 tokens of distilled findings. The Orchestrator reads the summary. 2,000 tokens instead of 200,000. The Orchestrator's context stays clean. The Research CLI's context gets discarded after the task completes, ready for the next research assignment.

### Tool Specialization

Claude Code's built-in `WebSearchTool` is a general-purpose web search. It wraps Anthropic's server-side search capability, returns results with titles and URLs, and lets the model synthesize an answer. It works. But it's designed for ad hoc questions during a coding session, not for systematic research.

The Research CLI needs tools that go far beyond general web search:

- **Multi-source search with deduplication**: Search npm, PyPI, GitHub, Stack Overflow, and documentation sites simultaneously, then deduplicate results that appear across multiple sources.
- **Document RAG**: Ingest entire documentation sites, chunk them intelligently, embed the chunks, and retrieve relevant sections when answering follow-up questions — without re-fetching the entire site.
- **Source code analysis**: Clone a GitHub repository, parse its structure, identify key patterns, measure code quality signals, and build an understanding map that other CLIs can reference.
- **API exploration**: Given an OpenAPI spec URL, parse the spec, document available endpoints, identify authentication patterns, and generate usage examples.

None of these belong in the Orchestrator's or Coder's toolbox. They're research tools, and they need a research-specialized agent to wield them effectively.

### Memory Architecture Requirements

Research isn't just about finding answers — it's about building a knowledge base that improves over time. The Research CLI maintains a sophisticated memory layer:

- **Research cache with TTL**: If someone asked about Node.js auth libraries yesterday, don't repeat the entire search today. Serve the cached results unless they've expired.
- **Credibility scoring**: A result from the official Passport.js documentation scores higher than a random Medium blog post. A recently updated GitHub repository with 10,000 stars scores higher than an archived repo with 50 stars.
- **Topic maps**: Research results don't exist in isolation. "Node.js authentication" connects to "JWT libraries," which connects to "session management," which connects to "Redis session stores." The Research CLI builds and maintains these connections.
- **Cross-session accumulation**: The Research CLI remembers what it's researched before. Over multiple sessions, it builds a comprehensive knowledge graph that makes each subsequent research task faster and more accurate.

This memory architecture is too complex and too domain-specific to bolt onto a general-purpose CLI. It needs its own agent, its own schema, its own maintenance cycles.

---

## 7.2 Anatomy of a Research Tool — The `buildTool` Interface

Before we implement the Research CLI's four custom tools, you need to understand Claude Code's tool interface at the level that matters for building production tools. We covered the tool system's architecture in Chapter 2 and touched the source in Chapter 4. Now you're going to use it.

Every tool in Claude Code is built using the `buildTool` function from `Tool.ts`. Here's the contract, stripped to the fields that matter for custom tool development:

```typescript
import { buildTool, type ToolDef } from '../../Tool.js';
import { z } from 'zod/v4';
import { lazySchema } from '../../utils/lazySchema.js';

const MyTool = buildTool({
  // Identity
  name: 'my_tool_name',
  searchHint: 'what this tool does in one phrase',
  
  // Schema
  get inputSchema() { return myInputSchema(); },
  get outputSchema() { return myOutputSchema(); },
  
  // Display
  async description(input) { return `Doing X with ${input.target}`; },
  userFacingName() { return 'My Tool'; },
  getToolUseSummary(input) { return input.target; },
  getActivityDescription(input) { return `Processing ${input.target}`; },
  
  // Behavior flags
  isConcurrencySafe() { return true; },   // Can run parallel with other tools
  isReadOnly() { return true; },           // Doesn't modify filesystem
  shouldDefer: true,                        // Lazy-load until needed
  maxResultSizeChars: 100_000,             // Truncation threshold
  
  // Permission gate
  async checkPermissions(input, context) {
    return { behavior: 'allow', updatedInput: input };
  },
  
  // System prompt injection
  async prompt() {
    return 'Instructions for the model on how to use this tool';
  },
  
  // Input validation (runs before exec)
  async validateInput(input) {
    if (!input.target) {
      return { result: false, message: 'Missing target', errorCode: 1 };
    }
    return { result: true };
  },
  
  // The actual execution
  async call(input, context, canUseTool, parentMessage, onProgress) {
    // Do work here
    const result = await doExpensiveWork(input.target);
    return { data: result };
  },
  
  // Convert output to LLM-readable format
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formatForModel(output),
    };
  },
  
  // UI rendering (React/Ink components)
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, OutputSchema>);
```

There are several things to notice here:

**Lazy schemas with Zod.** Input and output types are defined using Zod schemas wrapped in `lazySchema()`. The lazy wrapper ensures schemas aren't evaluated until the tool is first used — critical for startup performance when you have dozens of tools registered. The Zod schemas serve double duty: they define the TypeScript types (via `z.infer`) and generate the JSON Schema that the LLM sees in its tool definitions.

**The `call` function is the core.** Everything else is metadata, permissions, and UI. The `call` function receives the validated input, a `ToolUseContext` that provides access to abort signals, app state, and model configuration, and an `onProgress` callback for streaming progress updates. It returns `{ data: T }` where `T` matches the output schema.

**`mapToolResultToToolResultBlockParam` controls what the model sees.** The raw output object may contain rich structured data, but what gets injected into the conversation as a tool result is whatever this function returns. This is your chance to format the output for maximum LLM comprehension — summarize, highlight key findings, strip noise.

**Concurrency safety matters.** Tools that set `isConcurrencySafe()` to `true` can execute in parallel with other concurrent-safe tools. The Research CLI's tools are all read-only and stateless per invocation, so they're all concurrency-safe. This means the Research CLI can fire off a web search, a document fetch, and an API exploration simultaneously.

**The permission system is your security boundary.** For the Research CLI, we'll implement permissive but auditable permissions — the Research CLI should be able to search and fetch without human approval (it's read-only), but every action is logged for traceability.

---

## 7.3 WebSearchTool — Multi-Source Search with Credibility Scoring

The first and most important custom tool. Claude Code's built-in `WebSearchTool` is a single-source search — it calls Anthropic's server-side web search API and returns results. The Research CLI's `WebSearchTool` wraps *multiple* search sources, deduplicates results, and assigns credibility scores based on source authority, freshness, and relevance.

### The Architecture

```
User query: "best Node.js authentication libraries 2026"
                    │
                    ▼
        ┌───────────────────────┐
        │   WebSearchTool       │
        │   (Research CLI)      │
        └───────┬───────────────┘
                │
        ┌───────┼───────────────┬─────────────────┐
        ▼       ▼               ▼                 ▼
   ┌────────┐ ┌──────────┐ ┌──────────┐  ┌──────────┐
   │ Web    │ │ npm      │ │ GitHub   │  │ Stack    │
   │ Search │ │ Registry │ │ Search   │  │ Overflow │
   └────┬───┘ └────┬─────┘ └────┬─────┘  └────┬─────┘
        │          │             │              │
        ▼          ▼             ▼              ▼
   ┌──────────────────────────────────────────────┐
   │          Result Deduplication                 │
   │   (URL normalization, content fingerprinting) │
   └────────────────────┬─────────────────────────┘
                        │
                        ▼
   ┌──────────────────────────────────────────────┐
   │          Credibility Scoring                  │
   │  (source authority × freshness × relevance)   │
   └────────────────────┬─────────────────────────┘
                        │
                        ▼
   ┌──────────────────────────────────────────────┐
   │          Structured Output                    │
   │  (ranked results with scores and metadata)    │
   └──────────────────────────────────────────────┘
```

### Full Implementation

```typescript
// tools/ResearchWebSearch/ResearchWebSearchTool.ts

import { z } from 'zod/v4';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { queryModelWithStreaming } from '../../services/api/claude.js';
import { createUserMessage } from '../../utils/messages.js';
import { asSystemPrompt } from '../../utils/systemPromptType.js';
import { logError } from '../../utils/log.js';

// --- Source Configuration ---

interface SearchSource {
  name: string;
  type: 'web' | 'registry' | 'repository' | 'forum';
  baseUrl: string;
  authorityScore: number; // 0.0 - 1.0, base credibility
  searchFn: (query: string, signal: AbortSignal) => Promise<RawSearchResult[]>;
}

interface RawSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate?: string;
  metadata?: Record<string, unknown>;
}

interface ScoredResult extends RawSearchResult {
  credibilityScore: number;
  freshnessScore: number;
  relevanceScore: number;
  compositeScore: number;
  deduplicatedFrom?: string[]; // URLs of duplicate results merged into this one
}

// --- Credibility Engine ---

class CredibilityEngine {
  private domainAuthority: Map<string, number> = new Map([
    // Official documentation sites
    ['nodejs.org', 0.95],
    ['developer.mozilla.org', 0.95],
    ['docs.python.org', 0.95],
    ['typescriptlang.org', 0.90],
    ['react.dev', 0.90],
    
    // Package registries
    ['npmjs.com', 0.85],
    ['pypi.org', 0.85],
    ['crates.io', 0.85],
    
    // Authoritative sources
    ['github.com', 0.80],
    ['stackoverflow.com', 0.75],
    ['arxiv.org', 0.90],
    ['owasp.org', 0.90],
    
    // High-quality blogs
    ['blog.cloudflare.com', 0.80],
    ['engineering.fb.com', 0.80],
    ['netflixtechblog.com', 0.78],
    
    // General content (lower default)
    ['medium.com', 0.45],
    ['dev.to', 0.50],
    ['hashnode.dev', 0.45],
  ]);

  scoreResult(result: RawSearchResult, query: string): ScoredResult {
    const credibility = this.calculateCredibility(result);
    const freshness = this.calculateFreshness(result);
    const relevance = this.calculateRelevance(result, query);
    
    // Weighted composite: credibility matters most for research
    const composite = (
      credibility * 0.40 +
      freshness  * 0.25 +
      relevance  * 0.35
    );

    return {
      ...result,
      credibilityScore: Math.round(credibility * 100) / 100,
      freshnessScore: Math.round(freshness * 100) / 100,
      relevanceScore: Math.round(relevance * 100) / 100,
      compositeScore: Math.round(composite * 100) / 100,
    };
  }

  private calculateCredibility(result: RawSearchResult): number {
    try {
      const hostname = new URL(result.url).hostname.replace('www.', '');
      
      // Check exact domain match
      if (this.domainAuthority.has(hostname)) {
        return this.domainAuthority.get(hostname)!;
      }
      
      // Check parent domain (e.g., 'docs.aws.amazon.com' → 'amazon.com')
      const parts = hostname.split('.');
      if (parts.length > 2) {
        const parentDomain = parts.slice(-2).join('.');
        if (this.domainAuthority.has(parentDomain)) {
          return this.domainAuthority.get(parentDomain)! * 0.95;
        }
      }
      
      // Default: unknown domains get a moderate score
      return 0.50;
    } catch {
      return 0.30;
    }
  }

  private calculateFreshness(result: RawSearchResult): number {
    if (!result.publishedDate) return 0.50; // No date = neutral
    
    const published = new Date(result.publishedDate);
    const now = new Date();
    const daysOld = (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysOld < 30)  return 1.00;  // Less than a month: peak freshness
    if (daysOld < 90)  return 0.90;  // Less than 3 months
    if (daysOld < 180) return 0.75;  // Less than 6 months
    if (daysOld < 365) return 0.60;  // Less than a year
    if (daysOld < 730) return 0.40;  // Less than 2 years
    return 0.20;                      // Older than 2 years
  }

  private calculateRelevance(result: RawSearchResult, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const titleLower = result.title.toLowerCase();
    const snippetLower = (result.snippet || '').toLowerCase();
    
    let matchCount = 0;
    for (const term of queryTerms) {
      if (titleLower.includes(term)) matchCount += 2;  // Title match = 2x weight
      if (snippetLower.includes(term)) matchCount += 1;
    }
    
    const maxPossible = queryTerms.length * 3; // 2 (title) + 1 (snippet) per term
    return maxPossible > 0 ? Math.min(matchCount / maxPossible, 1.0) : 0.50;
  }
}

// --- Deduplication Engine ---

class DeduplicationEngine {
  deduplicate(results: ScoredResult[]): ScoredResult[] {
    const seen = new Map<string, ScoredResult>();
    
    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.url);
      const existing = seen.get(normalizedUrl);
      
      if (existing) {
        // Keep the higher-scored version, note the duplicate
        if (result.compositeScore > existing.compositeScore) {
          result.deduplicatedFrom = [
            ...(existing.deduplicatedFrom || []),
            existing.url,
          ];
          seen.set(normalizedUrl, result);
        } else {
          existing.deduplicatedFrom = [
            ...(existing.deduplicatedFrom || []),
            result.url,
          ];
        }
      } else {
        seen.set(normalizedUrl, result);
      }
    }
    
    return Array.from(seen.values())
      .sort((a, b) => b.compositeScore - a.compositeScore);
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slashes, fragments, common tracking params
      parsed.hash = '';
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      parsed.searchParams.delete('ref');
      let normalized = parsed.toString();
      while (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }
}

// --- Search Source Implementations ---

async function searchWeb(
  query: string, 
  signal: AbortSignal,
  context: { queryModelWithStreaming: typeof queryModelWithStreaming }
): Promise<RawSearchResult[]> {
  // Wraps Claude's built-in web search via a sub-query
  const userMessage = createUserMessage({
    content: `Search the web for: ${query}\n\nReturn results as JSON array with title, url, snippet fields.`,
  });

  const results: RawSearchResult[] = [];
  const stream = context.queryModelWithStreaming({
    messages: [userMessage],
    systemPrompt: asSystemPrompt([
      'You are a search assistant. Return structured search results.',
    ]),
    tools: [],
    signal,
    options: {
      extraToolSchemas: [{
        type: 'web_search_20250305' as const,
        name: 'web_search',
        max_uses: 5,
      }],
      querySource: 'web_search_tool',
    },
  });

  for await (const event of stream) {
    if (event.type === 'assistant') {
      for (const block of event.message.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const hit of block.content) {
            results.push({
              title: hit.title,
              url: hit.url,
              snippet: hit.encrypted_content || '',
              source: 'web_search',
            });
          }
        }
      }
    }
  }
  return results;
}

async function searchNpm(
  query: string, 
  signal: AbortSignal
): Promise<RawSearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(
    `https://registry.npmjs.org/-/v1/search?text=${encodedQuery}&size=10`,
    { signal }
  );
  
  if (!response.ok) return [];
  
  const data = await response.json();
  return (data.objects || []).map((obj: any) => ({
    title: `${obj.package.name} — ${obj.package.description || 'No description'}`,
    url: `https://www.npmjs.com/package/${obj.package.name}`,
    snippet: [
      `v${obj.package.version}`,
      obj.package.keywords?.slice(0, 5).join(', '),
      `Score: ${Math.round((obj.score?.final || 0) * 100)}%`,
    ].filter(Boolean).join(' | '),
    source: 'npm_registry',
    publishedDate: obj.package.date,
    metadata: {
      downloads: obj.downloads?.weekly,
      score: obj.score?.final,
      version: obj.package.version,
      maintainers: obj.package.maintainers?.length,
    },
  }));
}

async function searchGitHub(
  query: string, 
  signal: AbortSignal
): Promise<RawSearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(
    `https://api.github.com/search/repositories?q=${encodedQuery}&sort=stars&per_page=10`,
    { 
      signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ResearchCLI/1.0',
      },
    }
  );
  
  if (!response.ok) return [];
  
  const data = await response.json();
  return (data.items || []).map((repo: any) => ({
    title: `${repo.full_name} — ${repo.description || 'No description'}`,
    url: repo.html_url,
    snippet: [
      `★ ${repo.stargazers_count.toLocaleString()}`,
      `Forks: ${repo.forks_count}`,
      `Language: ${repo.language || 'N/A'}`,
      repo.archived ? '⚠ ARCHIVED' : '',
      `Updated: ${new Date(repo.updated_at).toLocaleDateString()}`,
    ].filter(Boolean).join(' | '),
    source: 'github',
    publishedDate: repo.pushed_at,
    metadata: {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      archived: repo.archived,
      license: repo.license?.spdx_id,
      openIssues: repo.open_issues_count,
    },
  }));
}

// --- Input/Output Schemas ---

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(3).describe(
      'The research query. Be specific — "Node.js JWT authentication libraries 2026" is better than "auth libraries"'
    ),
    sources: z.array(z.enum(['web', 'npm', 'github', 'stackoverflow']))
      .optional()
      .default(['web', 'npm', 'github'])
      .describe('Which sources to search. Defaults to all.'),
    maxResults: z.number().min(5).max(50).optional().default(20)
      .describe('Maximum results to return after deduplication'),
    minCredibility: z.number().min(0).max(1).optional().default(0.3)
      .describe('Minimum credibility score to include a result'),
  })
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string(),
    totalRawResults: z.number(),
    totalAfterDedup: z.number(),
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      source: z.string(),
      compositeScore: z.number(),
      credibilityScore: z.number(),
      freshnessScore: z.number(),
      relevanceScore: z.number(),
    })),
    sourceCoverage: z.record(z.number()),
    durationMs: z.number(),
  })
);
type OutputSchema = ReturnType<typeof outputSchema>;

// --- The Tool ---

export const ResearchWebSearchTool = buildTool({
  name: 'research_web_search',
  searchHint: 'search multiple sources with credibility scoring',
  maxResultSizeChars: 100_000,
  shouldDefer: false, // Research tools load eagerly — they're the CLI's core purpose
  
  async description(input) {
    const sources = input.sources?.join(', ') || 'all sources';
    return `Research CLI searching ${sources} for: ${input.query}`;
  },
  
  userFacingName() { return 'Research Search'; },
  
  getToolUseSummary(input) { return input.query; },
  
  getActivityDescription(input) {
    return `Researching: ${input.query}`;
  },
  
  isEnabled() { return true; }, // Always enabled in the Research CLI
  
  get inputSchema(): InputSchema { return inputSchema(); },
  get outputSchema(): OutputSchema { return outputSchema(); },
  
  isConcurrencySafe() { return true; },
  isReadOnly() { return true; },
  
  async checkPermissions() {
    // Research CLI operates in auto-allow mode for all read operations
    return { behavior: 'allow' as const, updatedInput: undefined };
  },
  
  async prompt() {
    return `Use research_web_search for comprehensive multi-source research.
This tool searches web, npm registry, GitHub, and Stack Overflow simultaneously,
deduplicates results, and scores them by credibility, freshness, and relevance.

WHEN TO USE:
- Evaluating libraries or frameworks
- Researching current best practices
- Finding authoritative documentation
- Comparing tools or approaches

TIPS:
- Be specific in your query. "Node.js JWT library with RS256 support" > "auth library"
- Use the sources parameter to focus: sources: ["npm", "github"] for package evaluation
- Set minCredibility: 0.6 to filter out low-authority sources for critical decisions
- Results are pre-sorted by composite score (credibility × freshness × relevance)`;
  },
  
  async validateInput(input) {
    if (input.query.length < 3) {
      return { result: false, message: 'Query too short. Be specific.', errorCode: 1 };
    }
    return { result: true };
  },
  
  async call(input, context, _canUseTool, _parentMessage, onProgress) {
    const startTime = performance.now();
    const { query, sources = ['web', 'npm', 'github'], maxResults = 20, minCredibility = 0.3 } = input;
    const signal = context.abortController.signal;
    
    const credibilityEngine = new CredibilityEngine();
    const deduplicationEngine = new DeduplicationEngine();
    
    // Fire all source searches in parallel
    const searchPromises: Promise<RawSearchResult[]>[] = [];
    
    if (sources.includes('web')) {
      searchPromises.push(
        searchWeb(query, signal, { queryModelWithStreaming })
          .catch(err => { logError(err); return []; })
      );
    }
    if (sources.includes('npm')) {
      searchPromises.push(
        searchNpm(query, signal)
          .catch(err => { logError(err); return []; })
      );
    }
    if (sources.includes('github')) {
      searchPromises.push(
        searchGitHub(query, signal)
          .catch(err => { logError(err); return []; })
      );
    }
    
    // Report progress as each source completes
    let completedSources = 0;
    const allRawResults: RawSearchResult[] = [];
    
    const settledPromises = await Promise.allSettled(searchPromises);
    for (const settled of settledPromises) {
      completedSources++;
      if (settled.status === 'fulfilled') {
        allRawResults.push(...settled.value);
      }
      if (onProgress) {
        onProgress({
          toolUseID: `search-${completedSources}`,
          data: {
            type: 'source_complete',
            completed: completedSources,
            total: searchPromises.length,
            resultsSoFar: allRawResults.length,
          },
        });
      }
    }
    
    // Score all results
    const scoredResults = allRawResults
      .map(r => credibilityEngine.scoreResult(r, query))
      .filter(r => r.compositeScore >= minCredibility);
    
    // Deduplicate and rank
    const deduped = deduplicationEngine.deduplicate(scoredResults);
    const topResults = deduped.slice(0, maxResults);
    
    // Source coverage statistics
    const sourceCoverage: Record<string, number> = {};
    for (const r of topResults) {
      sourceCoverage[r.source] = (sourceCoverage[r.source] || 0) + 1;
    }
    
    const durationMs = performance.now() - startTime;
    
    return {
      data: {
        query,
        totalRawResults: allRawResults.length,
        totalAfterDedup: deduped.length,
        results: topResults.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source,
          compositeScore: r.compositeScore,
          credibilityScore: r.credibilityScore,
          freshnessScore: r.freshnessScore,
          relevanceScore: r.relevanceScore,
        })),
        sourceCoverage,
        durationMs: Math.round(durationMs),
      },
    };
  },
  
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let formatted = `## Research Results for: "${output.query}"\n\n`;
    formatted += `**Sources searched:** ${Object.keys(output.sourceCoverage).join(', ')}\n`;
    formatted += `**Raw results:** ${output.totalRawResults} → **After dedup:** ${output.totalAfterDedup}\n`;
    formatted += `**Time:** ${output.durationMs}ms\n\n`;
    formatted += `### Top Results (by composite score)\n\n`;
    
    for (const [i, result] of output.results.entries()) {
      formatted += `**${i + 1}. ${result.title}**\n`;
      formatted += `   URL: ${result.url}\n`;
      formatted += `   Score: ${result.compositeScore} `;
      formatted += `(credibility: ${result.credibilityScore}, `;
      formatted += `freshness: ${result.freshnessScore}, `;
      formatted += `relevance: ${result.relevanceScore})\n`;
      formatted += `   Source: ${result.source}\n`;
      if (result.snippet) {
        formatted += `   ${result.snippet}\n`;
      }
      formatted += '\n';
    }
    
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formatted.trim(),
    };
  },
  
  renderToolUseMessage: () => null,
  renderToolUseProgressMessage: () => null,
  renderToolResultMessage: () => null,
});
```

Let's break down what this implementation does that Claude Code's built-in `WebSearchTool` does not.

**Parallel multi-source search.** The built-in tool calls one search API. Ours fires web search, npm registry, and GitHub search simultaneously using `Promise.allSettled`. Each source failure is isolated — if GitHub's API rate-limits you, npm and web results still come back. The `allSettled` pattern ensures one source failure never blocks the others.

**Credibility scoring with domain authority.** The `CredibilityEngine` maintains a map of known domains and their authority scores. Official documentation sites (`nodejs.org`, `react.dev`, `owasp.org`) score near 1.0. Package registries score 0.85. General content platforms like Medium score 0.45. The composite score weights credibility at 40%, relevance at 35%, and freshness at 25% — because for research, *trustworthiness* matters more than recency or keyword matching.

**URL-normalized deduplication.** The same content often appears across multiple sources — a popular npm package will show up in web search results, npm registry search, and GitHub search. The `DeduplicationEngine` normalizes URLs (stripping tracking parameters, fragments, and trailing slashes), merges duplicates, keeps the highest-scored version, and notes which sources corroborated the result. A result that appears in three sources is implicitly more trustworthy.

**Structured output for downstream consumption.** The output isn't just text for the model to read. It's structured data with typed fields that the Research CLI's synthesis layer can process programmatically. The `mapToolResultToToolResultBlockParam` function formats this for the LLM, but the raw `data` object is also available for direct consumption by other tools and the memory layer.

---

## 7.4 DocumentRAGTool — Building the Knowledge Retrieval Pipeline

Web search finds the door. RAG opens it and walks through.

The Research CLI's second tool handles the full document ingestion pipeline: fetch a document (or set of documents), split it into semantically meaningful chunks, generate embeddings for each chunk, store everything in a local vector database, and retrieve the most relevant chunks when answering questions. This is how the Research CLI reads an entire documentation site and then answers specific questions about it without re-fetching anything.

### The RAG Pipeline

```
Document URL or local path
        │
        ▼
┌─────────────────┐
│  1. Ingestion    │  Fetch content, detect format (HTML, MD, PDF, code)
│     & Parsing    │  Extract clean text, preserve structure markers
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. Chunking     │  Semantic splitting at section boundaries
│                  │  Overlap windows for context preservation
│                  │  Metadata tagging (source, section, position)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. Embedding    │  Generate vector embeddings per chunk
│                  │  Using local model (e5-small) or API
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. Storage      │  SQLite + vector extension for persistence
│                  │  Full-text index for keyword fallback
│                  │  Metadata index for filtered retrieval
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. Retrieval    │  Hybrid search: semantic similarity + BM25 keyword
│                  │  Re-ranking with cross-encoder
│                  │  Context assembly with source attribution
└─────────────────┘
```

### Implementation

```typescript
// tools/DocumentRAG/DocumentRAGTool.ts

import { z } from 'zod/v4';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import path from 'path';

// --- Chunking Engine ---

interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    sourceUrl: string;
    sectionTitle: string;
    position: number;      // Chunk position within document
    totalChunks: number;
    charOffset: number;    // Character offset in original document
    headingPath: string[]; // e.g., ['Getting Started', 'Installation', 'npm']
  };
  embedding?: number[];
}

class SemanticChunker {
  private maxChunkSize: number;
  private overlapSize: number;

  constructor(maxChunkSize = 1500, overlapSize = 200) {
    this.maxChunkSize = maxChunkSize;
    this.overlapSize = overlapSize;
  }

  chunk(content: string, sourceUrl: string): DocumentChunk[] {
    const sections = this.splitBySections(content);
    const chunks: DocumentChunk[] = [];
    let position = 0;
    let charOffset = 0;

    for (const section of sections) {
      const sectionChunks = this.splitSection(section.content);

      for (const chunkContent of sectionChunks) {
        const id = createHash('sha256')
          .update(`${sourceUrl}:${charOffset}:${chunkContent.slice(0, 100)}`)
          .digest('hex')
          .slice(0, 16);

        chunks.push({
          id,
          content: chunkContent,
          metadata: {
            sourceUrl,
            sectionTitle: section.title,
            position,
            totalChunks: 0, // Set after all chunks are created
            charOffset,
            headingPath: section.headingPath,
          },
        });

        position++;
        charOffset += chunkContent.length;
      }
    }

    // Backfill totalChunks
    for (const chunk of chunks) {
      chunk.metadata.totalChunks = chunks.length;
    }

    return chunks;
  }

  private splitBySections(content: string): Array<{
    title: string;
    content: string;
    headingPath: string[];
  }> {
    const lines = content.split('\n');
    const sections: Array<{
      title: string;
      content: string;
      headingPath: string[];
    }> = [];

    let currentTitle = 'Introduction';
    let currentContent = '';
    let headingStack: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+)/);

      if (headingMatch) {
        // Save previous section
        if (currentContent.trim()) {
          sections.push({
            title: currentTitle,
            content: currentContent.trim(),
            headingPath: [...headingStack],
          });
        }

        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        // Update heading stack
        headingStack = headingStack.slice(0, level - 1);
        headingStack.push(title);

        currentTitle = title;
        currentContent = '';
      } else {
        currentContent += line + '\n';
      }
    }

    // Don't forget the last section
    if (currentContent.trim()) {
      sections.push({
        title: currentTitle,
        content: currentContent.trim(),
        headingPath: [...headingStack],
      });
    }

    return sections;
  }

  private splitSection(content: string): string[] {
    if (content.length <= this.maxChunkSize) {
      return [content];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      let end = start + this.maxChunkSize;

      if (end < content.length) {
        // Try to break at a paragraph boundary
        const paragraphBreak = content.lastIndexOf('\n\n', end);
        if (paragraphBreak > start + this.maxChunkSize * 0.5) {
          end = paragraphBreak;
        } else {
          // Fall back to sentence boundary
          const sentenceBreak = content.lastIndexOf('. ', end);
          if (sentenceBreak > start + this.maxChunkSize * 0.5) {
            end = sentenceBreak + 1;
          }
        }
      } else {
        end = content.length;
      }

      chunks.push(content.slice(start, end).trim());
      start = end - this.overlapSize; // Overlap for context continuity
    }

    return chunks.filter(c => c.length > 0);
  }
}

// --- Vector Store (SQLite-backed) ---

class ResearchVectorStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        content_hash TEXT NOT NULL,
        ingested_at TEXT DEFAULT (datetime('now')),
        chunk_count INTEGER DEFAULT 0,
        ttl_hours INTEGER DEFAULT 168  -- 7 days default
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        section_title TEXT,
        position INTEGER,
        heading_path TEXT,  -- JSON array
        char_offset INTEGER,
        embedding BLOB,     -- Serialized float32 array
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_documents_url ON documents(url);

      -- Full-text search index for keyword fallback
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content, section_title, heading_path,
        content='chunks',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, content, section_title, heading_path)
        VALUES (new.rowid, new.content, new.section_title, new.heading_path);
      END;

      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content, section_title, heading_path)
        VALUES ('delete', old.rowid, old.content, old.section_title, old.heading_path);
      END;
    `);
  }

  storeDocument(url: string, title: string, contentHash: string, chunks: DocumentChunk[]) {
    const docId = createHash('sha256').update(url).digest('hex').slice(0, 16);

    const insertDoc = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, url, title, content_hash, chunk_count)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, document_id, content, section_title, position, heading_path, char_offset, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      // Clear old chunks for this document
      this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(docId);

      insertDoc.run(docId, url, title, contentHash, chunks.length);

      for (const chunk of chunks) {
        insertChunk.run(
          chunk.id,
          docId,
          chunk.content,
          chunk.metadata.sectionTitle,
          chunk.metadata.position,
          JSON.stringify(chunk.metadata.headingPath),
          chunk.metadata.charOffset,
          chunk.embedding ? Buffer.from(new Float32Array(chunk.embedding).buffer) : null
        );
      }
    });

    transaction();
    return docId;
  }

  searchByKeyword(query: string, limit = 10): Array<{
    content: string;
    sectionTitle: string;
    headingPath: string[];
    score: number;
    documentUrl: string;
  }> {
    const results = this.db.prepare(`
      SELECT c.content, c.section_title, c.heading_path, d.url,
             rank AS score
      FROM chunks_fts
      JOIN chunks c ON c.rowid = chunks_fts.rowid
      JOIN documents d ON c.document_id = d.id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit);

    return results.map((r: any) => ({
      content: r.content,
      sectionTitle: r.section_title,
      headingPath: JSON.parse(r.heading_path || '[]'),
      score: Math.abs(r.score), // FTS5 rank is negative
      documentUrl: r.url,
    }));
  }

  isDocumentCurrent(url: string, contentHash: string): boolean {
    const doc = this.db.prepare(
      'SELECT content_hash, ingested_at, ttl_hours FROM documents WHERE url = ?'
    ).get(url) as any;

    if (!doc) return false;
    if (doc.content_hash !== contentHash) return false;

    // Check TTL
    const ingestedAt = new Date(doc.ingested_at);
    const expiresAt = new Date(ingestedAt.getTime() + doc.ttl_hours * 3600000);
    return new Date() < expiresAt;
  }

  close() {
    this.db.close();
  }
}

// --- Schema ---

const ragInputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['ingest', 'query']).describe(
      'ingest: fetch and index a document. query: search indexed documents.'
    ),
    url: z.string().optional().describe('URL to ingest (required for ingest action)'),
    query: z.string().optional().describe('Search query (required for query action)'),
    maxChunks: z.number().optional().default(5).describe(
      'Maximum chunks to return for a query'
    ),
    forceRefresh: z.boolean().optional().default(false).describe(
      'Force re-ingestion even if document is cached and current'
    ),
  })
);

const ragOutputSchema = lazySchema(() =>
  z.object({
    action: z.string(),
    success: z.boolean(),
    message: z.string(),
    results: z.array(z.object({
      content: z.string(),
      sectionTitle: z.string(),
      headingPath: z.array(z.string()),
      relevanceScore: z.number(),
      sourceUrl: z.string(),
    })).optional(),
    documentStats: z.object({
      url: z.string(),
      chunks: z.number(),
      contentLength: z.number(),
    }).optional(),
    durationMs: z.number(),
  })
);

// --- The Tool ---

export const DocumentRAGTool = buildTool({
  name: 'document_rag',
  searchHint: 'ingest documents and retrieve relevant chunks via RAG',
  maxResultSizeChars: 100_000,
  shouldDefer: false,

  async description(input) {
    if (input.action === 'ingest') {
      return `Ingesting document: ${input.url}`;
    }
    return `RAG query: ${input.query}`;
  },

  userFacingName() { return 'Document RAG'; },
  getToolUseSummary(input) { return input.query || input.url || 'RAG operation'; },
  getActivityDescription(input) {
    return input.action === 'ingest'
      ? `Ingesting ${input.url}`
      : `Searching knowledge base for: ${input.query}`;
  },

  isEnabled() { return true; },
  get inputSchema() { return ragInputSchema(); },
  get outputSchema() { return ragOutputSchema(); },
  isConcurrencySafe() { return true; },
  isReadOnly() { return true; },

  async checkPermissions() {
    return { behavior: 'allow' as const, updatedInput: undefined };
  },

  async prompt() {
    return `Use document_rag to build and query a local knowledge base.

TWO MODES:
1. INGEST: Fetch a URL, chunk it, index it for later retrieval
   - Use before querying: ingest the docs first, then ask questions
   - Documents are cached with TTL — re-ingestion is skipped if current
   - Example: { action: "ingest", url: "https://passportjs.org/docs" }

2. QUERY: Search ingested documents using hybrid keyword + semantic search
   - Returns the most relevant chunks with section context and source attribution
   - Example: { action: "query", query: "how to configure OAuth2 strategy" }

WORKFLOW: Always ingest relevant documentation BEFORE querying.
Multiple documents can be ingested — queries search across all of them.`;
  },

  async validateInput(input) {
    if (input.action === 'ingest' && !input.url) {
      return { result: false, message: 'URL required for ingest action', errorCode: 1 };
    }
    if (input.action === 'query' && !input.query) {
      return { result: false, message: 'Query required for query action', errorCode: 2 };
    }
    return { result: true };
  },

  async call(input, context) {
    const startTime = performance.now();
    const dataDir = path.join(process.cwd(), '.research-cli', 'rag');
    
    // Ensure data directory exists
    const { mkdirSync } = await import('fs');
    mkdirSync(dataDir, { recursive: true });
    
    const store = new ResearchVectorStore(path.join(dataDir, 'knowledge.db'));
    
    try {
      if (input.action === 'ingest') {
        return await handleIngest(input, store, context, startTime);
      } else {
        return await handleQuery(input, store, startTime);
      }
    } finally {
      store.close();
    }
  },

  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let formatted = '';

    if (output.action === 'ingest') {
      formatted = `## Document Ingested\n`;
      formatted += `${output.message}\n`;
      if (output.documentStats) {
        formatted += `- URL: ${output.documentStats.url}\n`;
        formatted += `- Chunks: ${output.documentStats.chunks}\n`;
        formatted += `- Content length: ${output.documentStats.contentLength.toLocaleString()} chars\n`;
      }
    } else {
      formatted = `## RAG Query Results\n\n`;
      if (output.results && output.results.length > 0) {
        for (const [i, r] of output.results.entries()) {
          formatted += `### Result ${i + 1}: ${r.sectionTitle}\n`;
          formatted += `*Source: ${r.sourceUrl} | Path: ${r.headingPath.join(' > ')}*\n`;
          formatted += `*Relevance: ${r.relevanceScore}*\n\n`;
          formatted += `${r.content}\n\n---\n\n`;
        }
      } else {
        formatted += `No relevant results found. Try ingesting more documents first.\n`;
      }
    }

    formatted += `\n*${output.durationMs}ms*`;

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formatted.trim(),
    };
  },

  renderToolUseMessage: () => null,
  renderToolUseProgressMessage: () => null,
  renderToolResultMessage: () => null,
});

async function handleIngest(
  input: any, 
  store: ResearchVectorStore, 
  context: any, 
  startTime: number
) {
  const { url, forceRefresh } = input;
  
  // Fetch the document
  const response = await fetch(url, {
    signal: context.abortController.signal,
    headers: { 'User-Agent': 'ResearchCLI/1.0' },
  });

  if (!response.ok) {
    return {
      data: {
        action: 'ingest',
        success: false,
        message: `Failed to fetch: ${response.status} ${response.statusText}`,
        durationMs: Math.round(performance.now() - startTime),
      },
    };
  }

  const content = await response.text();
  const contentHash = createHash('sha256').update(content).digest('hex');

  // Check if already current
  if (!forceRefresh && store.isDocumentCurrent(url, contentHash)) {
    return {
      data: {
        action: 'ingest',
        success: true,
        message: 'Document already cached and current. Skipping re-ingestion.',
        durationMs: Math.round(performance.now() - startTime),
      },
    };
  }

  // Chunk the document
  const chunker = new SemanticChunker();
  const chunks = chunker.chunk(content, url);

  // Store
  store.storeDocument(url, url, contentHash, chunks);

  return {
    data: {
      action: 'ingest',
      success: true,
      message: `Ingested ${chunks.length} chunks from ${url}`,
      documentStats: {
        url,
        chunks: chunks.length,
        contentLength: content.length,
      },
      durationMs: Math.round(performance.now() - startTime),
    },
  };
}

async function handleQuery(input: any, store: ResearchVectorStore, startTime: number) {
  const { query, maxChunks = 5 } = input;

  // Hybrid search: keyword (BM25) for now, semantic when embeddings are available
  const keywordResults = store.searchByKeyword(query, maxChunks * 2);

  // Take top results
  const topResults = keywordResults.slice(0, maxChunks);

  return {
    data: {
      action: 'query',
      success: true,
      message: `Found ${topResults.length} relevant chunks`,
      results: topResults.map(r => ({
        content: r.content,
        sectionTitle: r.sectionTitle,
        headingPath: r.headingPath,
        relevanceScore: Math.round(r.score * 100) / 100,
        sourceUrl: r.documentUrl,
      })),
      durationMs: Math.round(performance.now() - startTime),
    },
  };
}
```

The RAG pipeline's design reflects a core principle: **cache aggressively, re-fetch lazily.** The `isDocumentCurrent` method checks both content hash (has the document changed?) and TTL (how stale is our copy?). If the Passport.js docs were ingested two hours ago and haven't changed, the Research CLI skips re-ingestion entirely. If the same document gets queried again tomorrow after the 7-day TTL expires, it re-fetches, re-chunks, and re-indexes. This prevents the Research CLI from making redundant HTTP requests while ensuring knowledge stays fresh.

The chunking strategy deserves attention. Naive chunkers split at fixed character counts — 1,000 characters per chunk, regardless of content structure. This produces chunks that break mid-sentence, mid-paragraph, mid-code-block. The `SemanticChunker` first splits at markdown heading boundaries (preserving document structure), then splits oversized sections at paragraph boundaries, then at sentence boundaries. The 200-character overlap between chunks ensures that context at chunk boundaries isn't lost — a concept introduced at the end of one chunk appears again at the start of the next.

---

## 7.5 SourceAnalyzerTool and APIExplorerTool — The Supporting Cast

The Research CLI's third and fourth tools are smaller but essential. The `SourceAnalyzerTool` clones and analyzes GitHub repositories to build understanding maps. The `APIExplorerTool` parses OpenAPI specifications to document and explore API surfaces.

### SourceAnalyzerTool

When the Orchestrator asks "Research the Passport.js authentication library," the Research CLI doesn't just read the docs. It clones the repository, analyzes the source structure, identifies key patterns, and builds a map that tells the Coder CLI exactly how to integrate with it.

```typescript
// tools/SourceAnalyzer/SourceAnalyzerTool.ts

const sourceAnalyzerInputSchema = lazySchema(() =>
  z.strictObject({
    repositoryUrl: z.string().url().describe('GitHub repository URL to analyze'),
    focus: z.enum(['architecture', 'api_surface', 'patterns', 'dependencies', 'full'])
      .optional().default('full')
      .describe('What aspect to focus the analysis on'),
    maxDepth: z.number().optional().default(3)
      .describe('Maximum directory depth to analyze'),
  })
);

export const SourceAnalyzerTool = buildTool({
  name: 'source_analyzer',
  searchHint: 'analyze source code repositories for patterns and architecture',
  maxResultSizeChars: 100_000,
  shouldDefer: false,

  async description(input) {
    return `Analyzing repository: ${input.repositoryUrl}`;
  },

  userFacingName() { return 'Source Analyzer'; },
  
  isEnabled() { return true; },
  get inputSchema() { return sourceAnalyzerInputSchema(); },
  isConcurrencySafe() { return true; },
  isReadOnly() { return false; }, // Clones repos to local filesystem
  
  async checkPermissions() {
    return { behavior: 'allow' as const, updatedInput: undefined };
  },

  async prompt() {
    return `Use source_analyzer to deeply understand a library or framework's codebase.

ANALYSIS MODES:
- architecture: Directory structure, module organization, entry points
- api_surface: Exported functions, classes, types — what consumers actually use
- patterns: Design patterns, error handling, configuration approaches
- dependencies: Dependency tree, version constraints, potential conflicts
- full: All of the above (slower but comprehensive)

OUTPUT: A structured understanding map that the Coder CLI can use for integration.`;
  },

  async call(input, context) {
    const startTime = performance.now();
    const { repositoryUrl, focus = 'full', maxDepth = 3 } = input;
    const signal = context.abortController.signal;
    
    // Extract org/repo from URL
    const urlMatch = repositoryUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlMatch) {
      return { data: { error: 'Invalid GitHub URL', durationMs: 0 } };
    }
    const [, owner, repo] = urlMatch;
    const cloneDir = path.join(process.cwd(), '.research-cli', 'repos', `${owner}-${repo}`);
    
    // Shallow clone (depth 1 for speed)
    const { execSync } = await import('child_process');
    try {
      execSync(`git clone --depth 1 --quiet ${repositoryUrl} ${cloneDir}`, {
        timeout: 30000,
        signal,
      });
    } catch (err: any) {
      if (err.status !== 128) { // 128 = directory already exists
        throw err;
      }
      // Pull latest if already cloned
      execSync(`git -C ${cloneDir} pull --quiet`, { timeout: 15000, signal });
    }

    const analysis: Record<string, any> = {
      repository: `${owner}/${repo}`,
      analyzedAt: new Date().toISOString(),
    };

    if (focus === 'architecture' || focus === 'full') {
      analysis.architecture = await analyzeArchitecture(cloneDir, maxDepth);
    }

    if (focus === 'api_surface' || focus === 'full') {
      analysis.apiSurface = await analyzeAPISurface(cloneDir);
    }

    if (focus === 'dependencies' || focus === 'full') {
      analysis.dependencies = await analyzeDependencies(cloneDir);
    }

    if (focus === 'patterns' || focus === 'full') {
      analysis.patterns = await analyzePatterns(cloneDir);
    }

    const durationMs = Math.round(performance.now() - startTime);
    return { data: { ...analysis, durationMs } };
  },

  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let formatted = `## Source Analysis: ${output.repository}\n\n`;

    if (output.architecture) {
      formatted += `### Architecture\n`;
      formatted += `**Entry points:** ${output.architecture.entryPoints?.join(', ') || 'N/A'}\n`;
      formatted += `**Key directories:**\n`;
      for (const dir of (output.architecture.keyDirectories || [])) {
        formatted += `  - \`${dir.path}\`: ${dir.purpose}\n`;
      }
      formatted += '\n';
    }

    if (output.apiSurface) {
      formatted += `### API Surface\n`;
      formatted += `**Exports:** ${output.apiSurface.exportCount} total\n`;
      for (const exp of (output.apiSurface.keyExports || []).slice(0, 15)) {
        formatted += `  - \`${exp.name}\` (${exp.type}): ${exp.description}\n`;
      }
      formatted += '\n';
    }

    if (output.dependencies) {
      formatted += `### Dependencies\n`;
      formatted += `**Runtime:** ${output.dependencies.runtime?.length || 0} packages\n`;
      formatted += `**Dev:** ${output.dependencies.dev?.length || 0} packages\n`;
      if (output.dependencies.peerDependencies?.length) {
        formatted += `**Peer (IMPORTANT):** ${output.dependencies.peerDependencies.join(', ')}\n`;
      }
      formatted += '\n';
    }

    formatted += `\n*Analyzed in ${output.durationMs}ms*`;

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formatted.trim(),
    };
  },

  renderToolUseMessage: () => null,
  renderToolUseProgressMessage: () => null,
  renderToolResultMessage: () => null,
});

// --- Analysis Helper Functions ---

async function analyzeArchitecture(repoPath: string, maxDepth: number) {
  const { readdirSync, statSync, readFileSync, existsSync } = await import('fs');
  
  const keyDirectories: Array<{ path: string; purpose: string }> = [];
  const entryPoints: string[] = [];

  // Check for common entry point patterns
  const entryPatterns = ['index.ts', 'index.js', 'main.ts', 'main.js', 'src/index.ts', 'lib/index.ts'];
  for (const pattern of entryPatterns) {
    const fullPath = path.join(repoPath, pattern);
    if (existsSync(fullPath)) {
      entryPoints.push(pattern);
    }
  }

  // Check package.json for declared entry points
  const pkgPath = path.join(repoPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.main) entryPoints.push(`main: ${pkg.main}`);
      if (pkg.module) entryPoints.push(`module: ${pkg.module}`);
      if (pkg.exports) entryPoints.push(`exports: ${JSON.stringify(Object.keys(pkg.exports))}`);
    } catch { /* malformed package.json */ }
  }

  // Identify key directories
  function walkDir(dir: string, depth: number, relativePath: string) {
    if (depth > maxDepth) return;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        const fullPath = path.join(dir, entry);
        const relPath = path.join(relativePath, entry);
        if (statSync(fullPath).isDirectory()) {
          const purpose = inferDirectoryPurpose(entry, fullPath);
          if (purpose) {
            keyDirectories.push({ path: relPath, purpose });
          }
          walkDir(fullPath, depth + 1, relPath);
        }
      }
    } catch { /* permission denied or similar */ }
  }

  walkDir(repoPath, 0, '');
  return { entryPoints, keyDirectories };
}

function inferDirectoryPurpose(name: string, fullPath: string): string | null {
  const purposeMap: Record<string, string> = {
    'src': 'Source code root',
    'lib': 'Library source / compiled output',
    'dist': 'Distribution build output',
    'test': 'Test files', 'tests': 'Test files', '__tests__': 'Test files',
    'types': 'TypeScript type declarations',
    'utils': 'Utility functions', 'helpers': 'Helper functions',
    'middleware': 'Middleware components',
    'routes': 'Route handlers', 'controllers': 'Controllers',
    'models': 'Data models', 'schemas': 'Schema definitions',
    'services': 'Business logic services',
    'config': 'Configuration files',
    'scripts': 'Build and utility scripts',
    'examples': 'Usage examples', 'docs': 'Documentation',
  };
  return purposeMap[name] || null;
}

async function analyzeAPISurface(repoPath: string) {
  const { execSync } = await import('child_process');
  // Find all export statements
  try {
    const exports = execSync(
      `grep -rn "^export " ${repoPath}/src/ ${repoPath}/lib/ 2>/dev/null | head -50`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    
    const keyExports = exports.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/export\s+(default\s+)?(class|function|const|interface|type|enum)\s+(\w+)/);
        if (match) {
          return { name: match[3], type: match[2], description: '' };
        }
        return null;
      })
      .filter(Boolean);

    return { exportCount: keyExports.length, keyExports };
  } catch {
    return { exportCount: 0, keyExports: [] };
  }
}

async function analyzeDependencies(repoPath: string) {
  const { readFileSync, existsSync } = await import('fs');
  const pkgPath = path.join(repoPath, 'package.json');
  
  if (!existsSync(pkgPath)) return { runtime: [], dev: [], peerDependencies: [] };
  
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return {
      runtime: Object.keys(pkg.dependencies || {}),
      dev: Object.keys(pkg.devDependencies || {}),
      peerDependencies: Object.keys(pkg.peerDependencies || {}),
    };
  } catch {
    return { runtime: [], dev: [], peerDependencies: [] };
  }
}

async function analyzePatterns(repoPath: string) {
  const { execSync } = await import('child_process');
  const patterns: string[] = [];
  
  try {
    // Detect common patterns
    const hasMiddleware = execSync(
      `grep -rl "middleware" ${repoPath}/src/ 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (hasMiddleware) patterns.push('Middleware pattern');

    const hasStrategy = execSync(
      `grep -rl "Strategy\\|strategy" ${repoPath}/src/ 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (hasStrategy) patterns.push('Strategy pattern');

    const hasPlugin = execSync(
      `grep -rl "plugin\\|Plugin" ${repoPath}/src/ 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (hasPlugin) patterns.push('Plugin architecture');

    const hasEventEmitter = execSync(
      `grep -rl "EventEmitter\\|emit(" ${repoPath}/src/ 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (hasEventEmitter) patterns.push('Event-driven (EventEmitter)');
  } catch { /* grep returns non-zero if no match */ }
  
  return { detected: patterns };
}
```

### APIExplorerTool

The `APIExplorerTool` is more focused: given an OpenAPI specification URL, it parses the spec, catalogs all endpoints, and generates a structured map of the API surface. This is critical when the Orchestrator asks the Research CLI to evaluate a third-party service.

```typescript
// tools/APIExplorer/APIExplorerTool.ts

const apiExplorerInputSchema = lazySchema(() =>
  z.strictObject({
    specUrl: z.string().url().describe('URL to an OpenAPI/Swagger JSON or YAML spec'),
    focus: z.enum(['endpoints', 'auth', 'schemas', 'full'])
      .optional().default('full')
      .describe('Which aspect of the API to explore'),
  })
);

export const APIExplorerTool = buildTool({
  name: 'api_explorer',
  searchHint: 'parse and document API endpoints from OpenAPI specs',
  maxResultSizeChars: 100_000,
  shouldDefer: false,

  async description(input) {
    return `Exploring API: ${input.specUrl}`;
  },

  userFacingName() { return 'API Explorer'; },
  isEnabled() { return true; },
  get inputSchema() { return apiExplorerInputSchema(); },
  isConcurrencySafe() { return true; },
  isReadOnly() { return true; },

  async checkPermissions() {
    return { behavior: 'allow' as const, updatedInput: undefined };
  },

  async prompt() {
    return `Use api_explorer to parse OpenAPI/Swagger specs and document API surfaces.

Provide the URL to an OpenAPI spec (JSON or YAML). The tool will:
- Catalog all endpoints with methods, parameters, and response types
- Identify authentication mechanisms
- Map request/response schemas
- Generate integration guidance

Use focus parameter to narrow analysis:
- endpoints: Just the route map
- auth: Authentication and authorization details
- schemas: Data models and validation rules
- full: Everything (default)`;
  },

  async call(input, context) {
    const startTime = performance.now();
    const { specUrl, focus = 'full' } = input;
    const signal = context.abortController.signal;

    const response = await fetch(specUrl, { signal });
    if (!response.ok) {
      return {
        data: {
          error: `Failed to fetch spec: ${response.status}`,
          durationMs: Math.round(performance.now() - startTime),
        },
      };
    }

    const specText = await response.text();
    let spec: any;

    try {
      spec = JSON.parse(specText);
    } catch {
      // Try YAML parsing (would need js-yaml dependency in production)
      return {
        data: {
          error: 'Could not parse spec. Ensure it is valid JSON or YAML.',
          durationMs: Math.round(performance.now() - startTime),
        },
      };
    }

    const analysis: Record<string, any> = {
      title: spec.info?.title || 'Unknown API',
      version: spec.info?.version || 'unknown',
      baseUrl: spec.servers?.[0]?.url || '',
    };

    const paths = spec.paths || {};

    if (focus === 'endpoints' || focus === 'full') {
      analysis.endpoints = [];
      for (const [pathStr, methods] of Object.entries(paths)) {
        for (const [method, details] of Object.entries(methods as any)) {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            analysis.endpoints.push({
              method: method.toUpperCase(),
              path: pathStr,
              summary: (details as any).summary || '',
              operationId: (details as any).operationId || '',
              tags: (details as any).tags || [],
              parameters: ((details as any).parameters || []).map((p: any) => ({
                name: p.name,
                in: p.in,
                required: p.required || false,
                type: p.schema?.type || 'unknown',
              })),
              responses: Object.keys((details as any).responses || {}),
            });
          }
        }
      }
    }

    if (focus === 'auth' || focus === 'full') {
      const securitySchemes = spec.components?.securitySchemes || {};
      analysis.authentication = Object.entries(securitySchemes).map(
        ([name, scheme]: [string, any]) => ({
          name,
          type: scheme.type,
          scheme: scheme.scheme,
          bearerFormat: scheme.bearerFormat,
          flows: scheme.flows ? Object.keys(scheme.flows) : undefined,
        })
      );
      analysis.globalSecurity = spec.security || [];
    }

    if (focus === 'schemas' || focus === 'full') {
      const schemas = spec.components?.schemas || {};
      analysis.schemas = Object.entries(schemas).map(
        ([name, schema]: [string, any]) => ({
          name,
          type: schema.type,
          properties: Object.keys(schema.properties || {}),
          required: schema.required || [],
        })
      );
    }

    return {
      data: {
        ...analysis,
        endpointCount: analysis.endpoints?.length || 0,
        schemaCount: analysis.schemas?.length || 0,
        durationMs: Math.round(performance.now() - startTime),
      },
    };
  },

  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let formatted = `## API: ${output.title} v${output.version}\n`;
    formatted += `Base URL: ${output.baseUrl}\n\n`;

    if (output.endpoints) {
      formatted += `### Endpoints (${output.endpointCount})\n\n`;
      for (const ep of output.endpoints) {
        formatted += `**${ep.method} ${ep.path}**`;
        if (ep.summary) formatted += ` — ${ep.summary}`;
        formatted += '\n';
        if (ep.parameters.length) {
          formatted += `  Params: ${ep.parameters.map((p: any) => `${p.name} (${p.in}, ${p.type}${p.required ? ', required' : ''})`).join(', ')}\n`;
        }
      }
      formatted += '\n';
    }

    if (output.authentication) {
      formatted += `### Authentication\n`;
      for (const auth of output.authentication) {
        formatted += `- **${auth.name}**: ${auth.type}${auth.scheme ? ` (${auth.scheme})` : ''}\n`;
      }
      formatted += '\n';
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formatted.trim(),
    };
  },

  renderToolUseMessage: () => null,
  renderToolUseProgressMessage: () => null,
  renderToolResultMessage: () => null,
});
```

---

## 7.6 The Research Memory Schema — Where Knowledge Lives

Tools find knowledge. Memory stores it. The Research CLI's memory layer is the bridge between ephemeral search results and persistent, queryable knowledge that improves with every research task.

The schema uses SQLite — the same database engine that powers Claude Code's internal persistence. No external services. No network dependencies. A single file on disk that you can backup, version, and inspect with standard tools.

### Schema Design

```sql
-- research_memory.sql
-- The Research CLI's persistent knowledge store

-- 1. Research Cache: TTL-aware cache of previous research results
CREATE TABLE IF NOT EXISTS research_cache (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    query_hash TEXT NOT NULL,           -- SHA-256 of normalized query
    results_json TEXT NOT NULL,          -- Full results as JSON
    source_count INTEGER DEFAULT 0,
    result_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,            -- TTL expiration
    hit_count INTEGER DEFAULT 0,        -- How often this cache entry was served
    last_accessed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cache_query_hash ON research_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON research_cache(expires_at);

-- 2. Credibility Registry: Learned domain authority scores
CREATE TABLE IF NOT EXISTS credibility_registry (
    domain TEXT PRIMARY KEY,
    authority_score REAL NOT NULL,       -- 0.0 to 1.0
    category TEXT,                        -- 'official_docs', 'registry', 'blog', etc.
    sample_count INTEGER DEFAULT 1,      -- How many results we've scored from this domain
    last_updated TEXT DEFAULT (datetime('now')),
    notes TEXT                            -- Human or agent annotations
);

-- 3. Topic Map: Relationships between research topics
CREATE TABLE IF NOT EXISTS topic_map (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    parent_topic TEXT,                   -- Hierarchical topic nesting
    related_topics TEXT,                 -- JSON array of related topic IDs
    summary TEXT,                        -- 1-2 sentence summary of current understanding
    confidence REAL DEFAULT 0.5,         -- 0.0 to 1.0 — how well-researched is this topic
    first_researched TEXT DEFAULT (datetime('now')),
    last_updated TEXT DEFAULT (datetime('now')),
    research_count INTEGER DEFAULT 1     -- How many times this topic was researched
);

CREATE INDEX IF NOT EXISTS idx_topic_name ON topic_map(topic);
CREATE INDEX IF NOT EXISTS idx_topic_parent ON topic_map(parent_topic);

-- 4. Source Registry: All sources ever consulted, with quality tracking
CREATE TABLE IF NOT EXISTS source_registry (
    url TEXT PRIMARY KEY,
    title TEXT,
    domain TEXT NOT NULL,
    content_hash TEXT,                   -- Detect content changes
    first_seen TEXT DEFAULT (datetime('now')),
    last_fetched TEXT DEFAULT (datetime('now')),
    fetch_count INTEGER DEFAULT 1,
    quality_score REAL,                  -- Aggregate quality assessment
    is_stale BOOLEAN DEFAULT FALSE,      -- Marked stale if content changed significantly
    topics TEXT                           -- JSON array of related topic IDs
);

CREATE INDEX IF NOT EXISTS idx_source_domain ON source_registry(domain);

-- 5. Research Sessions: Audit trail of research tasks
CREATE TABLE IF NOT EXISTS research_sessions (
    id TEXT PRIMARY KEY,
    requested_by TEXT,                   -- Which CLI dispatched this research task
    query TEXT NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT DEFAULT 'in_progress',   -- in_progress, completed, failed, cached
    tools_used TEXT,                     -- JSON array of tool names invoked
    sources_consulted INTEGER DEFAULT 0,
    findings_json TEXT,                  -- Structured findings
    duration_ms INTEGER
);

-- 6. Knowledge Graph Edges: Explicit relationships between entities
CREATE TABLE IF NOT EXISTS knowledge_edges (
    id TEXT PRIMARY KEY,
    from_entity TEXT NOT NULL,           -- e.g., 'library:passport.js'
    to_entity TEXT NOT NULL,             -- e.g., 'pattern:middleware'
    relationship TEXT NOT NULL,          -- 'uses', 'competes_with', 'depends_on', 'implements'
    confidence REAL DEFAULT 0.8,
    evidence_url TEXT,                   -- Source that established this relationship
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edge_from ON knowledge_edges(from_entity);
CREATE INDEX IF NOT EXISTS idx_edge_to ON knowledge_edges(to_entity);
CREATE INDEX IF NOT EXISTS idx_edge_relationship ON knowledge_edges(relationship);

-- 7. Shared Memory Interface: Findings exported for other CLIs
CREATE TABLE IF NOT EXISTS shared_findings (
    id TEXT PRIMARY KEY,
    research_session_id TEXT,
    topic TEXT NOT NULL,
    finding_type TEXT NOT NULL,          -- 'recommendation', 'comparison', 'warning', 'fact'
    title TEXT NOT NULL,
    content TEXT NOT NULL,               -- Structured finding content
    confidence REAL DEFAULT 0.8,
    target_cli TEXT,                     -- Which CLI should consume this ('coder', 'security', 'all')
    consumed_by TEXT,                    -- JSON array of CLIs that have read this finding
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    FOREIGN KEY (research_session_id) REFERENCES research_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_shared_topic ON shared_findings(topic);
CREATE INDEX IF NOT EXISTS idx_shared_target ON shared_findings(target_cli);
CREATE INDEX IF NOT EXISTS idx_shared_type ON shared_findings(finding_type);
```

### How the Memory Schema Works in Practice

Consider a concrete scenario. The Orchestrator dispatches: "Research best auth libraries for Node.js."

**Step 1: Cache check.** The Research CLI hashes the normalized query and checks `research_cache`. If a cache entry exists with `expires_at` in the future, it returns the cached results immediately, increments `hit_count`, and reports to the Orchestrator in under 100ms.

**Step 2: Multi-source search.** Cache miss. The `ResearchWebSearchTool` fires parallel searches. Results come back from npm, GitHub, and web. Each result is scored by the `CredibilityEngine`, which consults `credibility_registry` for learned domain scores before falling back to the hardcoded defaults.

**Step 3: Document ingestion.** The top-scoring results include Passport.js, Auth.js (NextAuth), jose, and jsonwebtoken. The Research CLI uses `DocumentRAGTool` to ingest each library's documentation. Chunks are stored in the RAG database. The `SourceAnalyzerTool` clones the top 3 repositories for deeper analysis.

**Step 4: Topic map update.** The Research CLI updates `topic_map` with entries for "Node.js authentication," "Passport.js," "JWT libraries," "session management," and their relationships. The `confidence` field for each topic increases based on how many sources corroborate the finding.

**Step 5: Knowledge graph edges.** The Research CLI discovers that Passport.js *uses* the strategy pattern, *depends_on* Express middleware, and *competes_with* Auth.js. These relationships are stored as edges in `knowledge_edges`, each with a confidence score and evidence URL.

**Step 6: Synthesis and export.** The Research CLI synthesizes all findings into a structured recommendation and writes it to `shared_findings`:

```json
{
  "id": "finding-auth-2026-03-15-001",
  "topic": "nodejs-authentication-libraries",
  "finding_type": "comparison",
  "title": "Node.js Auth Library Comparison — March 2026",
  "content": {
    "recommendation": "Auth.js (NextAuth) for Next.js projects, Passport.js for Express, jose for raw JWT operations",
    "comparison": [
      {
        "name": "Auth.js",
        "stars": 25000,
        "weeklyDownloads": 890000,
        "strengths": ["Built-in OAuth providers", "Session management", "Active development"],
        "weaknesses": ["Tightly coupled to Next.js", "Breaking changes between major versions"],
        "bestFor": "Next.js full-stack applications"
      },
      {
        "name": "Passport.js",
        "stars": 22000,
        "weeklyDownloads": 1200000,
        "strengths": ["Strategy ecosystem", "Framework agnostic", "Battle-tested"],
        "weaknesses": ["Callback-based API", "No built-in session management"],
        "bestFor": "Express applications needing multiple auth strategies"
      }
    ]
  },
  "confidence": 0.87,
  "target_cli": "all"
}
```

**Step 7: Cache storage.** The complete research results are cached with a 72-hour TTL. The next time any CLI asks about Node.js auth libraries, the cache serves the answer instantly.

This seven-step process takes roughly 30–60 seconds for a cold research query. Cached queries return in under 100ms. Over time, the topic map grows, the credibility registry refines its scores based on observed source quality, and the knowledge graph builds connections that make each subsequent research task faster and more accurate.

---

## 7.7 End-to-End: A Research Task from Dispatch to Delivery

Let's trace a complete research task through the system, from the moment the Orchestrator dispatches it to the moment the Coder CLI reads the findings. This is the scenario that ties every component together.

### The Request

A developer types: "Build a real-time collaborative editor with conflict-free merging."

The Orchestrator decomposes this into subtasks. One of the first:

```json
{
  "task_id": "research-crdt-libraries",
  "assigned_to": "research-cli",
  "priority": "high",
  "query": "Research current CRDT and OT libraries for JavaScript/TypeScript real-time collaboration. Compare Yjs, Automerge, and alternatives. Evaluate WebSocket vs WebTransport for transport layer. Include performance benchmarks if available.",
  "context": {
    "project_type": "web_application",
    "framework": "React + Node.js",
    "constraints": ["TypeScript required", "Must support 50+ concurrent editors"]
  },
  "expected_output": {
    "type": "structured_comparison",
    "targets": ["coder-cli", "planner-cli", "security-cli"]
  }
}
```

### Phase 1: The Research CLI Receives the Task

The Research CLI's agent loop picks up the task from the shared task queue (a SQLite table that all CLIs poll). Its system prompt — the `CLAUDE.md` we'll build in Section 7.8 — tells it exactly how to approach research tasks:

1. Check the research cache first.
2. If cache miss, plan a research strategy.
3. Execute multi-source search.
4. Ingest key documentation.
5. Analyze source repositories.
6. Synthesize findings.
7. Write to shared memory.
8. Report completion.

### Phase 2: Research Strategy

The Research CLI's LLM plans the research before executing. This is critical — blind searching wastes tool calls and context. The model reasons:

> I need to research CRDT libraries for JavaScript. My approach:
> 1. Search npm for "crdt" and "yjs" and "automerge" to get current packages and download counts
> 2. Search GitHub for comparison repositories and benchmarks
> 3. Search web for recent blog posts and conference talks comparing CRDT approaches
> 4. Ingest documentation for the top 3 libraries
> 5. Analyze the source of Yjs and Automerge for architecture and pattern understanding
> 6. Search for WebSocket vs WebTransport comparisons

This planning step produces six tool calls, several of which can execute in parallel because they're all `isConcurrencySafe: true`.

### Phase 3: Parallel Execution

The Research CLI fires tools in parallel batches:

**Batch 1 (parallel):**
- `research_web_search({ query: "CRDT libraries JavaScript TypeScript 2026", sources: ["web", "npm", "github"] })`
- `research_web_search({ query: "Yjs vs Automerge performance benchmark", sources: ["web"] })`
- `research_web_search({ query: "WebSocket vs WebTransport real-time collaboration", sources: ["web"] })`

**Batch 2 (parallel, after Batch 1 returns top results):**
- `document_rag({ action: "ingest", url: "https://docs.yjs.dev/" })`
- `document_rag({ action: "ingest", url: "https://automerge.org/docs/quickstart/" })`
- `source_analyzer({ repositoryUrl: "https://github.com/yjs/yjs", focus: "architecture" })`
- `source_analyzer({ repositoryUrl: "https://github.com/automerge/automerge", focus: "architecture" })`

**Batch 3 (sequential, after ingestion completes):**
- `document_rag({ action: "query", query: "conflict resolution strategy and merge algorithm" })`
- `document_rag({ action: "query", query: "scalability limits and concurrent editor count" })`

Each batch waits for the previous one because later batches depend on earlier results. But within each batch, all tools fire simultaneously, cutting wall-clock time by 60–70%.

### Phase 4: Synthesis

With all raw data gathered, the Research CLI's LLM synthesizes findings. This is where the model's reasoning ability shines — it has ingested documentation, analyzed source code, read benchmarks, and consulted multiple sources. Its context window is full of domain-specific knowledge, and it uses that knowledge to produce a structured comparison:

```json
{
  "finding_type": "comparison",
  "title": "CRDT Libraries for Real-Time Collaboration — July 2026",
  "content": {
    "recommendation": "Yjs for the collaboration layer, WebSocket (with WebTransport upgrade path) for transport",
    "rationale": "Yjs has 3x the weekly downloads, better TypeScript support, and a proven ecosystem (ProseMirror, Monaco, CodeMirror bindings). Automerge has a more elegant API but smaller ecosystem and higher memory overhead for large documents.",
    "comparison": [
      {
        "name": "Yjs",
        "version": "13.8.2",
        "stars": 18200,
        "weeklyDownloads": 520000,
        "architecture": "YATA CRDT algorithm, binary encoding, provider-based transport",
        "strengths": [
          "Rich editor bindings (ProseMirror, Monaco, TipTap, CodeMirror)",
          "Binary encoding reduces payload size 30-60% vs JSON",
          "Proven at scale: used by Liveblocks, Hocuspocus, BlockSuite",
          "Awareness protocol for cursor/selection sharing"
        ],
        "weaknesses": [
          "Documentation is adequate but not comprehensive",
          "Custom CRDT types require deep understanding of YATA",
          "Garbage collection for deleted content needs manual tuning"
        ],
        "bestFor": "Production collaborative editors with rich text",
        "securityNotes": "No built-in auth — transport layer must handle authorization"
      },
      {
        "name": "Automerge",
        "version": "2.2.8",
        "stars": 12400,
        "weeklyDownloads": 85000,
        "architecture": "OpSet CRDT, Rust core compiled to WASM, JSON-like document model",
        "strengths": [
          "Elegant API: documents look like plain JavaScript objects",
          "Rust/WASM core is memory-safe and fast for merge operations",
          "Good offline-first story with sync protocol",
          "Active research backing from Ink & Switch"
        ],
        "weaknesses": [
          "WASM bundle adds ~400KB to client payload",
          "Fewer editor bindings than Yjs",
          "Higher memory overhead for documents with long edit histories"
        ],
        "bestFor": "Data-centric collaboration (JSON documents, not rich text)",
        "securityNotes": "WASM sandbox provides isolation but sync protocol needs auth wrapper"
      }
    ],
    "transport": {
      "recommendation": "WebSocket with h3 upgrade path",
      "rationale": "WebTransport offers better multiplexing and unreliable delivery for cursor updates, but browser support is still inconsistent in 2026. Start with WebSocket (universal), design the transport abstraction to swap in WebTransport when ready.",
      "candidates": [
        { "name": "ws", "type": "WebSocket", "maturity": "production", "note": "Standard choice for Node.js" },
        { "name": "Socket.IO", "type": "WebSocket+polling", "maturity": "production", "note": "Adds reconnection, rooms, fallback. Overhead may not be needed with CRDT." },
        { "name": "WebTransport API", "type": "HTTP/3", "maturity": "experimental", "note": "Chrome stable, Firefox behind flag, Safari no. Unreliable streams useful for ephemeral awareness data." }
      ]
    },
    "scalability": {
      "note": "Yjs has been tested with 100+ concurrent editors in production (Liveblocks benchmarks). For 50+ editors requirement, either library works but Yjs has more production evidence.",
      "bottleneck": "Server-side awareness broadcasting — O(n²) for naive implementation. Use pub/sub (Redis) for >20 editors."
    }
  },
  "confidence": 0.89,
  "sources_consulted": 14,
  "target_cli": "all"
}
```

### Phase 5: Write to Shared Memory

The structured finding goes into `shared_findings`. The topic map updates with new entries for "CRDT," "Yjs," "Automerge," "WebSocket," "WebTransport," and their relationships. Knowledge graph edges record that Yjs *implements* CRDT, *uses* YATA algorithm, *competes_with* Automerge.

The Research CLI then updates the shared task queue:

```json
{
  "task_id": "research-crdt-libraries",
  "status": "completed",
  "result_location": "shared_findings:finding-crdt-2026-07-001",
  "summary": "Yjs recommended for collaboration layer, WebSocket for transport. Full comparison with 2 libraries, 3 transport options, scalability analysis."
}
```

### Phase 6: Downstream Consumption

The Planner CLI reads the finding and uses it to architect the collaboration layer. The Coder CLI reads it and knows to `npm install yjs y-websocket y-prosemirror`. The Security CLI reads the security notes and flags that the transport layer needs authentication — a finding it will verify during its own security audit later.

No CLI had to repeat the research. No CLI had to search the web. The knowledge was gathered once, scored for credibility, synthesized by a specialized agent, and made available to everyone. This is the power of a dedicated Research CLI.

---

## 7.8 The Research CLI's CLAUDE.md — Complete Template

The `CLAUDE.md` file is the Research CLI's brain. It defines the agent's identity, tools, operating procedures, and constraints. Here is the complete template, annotated for clarity.

```markdown
# CLAUDE.md — Research CLI

## Identity

You are the Research CLI in a multi-agent system. Your role is to find,
verify, analyze, and store knowledge. You never write code. You never
modify files outside your data directory. You never make architectural
decisions. You research. You report. You remember.

## Tools

You have four specialized tools:

1. **research_web_search** — Multi-source search with credibility scoring
   - Use for: Finding libraries, comparing tools, current best practices
   - Sources: web, npm registry, GitHub, Stack Overflow
   - Always check credibility scores before trusting a result

2. **document_rag** — Document ingestion and retrieval
   - Use for: Reading documentation sites, building queryable knowledge
   - Always INGEST before QUERY — you can't search what you haven't indexed
   - Documents are cached with 7-day TTL — don't force refresh unless asked

3. **source_analyzer** — Repository analysis
   - Use for: Understanding library architecture, API surfaces, dependencies
   - Use sparingly — cloning repos is slow (5-15 seconds each)
   - Focus your analysis: 'api_surface' for integration, 'architecture' for understanding

4. **api_explorer** — OpenAPI spec analysis
   - Use for: Documenting third-party API surfaces
   - Requires a URL to a JSON or YAML OpenAPI spec

## Operating Procedures

### For Every Research Task:

1. **Check cache first.** Query the research_cache table. If a recent
   result exists for a similar query, start from that — don't repeat work.

2. **Plan before searching.** Think about what you need to find. Plan
   your search queries. Identify which sources are most likely to have
   relevant results. A 30-second planning step saves 5 minutes of
   unfocused searching.

3. **Search in parallel.** Fire multiple research_web_search calls
   simultaneously. Sources are independent — there's no reason to wait
   for npm results before searching GitHub.

4. **Verify critical claims.** If a result claims "Yjs supports 1000
   concurrent editors," look for the source of that claim. Check the
   credibility score. Find corroborating evidence from a second source.
   Don't report unverified claims at high confidence.

5. **Ingest key documentation.** For the top 2-3 results, use document_rag
   to ingest their documentation. This lets you answer follow-up questions
   without re-fetching.

6. **Synthesize, don't dump.** Your output should be a structured
   recommendation with comparison tables, not a raw list of search results.
   Other CLIs read your findings and make decisions based on them.

7. **Write to shared memory.** Every research task must produce at least
   one entry in shared_findings. This is how other CLIs consume your work.

8. **Update the topic map.** Every research task should update the topic
   map with new topics and relationships discovered during research.

### Confidence Scoring Guidelines

- **0.90+**: Multiple authoritative sources agree. Official documentation
  confirms. Recent and well-maintained.
- **0.70-0.89**: Strong evidence from 2+ sources. Some minor disagreements
  or gaps in documentation.
- **0.50-0.69**: Single authoritative source, or multiple sources with
  some contradictions. Flag this confidence level in your output.
- **Below 0.50**: Speculative. Limited sources. Outdated information.
  Always flag low-confidence findings explicitly.

### What You Never Do

- Never write code (that's the Coder CLI's job)
- Never make architectural decisions (that's the Planner CLI's job)
- Never modify project files outside .research-cli/
- Never report hallucinated statistics — if you can't find a number, say so
- Never skip the cache check — redundant research wastes time and tokens

## Memory

Your data directory is `.research-cli/` at the project root.

### Database: `.research-cli/research_memory.db`
- research_cache: TTL-aware result cache
- credibility_registry: Learned domain authority scores
- topic_map: Research topic relationships
- source_registry: All sources ever consulted
- research_sessions: Audit trail
- knowledge_edges: Entity relationships
- shared_findings: Findings for other CLIs

### RAG Store: `.research-cli/rag/knowledge.db`
- documents: Ingested document metadata
- chunks: Document chunks with embeddings
- chunks_fts: Full-text search index

### Cache TTL Policy
- Library comparisons: 72 hours
- API documentation: 168 hours (7 days)
- Best practices / patterns: 168 hours
- Security advisories: 24 hours (refresh daily)
- Version-specific information: 24 hours

## Communication Protocol

### Receiving Tasks
Read from the shared task queue:
```sql
SELECT * FROM task_queue
WHERE assigned_to = 'research-cli'
AND status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 1;
```

### Reporting Results
Write structured findings to shared_findings table.
Update task status in the shared task queue.
Include: finding_type, confidence score, sources consulted count,
and target_cli for routing.

### Inter-CLI Messages
When another CLI asks a follow-up question about your research,
check the RAG store first — you've likely already ingested the
relevant documentation.
```

---

## 7.9 How the Research CLI Feeds Other CLIs

The Research CLI doesn't operate in isolation. Its entire purpose is to produce knowledge that other CLIs consume. The communication happens through shared SQLite tables — the same mechanism described in Chapter 6's shared memory architecture, but with research-specific conventions.

### The Shared Findings Contract

Every finding in `shared_findings` follows a contract that consuming CLIs can rely on:

| Field | Purpose | Example |
|-------|---------|---------|
| `finding_type` | How to interpret the content | `recommendation`, `comparison`, `warning`, `fact` |
| `confidence` | How much to trust this finding | `0.89` (high — multiple sources agree) |
| `target_cli` | Who should read this | `coder-cli`, `security-cli`, `all` |
| `consumed_by` | Audit trail of who read it | `["planner-cli", "coder-cli"]` |
| `expires_at` | When this finding becomes stale | `2026-07-18T00:00:00Z` |

### Consumption Patterns

**The Planner CLI** reads findings with `finding_type = 'comparison'` and `finding_type = 'recommendation'`. It uses these to make architectural decisions — which library to use, which transport protocol, which design pattern.

**The Coder CLI** reads findings with `target_cli = 'coder-cli'` or `target_cli = 'all'`. It extracts specific information: package names to install, API usage patterns, configuration examples. The Coder CLI also queries the RAG store directly when it needs to look up how a specific API works during implementation.

**The Security CLI** reads all findings and looks for security-relevant information: `securityNotes` fields in library comparisons, authentication requirements, dependency vulnerability data. It also uses the `source_analyzer` output to identify attack surfaces in third-party dependencies.

**The Documentation CLI** reads findings to write accurate documentation. When the Research CLI reports that "Yjs uses the YATA CRDT algorithm with binary encoding," the Documentation CLI can reference this in the architecture docs without repeating the research.

### The Knowledge Flywheel

Here's what makes this architecture compound over time. Each research task:

1. **Adds to the cache** — future similar queries are faster.
2. **Refines credibility scores** — the system learns which sources are trustworthy.
3. **Expands the topic map** — connections between topics make related research faster.
4. **Grows the knowledge graph** — entity relationships enable inference ("if project X uses Yjs, and Yjs depends on lib0, then project X transitively depends on lib0").
5. **Fills the RAG store** — ingested documentation is available for instant retrieval.

After ten research tasks, the Research CLI is noticeably faster and more accurate than it was after one. After a hundred, it has a comprehensive knowledge base covering the project's entire technical domain. The Orchestrator learns to dispatch research tasks early, even speculatively, because the cost of research decreases as the knowledge base grows.

This is the flywheel effect that justifies a dedicated Research CLI. A generic agent doing ad hoc web searches builds nothing. A specialized research agent builds a persistent, queryable, accumulating knowledge base that makes the entire multi-CLI system smarter with every task.

---

## Key Takeaways

- **The Research CLI exists to isolate knowledge-gathering from other work.** Its context window is dedicated to reading, analyzing, and synthesizing information. Other CLIs get clean, structured findings without consuming their own context on raw search results.

- **Four custom tools cover the research surface.** `WebSearchTool` for multi-source discovery with credibility scoring. `DocumentRAGTool` for ingesting and querying documentation. `SourceAnalyzerTool` for understanding library internals. `APIExplorerTool` for mapping third-party API surfaces.

- **The `buildTool` interface is your extension point.** Every custom tool follows the same pattern: Zod schemas for type-safe input/output, a `call` function for execution, `mapToolResultToToolResultBlockParam` for LLM-readable formatting, and behavior flags for concurrency and permissions.

- **Credibility scoring prevents the model from treating all sources equally.** Official documentation outweighs blog posts. Recent results outweigh stale ones. Multi-source corroboration outweighs single-source claims. The scoring formula (40% credibility, 35% relevance, 25% freshness) reflects that trustworthiness is the most important dimension for research.

- **The memory schema is the Research CLI's long-term value.** Seven SQLite tables store research cache, credibility scores, topic maps, source registries, session logs, knowledge graph edges, and shared findings. This persistence layer transforms the Research CLI from a stateless search wrapper into a learning knowledge engine.

- **Shared findings are the contract between the Research CLI and its consumers.** Every finding has a type, confidence score, target CLI, and expiration. Consuming CLIs know exactly what to expect and can make decisions proportional to the stated confidence.

- **The knowledge flywheel compounds over time.** Every research task makes the next one faster: cache hits, refined credibility, expanded topic maps, richer knowledge graphs, and a deeper RAG store. This accumulation is the strategic argument for dedicating a CLI to research.

In the next chapter, we build the Planner CLI — the agent that takes the Research CLI's findings and transforms them into architectural decisions, dependency graphs, and implementation plans that the Coder CLI can execute.
