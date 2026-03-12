# Design: User Knowledge Management System

## Architecture Overview

The User Knowledge Management System follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│  (knowledge.js - Command routing and user interaction)       │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│                      Manager Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Knowledge  │  │   Analyzer   │  │  Integrator  │      │
│  │   Manager    │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│                      Storage Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Index     │  │    Entry     │  │   Template   │      │
│  │   Manager    │  │   Manager    │  │   Manager    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. KnowledgeManager (Core Orchestrator)

**Responsibility**: Central coordinator for all knowledge operations

**Key Methods**:
```javascript
class KnowledgeManager {
  constructor(projectRoot)
  
  // Initialization
  async initialize()
  async isInitialized()
  
  // CRUD Operations
  async addEntry(type, title, options)
  async getEntry(id)
  async updateEntry(id, updates)
  async deleteEntry(id, options)
  async listEntries(filters)
  
  // Search and Query
  async search(keyword, options)
  async query(question)
  
  // Analysis and Integration
  async analyze(options)
  async integrate(id, target, options)
  
  // Import/Export
  async export(outputPath)
  async import(sourcePath, options)
  
  // Statistics
  async getStats()
}
```

**Dependencies**:
- IndexManager: Metadata management
- EntryManager: File operations
- TemplateManager: Template handling
- Analyzer: AI-powered analysis
- Integrator: Integration logic

### 2. IndexManager (Metadata Management)

**Responsibility**: Manage index.json for fast lookups

**Key Methods**:
```javascript
class IndexManager {
  constructor(knowledgePath)
  
  async load()
  async save()
  async addEntry(metadata)
  async updateEntry(id, updates)
  async removeEntry(id)
  async findById(id)
  async findByType(type)
  async findByTag(tag)
  async search(keyword)
  async getStats()
  async rebuild() // Rebuild from files
}
```

**Index Schema**:
```typescript
interface Index {
  version: string;
  entries: Entry[];
  stats: Stats;
  lastUpdated: string;
}

interface Entry {
  id: string;
  type: string;
  title: string;
  file: string;
  created: string;
  updated: string;
  tags: string[];
  category?: string;
  status: 'active' | 'archived' | 'integrated';
  integration?: {
    target: string;
    date: string;
    location: string;
  };
}

interface Stats {
  totalEntries: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byTag: Record<string, number>;
}
```

### 3. EntryManager (File Operations)

**Responsibility**: Handle entry file creation, reading, updating, deletion

**Key Methods**:
```javascript
class EntryManager {
  constructor(knowledgePath)
  
  async create(type, title, content, metadata)
  async read(filePath)
  async update(filePath, content, metadata)
  async delete(filePath, backup)
  async exists(filePath)
  async parseFrontmatter(content)
  async serializeFrontmatter(metadata, content)
  async validate(filePath)
  generateId()
  generateFilename(type, title)
}
```

**Entry Structure**:
```markdown
---
id: kb-{timestamp}-{random}
type: pattern
title: Repository Pattern Best Practices
created: 2026-02-03T10:30:00Z
updated: 2026-02-03T10:30:00Z
tags: [design-pattern, database, architecture]
category: backend
status: active
integration: null
---

## Context
...

## Problem
...

## Solution
...

## Examples
...

## References
...
```

### 4. TemplateManager (Template Handling)

**Responsibility**: Manage entry templates for different types

**Key Methods**:
```javascript
class TemplateManager {
  constructor(knowledgePath)
  
  async getTemplate(type)
  async listTemplates()
  async createCustomTemplate(type, content)
  async deleteCustomTemplate(type)
  getDefaultTemplate(type)
}
```

**Default Templates**:
- **pattern.md**: Design patterns and architectural solutions
- **lesson.md**: Lessons learned from experience
- **workflow.md**: Custom workflows and processes
- **checklist.md**: Checklists for common tasks
- **reference.md**: Reference materials and links

### 5. Analyzer (AI-Powered Analysis)

**Responsibility**: Analyze knowledge entries and suggest improvements

**Key Methods**:
```javascript
class Analyzer {
  constructor(knowledgeManager)
  
  async analyzeEntry(id)
  async analyzeAll()
  async detectDuplicates()
  async suggestIntegration(id)
  async scoreEntry(entry)
  async generateReport(results)
}
```

**Analysis Dimensions**:
```typescript
interface AnalysisResult {
  id: string;
  title: string;
  scores: {
    universality: number;      // 0-100: How universal is this knowledge?
    projectSpecificity: number; // 0-100: How project-specific?
    temporality: number;        // 0-100: How time-sensitive?
    documentationValue: number; // 0-100: Should it be in docs?
    overall: number;            // 0-100: Overall quality score
  };
  suggestions: {
    action: 'integrate' | 'keep' | 'archive' | 'delete';
    target?: 'steering' | 'docs' | 'spec' | 'custom';
    reason: string;
    confidence: number;
  }[];
  duplicates: string[]; // IDs of similar entries
}
```

**Scoring Algorithm**:
```javascript
// Universality: Check for project-specific terms
universality = 100 - (projectSpecificTerms.length * 10)

// Project Specificity: Inverse of universality
projectSpecificity = 100 - universality

// Temporality: Check for time-sensitive keywords
temporality = hasDates || hasVersions ? 80 : 20

// Documentation Value: Check structure and completeness
documentationValue = (
  hasContext * 20 +
  hasProblem * 20 +
  hasSolution * 30 +
  hasExamples * 20 +
  hasReferences * 10
)

// Overall: Weighted average
overall = (
  universality * 0.3 +
  documentationValue * 0.4 +
  (100 - temporality) * 0.3
)
```

### 6. Integrator (Integration Logic)

**Responsibility**: Integrate knowledge into project documentation

**Key Methods**:
```javascript
class Integrator {
  constructor(knowledgeManager, projectRoot)
  
  async integrate(id, target, options)
  async integrateToSteering(entry, file)
  async integrateToDocs(entry, file)
  async integrateToSpec(entry, specName)
  async integrateToCustom(entry, path)
  async createBackup(target)
  async rollback(backupId)
}
```

**Integration Strategies**:

1. **To Steering** (CORE_PRINCIPLES.md):
   - Append as new principle section
   - Maintain existing structure
   - Add version note

2. **To Docs**:
   - Create new document or append to existing
   - Follow docs/ structure
   - Update README.md index

3. **To Spec**:
   - Create new Spec with entry as requirements
   - Or append to existing Spec's design.md

4. **To Custom**:
   - User-specified location
   - Flexible format

### 7. CLI Commands (knowledge.js)

**Command Structure**:
```javascript
// sce knowledge init
async function initCommand(options) {
  // Create directory structure
  // Generate README and templates
  // Initialize index.json
}

// sce knowledge add <type> <title>
async function addCommand(type, title, options) {
  // Validate type
  // Generate entry from template
  // Save and index
  // Optionally open in editor
}

// sce knowledge list [options]
async function listCommand(options) {
  // Load index
  // Apply filters
  // Format and display table
}

// sce knowledge search <keyword>
async function searchCommand(keyword, options) {
  // Search in index and files
  // Rank results
  // Display with context
}

// sce knowledge show <id>
async function showCommand(id, options) {
  // Load entry
  // Format and display
}

// sce knowledge edit <id>
async function editCommand(id, options) {
  // Open in editor
  // Validate after edit
  // Update index
}

// sce knowledge delete <id>
async function deleteCommand(id, options) {
  // Confirm
  // Backup
  // Delete and update index
}

// sce knowledge analyze [options]
async function analyzeCommand(options) {
  // Analyze all entries
  // Generate report
  // Display suggestions
}

// sce knowledge integrate <id> --target <target>
async function integrateCommand(id, options) {
  // Validate target
  // Backup
  // Integrate
  // Mark as integrated
}

// sce knowledge query "<question>"
async function queryCommand(question, options) {
  // AI-powered search
  // Rank by relevance
  // Display top results
}

// sce knowledge export [--output <path>]
async function exportCommand(options) {
  // Create archive
  // Include all files and index
}

// sce knowledge import <path>
async function importCommand(path, options) {
  // Extract archive
  // Validate entries
  // Handle conflicts
  // Import and index
}

// sce knowledge stats
async function statsCommand(options) {
  // Load index
  // Calculate statistics
  // Display charts and trends
}
```

## Data Flow

### Add Entry Flow
```
User Command
    ↓
CLI (knowledge.js)
    ↓
KnowledgeManager.addEntry()
    ↓
TemplateManager.getTemplate() → Get template
    ↓
EntryManager.create() → Create file
    ↓
IndexManager.addEntry() → Update index
    ↓
IndexManager.save() → Persist
    ↓
Success Response
```

### Analyze Flow
```
User Command
    ↓
CLI (knowledge.js)
    ↓
KnowledgeManager.analyze()
    ↓
IndexManager.load() → Get all entries
    ↓
For each entry:
    Analyzer.analyzeEntry() → Score and suggest
    ↓
Analyzer.detectDuplicates() → Find similar
    ↓
Analyzer.generateReport() → Format results
    ↓
Display Report
```

### Integrate Flow
```
User Command
    ↓
CLI (knowledge.js)
    ↓
KnowledgeManager.integrate()
    ↓
EntryManager.read() → Load entry
    ↓
Integrator.createBackup() → Backup target
    ↓
Integrator.integrate() → Perform integration
    ↓
IndexManager.updateEntry() → Mark as integrated
    ↓
Success Response
```

## File System Layout

```
.sce/
├── knowledge/
│   ├── README.md                    # Usage guide
│   ├── index.json                   # Metadata index
│   ├── .templates/                  # Entry templates
│   │   ├── pattern.md
│   │   ├── lesson.md
│   │   ├── workflow.md
│   │   ├── checklist.md
│   │   └── reference.md
│   ├── .backups/                    # Backup files
│   │   └── {timestamp}-{id}.md
│   ├── patterns/                    # Pattern entries
│   │   └── repository-pattern.md
│   ├── lessons/                     # Lesson entries
│   │   └── error-handling-lesson.md
│   ├── workflows/                   # Workflow entries
│   │   └── deployment-workflow.md
│   ├── checklists/                  # Checklist entries
│   │   └── code-review-checklist.md
│   └── references/                  # Reference entries
│       └── api-reference.md
└── ...
```

## Error Handling

**Error Categories**:
1. **Validation Errors**: Invalid input, malformed frontmatter
2. **File System Errors**: Permission denied, disk full
3. **Index Errors**: Corrupted index, missing entries
4. **Integration Errors**: Target not found, conflict

**Error Handling Strategy**:
```javascript
try {
  // Operation
} catch (error) {
  if (error instanceof ValidationError) {
    // Show validation message
  } else if (error instanceof FileSystemError) {
    // Show file system error with suggestions
  } else if (error instanceof IndexError) {
    // Offer to rebuild index
  } else {
    // Generic error handling
  }
}
```

## Performance Optimization

1. **Index Caching**: Keep index in memory, lazy load files
2. **Incremental Updates**: Only update changed entries
3. **Parallel Processing**: Analyze multiple entries concurrently
4. **Lazy Loading**: Load entry content only when needed
5. **Search Optimization**: Use index for initial filtering

## Security Considerations

1. **Input Validation**: Sanitize all user inputs
2. **Path Traversal**: Prevent access outside knowledge directory
3. **File Permissions**: Respect system file permissions
4. **Backup Integrity**: Verify backups before destructive operations

## Testing Strategy

1. **Unit Tests**: Each manager class independently
2. **Integration Tests**: End-to-end command flows
3. **Performance Tests**: Verify NFR-1 requirements
4. **Edge Cases**: Large knowledge bases, special characters
5. **Cross-Platform**: Test on Windows, Linux, macOS

## Migration and Compatibility

**Version 1.0.0**:
- Initial release
- No migration needed

**Future Versions**:
- Provide migration scripts for index format changes
- Maintain backward compatibility for at least 2 versions

## Monitoring and Metrics

**Metrics to Track**:
- Number of entries per user
- Most used entry types
- Integration rate
- Analysis accuracy (user feedback)
- Command usage frequency

**Logging**:
- Log all operations to `.sce/knowledge/.log`
- Include timestamps, user, operation, result
- Rotate logs monthly

## Future Enhancements

1. **Vector Search**: Semantic search using embeddings
2. **Knowledge Graph**: Visualize relationships between entries
3. **Team Collaboration**: Shared knowledge base with sync
4. **AI Summaries**: Auto-generate entry summaries
5. **External Integration**: Sync with Notion, Confluence
6. **Version Control**: Track entry history with git-like interface

## Dependencies

**Required**:
- fs-extra: File operations
- js-yaml: Frontmatter parsing
- chalk: Colored output
- commander: CLI framework

**Optional**:
- archiver: Export/import functionality
- cli-table3: Table formatting
- inquirer: Interactive prompts

## Deployment

**Installation**:
- Feature included in sce core
- No additional installation needed

**Activation**:
- User runs `sce knowledge init`
- Creates `.sce/knowledge/` directory
- Ready to use

**Deactivation**:
- User can delete `.sce/knowledge/` directory
- No impact on other sce features
