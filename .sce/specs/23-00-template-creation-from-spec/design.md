# Design Document: Template Creation from Existing Spec

## Overview

This feature automates the conversion of completed Specs into reusable templates through the `sce templates create-from-spec` command. The system analyzes Spec files (requirements.md, design.md, tasks.md), replaces project-specific content with template variables, adds YAML frontmatter metadata, validates the output, and exports a complete template package ready for submission to the template repository.

**Key Design Principles**:
- **Reuse Existing Infrastructure**: Leverage TemplateValidator, TemplateApplicator, and other components from Spec 22-00
- **Modular Architecture**: Separate concerns into focused components (reading, generalization, metadata, export)
- **Pattern-Based Generalization**: Use regex patterns and heuristics to detect and replace project-specific content
- **Interactive CLI**: Provide user-friendly prompts with sensible defaults
- **Quality Assurance**: Integrate validation at every step to ensure template quality

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry Point                          │
│              sce templates create-from-spec                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  TemplateCreator                            │
│  (Orchestrates the entire template creation workflow)       │
└─┬───────────────────────────────────────────────────────────┘
  │
  ├──▶ SpecReader ──────────────▶ Reads and validates Spec files
  │
  ├──▶ ContentGeneralizer ──────▶ Replaces project-specific content
  │
  ├──▶ MetadataCollector ───────▶ Gathers template metadata
  │
  ├──▶ FrontmatterGenerator ────▶ Generates YAML frontmatter
  │
  ├──▶ TemplateValidator ───────▶ Validates generated template
  │
  └──▶ TemplateExporter ────────▶ Exports template package
```

### Component Interaction Flow

```
User Command
    │
    ▼
┌─────────────────────┐
│  CLI Handler        │
│  - Parse arguments  │
│  - Initialize       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  SpecReader         │
│  - Validate Spec    │
│  - Read files       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ ContentGeneralizer  │
│  - Detect patterns  │
│  - Replace content  │
│  - Flag ambiguous   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ MetadataCollector   │
│  - Prompt user      │
│  - Validate input   │
│  - Build metadata   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│FrontmatterGenerator │
│  - Generate YAML    │
│  - Add to files     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ TemplateValidator   │
│  - Validate format  │
│  - Check variables  │
│  - Generate report  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ TemplateExporter    │
│  - Create output    │
│  - Generate docs    │
│  - Create registry  │
└──────┬──────────────┘
       │
       ▼
   Success Report
```

## Components and Interfaces

### 1. TemplateCreator (Orchestrator)

**Purpose**: Main orchestrator that coordinates the entire template creation workflow.

**Interface**:
```javascript
class TemplateCreator {
  constructor(options = {})
  
  /**
   * Creates a template from an existing Spec
   * 
   * @param {Object} options - Creation options
   * @param {string} options.spec - Spec identifier (number or name)
   * @param {string} options.output - Output directory path
   * @param {boolean} options.preview - Show diff before export
   * @param {boolean} options.dryRun - Simulate without writing
   * @param {boolean} options.interactive - Use interactive prompts
   * @returns {Promise<Object>} Creation result
   */
  async createTemplate(options)
  
  /**
   * Shows preview of changes
   * 
   * @param {Object} originalContent - Original Spec content
   * @param {Object} generalizedContent - Generalized content
   * @returns {string} Formatted diff
   */
  showPreview(originalContent, generalizedContent)
}
```

**Responsibilities**:
- Parse command-line options
- Coordinate workflow steps
- Handle errors and recovery
- Display progress indicators
- Generate final report

### 2. SpecReader

**Purpose**: Reads and validates Spec files from the `.sce/specs/` directory.

**Interface**:
```javascript
class SpecReader {
  constructor()
  
  /**
   * Finds a Spec by identifier (number or name)
   * 
   * @param {string} identifier - Spec number (e.g., '23-00') or name
   * @returns {Promise<Object>} Spec information
   */
  async findSpec(identifier)
  
  /**
   * Validates that all required files exist
   * 
   * @param {string} specPath - Path to Spec directory
   * @returns {Promise<Object>} Validation result
   */
  async validateSpecStructure(specPath)
  
  /**
   * Reads all Spec files
   * 
   * @param {string} specPath - Path to Spec directory
   * @returns {Promise<Object>} File contents
   */
  async readSpecFiles(specPath)
  
  /**
   * Extracts Spec metadata (name, number, dates)
   * 
   * @param {string} specPath - Path to Spec directory
   * @param {Object} fileContents - File contents
   * @returns {Object} Extracted metadata
   */
  extractSpecMetadata(specPath, fileContents)
}
```

**Responsibilities**:
- Locate Spec directory by number or name
- Validate presence of requirements.md, design.md, tasks.md
- Read file contents
- Extract basic metadata (Spec name, dates, author)

### 3. ContentGeneralizer

**Purpose**: Replaces project-specific content with template variables using pattern matching.

**Interface**:
```javascript
class ContentGeneralizer {
  constructor()
  
  /**
   * Generalizes Spec content
   * 
   * @param {Object} fileContents - Original file contents
   * @param {Object} specMetadata - Spec metadata
   * @returns {Object} Generalized content and flags
   */
  generalize(fileContents, specMetadata)
  
  /**
   * Applies generalization patterns to text
   * 
   * @param {string} content - Original content
   * @param {Object} replacements - Replacement map
   * @returns {Object} Generalized content and matches
   */
  applyPatterns(content, replacements)
  
  /**
   * Detects ambiguous content that needs review
   * 
   * @param {string} content - Content to analyze
   * @returns {Array} Flagged items
   */
  detectAmbiguousContent(content)
  
  /**
   * Builds replacement map from Spec metadata
   * 
   * @param {Object} specMetadata - Spec metadata
   * @returns {Object} Replacement patterns
   */
  buildReplacementMap(specMetadata)
}
```

**Generalization Patterns**:
```javascript
const PATTERNS = {
  // Spec name patterns
  SPEC_NAME: {
    pattern: /\b{spec-name}\b/g,
    variable: '{{SPEC_NAME}}'
  },
  SPEC_NAME_TITLE: {
    pattern: /\b{Spec Name Title}\b/g,
    variable: '{{SPEC_NAME_TITLE}}'
  },
  
  // Date patterns
  DATE: {
    pattern: /\b\d{4}-\d{2}-\d{2}\b/g,
    variable: '{{DATE}}'
  },
  
  // Author patterns
  AUTHOR: {
    pattern: /\b(Author|Created by|Written by):\s*([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g,
    variable: '{{AUTHOR}}'
  },
  
  // Version patterns
  VERSION: {
    pattern: /\bv?\d+\.\d+\.\d+\b/g,
    variable: '{{VERSION}}',
    context: ['version', 'release']
  },
  
  // Path patterns
  PROJECT_PATH: {
    pattern: /\.sce\/specs\/[\w-]+/g,
    variable: '.sce/specs/{{SPEC_NAME}}'
  }
};
```

**Ambiguous Content Detection**:
- Company names
- Product names
- Specific URLs (non-template)
- Hardcoded configuration values
- Technology-specific details that might vary

**Responsibilities**:
- Apply regex patterns to replace project-specific content
- Maintain context awareness (don't replace in code blocks inappropriately)
- Flag content that might need manual review
- Preserve document structure and formatting
- Track all replacements for preview

### 4. MetadataCollector

**Purpose**: Collects template metadata through interactive prompts or defaults.

**Interface**:
```javascript
class MetadataCollector {
  constructor(options = {})
  
  /**
   * Collects all template metadata
   * 
   * @param {Object} specMetadata - Extracted Spec metadata
   * @param {boolean} interactive - Use interactive prompts
   * @returns {Promise<Object>} Template metadata
   */
  async collectMetadata(specMetadata, interactive = true)
  
  /**
   * Prompts for template name
   * 
   * @param {string} defaultName - Default name
   * @returns {Promise<string>} Template name
   */
  async promptTemplateName(defaultName)
  
  /**
   * Prompts for category
   * 
   * @returns {Promise<string>} Selected category
   */
  async promptCategory()
  
  /**
   * Prompts for description
   * 
   * @returns {Promise<string>} Description
   */
  async promptDescription()
  
  /**
   * Prompts for tags
   * 
   * @param {Array} suggestedTags - Suggested tags
   * @returns {Promise<Array>} Tags
   */
  async promptTags(suggestedTags)
  
  /**
   * Validates metadata completeness
   * 
   * @param {Object} metadata - Collected metadata
   * @returns {Object} Validation result
   */
  validateMetadata(metadata)
  
  /**
   * Suggests tags based on content analysis
   * 
   * @param {Object} fileContents - Spec file contents
   * @returns {Array} Suggested tags
   */
  suggestTags(fileContents)
}
```

**Metadata Fields**:
```javascript
{
  name: 'template-name',              // kebab-case
  description: 'Brief description',   // 1-2 sentences
  category: 'web-features',           // from predefined list
  difficulty: 'intermediate',         // beginner/intermediate/advanced
  tags: ['api', 'rest', 'backend'],   // searchable keywords
  applicable_scenarios: [             // use cases
    'Creating new API endpoints',
    'Implementing CRUD operations'
  ],
  author: 'John Doe',                 // from git config
  version: '1.0.0',                   // semver
  min_sce_version: '1.16.0',              // minimum sce version
  created_at: '2025-01-31',           // ISO date
  updated_at: '2025-01-31'            // ISO date
}
```

**Categories**:
- `web-features`: Web application features (APIs, UI components)
- `backend-features`: Backend services (databases, queues, caching)
- `infrastructure`: Infrastructure and DevOps (CI/CD, monitoring)
- `testing`: Testing frameworks and strategies
- `documentation`: Documentation templates
- `other`: Miscellaneous templates

**Responsibilities**:
- Prompt user for metadata (using inquirer)
- Provide sensible defaults
- Validate input format (kebab-case, semver, etc.)
- Suggest tags based on content analysis
- Display summary for confirmation

### 5. FrontmatterGenerator

**Purpose**: Generates YAML frontmatter and adds it to template files.

**Interface**:
```javascript
class FrontmatterGenerator {
  constructor()
  
  /**
   * Generates YAML frontmatter
   * 
   * @param {Object} metadata - Template metadata
   * @returns {string} YAML frontmatter block
   */
  generateFrontmatter(metadata)
  
  /**
   * Adds frontmatter to file content
   * 
   * @param {string} content - Original content
   * @param {string} frontmatter - YAML frontmatter
   * @returns {string} Content with frontmatter
   */
  addFrontmatter(content, frontmatter)
  
  /**
   * Validates YAML syntax
   * 
   * @param {string} yaml - YAML content
   * @returns {Object} Validation result
   */
  validateYaml(yaml)
  
  /**
   * Formats array fields for YAML
   * 
   * @param {Array} items - Array items
   * @returns {string} Formatted YAML array
   */
  formatArrayField(items)
}
```

**YAML Format**:
```yaml
---
name: Template Name
category: web-features
description: Brief description of the template
difficulty: intermediate
tags:
  - tag1
  - tag2
  - tag3
applicable_scenarios:
  - Scenario 1
  - Scenario 2
author: John Doe
created_at: 2025-01-31
updated_at: 2025-01-31
version: 1.0.0
min_sce_version: 1.16.0
---
```

**Responsibilities**:
- Generate valid YAML frontmatter
- Format arrays and strings correctly
- Add frontmatter to beginning of files
- Validate YAML syntax
- Ensure consistent formatting

### 6. TemplateValidator (Reused from Spec 22-00)

**Purpose**: Validates generated template structure and content.

**Extended Validation**:
- Check for remaining project-specific content (high confidence patterns)
- Verify all template variables use correct syntax `{{VARIABLE_NAME}}`
- Validate that EARS patterns are preserved
- Check requirement numbering consistency
- Verify no broken internal references
- Validate frontmatter completeness
- Calculate quality score (0-100)

**Quality Score Calculation**:
```javascript
{
  structure: 30,        // File structure and required sections
  frontmatter: 20,      // Frontmatter completeness and validity
  variables: 20,        // Template variable syntax and coverage
  content: 20,          // Content quality (no project-specific content)
  references: 10        // Internal reference integrity
}
```

### 7. TemplateExporter

**Purpose**: Exports the complete template package to a directory.

**Interface**:
```javascript
class TemplateExporter {
  constructor()
  
  /**
   * Exports template package
   * 
   * @param {Object} templateData - Template data
   * @param {string} outputDir - Output directory
   * @returns {Promise<Object>} Export result
   */
  async exportTemplate(templateData, outputDir)
  
  /**
   * Creates output directory structure
   * 
   * @param {string} outputDir - Output directory
   * @returns {Promise<void>}
   */
  async createOutputDirectory(outputDir)
  
  /**
   * Writes template files
   * 
   * @param {Object} fileContents - File contents
   * @param {string} outputDir - Output directory
   * @returns {Promise<Array>} Written files
   */
  async writeTemplateFiles(fileContents, outputDir)
  
  /**
   * Generates registry entry
   * 
   * @param {Object} metadata - Template metadata
   * @returns {Object} Registry entry
   */
  generateRegistryEntry(metadata)
  
  /**
   * Generates submission guide
   * 
   * @param {Object} metadata - Template metadata
   * @returns {string} Submission guide content
   */
  generateSubmissionGuide(metadata)
  
  /**
   * Generates PR description
   * 
   * @param {Object} metadata - Template metadata
   * @returns {string} PR description
   */
  generatePRDescription(metadata)
  
  /**
   * Generates review checklist
   * 
   * @param {Object} validationResult - Validation result
   * @returns {string} Review checklist
   */
  generateReviewChecklist(validationResult)
  
  /**
   * Generates usage example
   * 
   * @param {Object} metadata - Template metadata
   * @returns {string} Usage example
   */
  generateUsageExample(metadata)
}
```

**Export Package Structure**:
```
.sce/templates/exports/{template-name}/
├── requirements.md           # Template file with frontmatter
├── design.md                 # Template file with frontmatter
├── tasks.md                  # Template file with frontmatter
├── template-registry.json    # Registry entry
├── SUBMISSION_GUIDE.md       # Next steps for submission
├── PR_DESCRIPTION.md         # Draft PR description
├── REVIEW_CHECKLIST.md       # Items to verify
├── USAGE_EXAMPLE.md          # How to use the template
└── creation.log              # Creation log
```

**Responsibilities**:
- Create output directory structure
- Write all template files
- Generate registry entry
- Create documentation files
- Generate submission materials
- Log all operations

## Data Models

### SpecMetadata
```javascript
{
  specNumber: '23-00',
  specName: 'template-creation-from-spec',
  specNameTitle: 'Template Creation From Spec',
  specPath: '.sce/specs/23-00-template-creation-from-spec',
  author: 'John Doe',
  dates: {
    created: '2025-01-31',
    modified: '2025-01-31'
  }
}
```

### GeneralizationResult
```javascript
{
  files: {
    'requirements.md': {
      original: '...',
      generalized: '...',
      replacements: [
        { pattern: 'template-creation-from-spec', variable: '{{SPEC_NAME}}', count: 15 }
      ],
      flags: [
        { line: 42, content: 'Possible company name: Acme Corp', severity: 'warning' }
      ]
    },
    'design.md': { /* ... */ },
    'tasks.md': { /* ... */ }
  },
  summary: {
    totalReplacements: 45,
    totalFlags: 3
  }
}
```

### TemplateMetadata
```javascript
{
  name: 'template-creation-from-spec',
  description: 'Automates conversion of Specs into reusable templates',
  category: 'infrastructure',
  difficulty: 'intermediate',
  tags: ['templates', 'automation', 'cli', 'spec'],
  applicable_scenarios: [
    'Converting completed Specs to templates',
    'Sharing Spec patterns with team',
    'Building template library'
  ],
  author: 'John Doe',
  version: '1.0.0',
  min_sce_version: '1.16.0',
  created_at: '2025-01-31',
  updated_at: '2025-01-31'
}
```

### ValidationResult
```javascript
{
  valid: true,
  score: 95,
  breakdown: {
    structure: 30,
    frontmatter: 20,
    variables: 18,
    content: 19,
    references: 8
  },
  errors: [],
  warnings: [
    'Line 42 in requirements.md: Possible project-specific content'
  ],
  suggestions: [
    'Consider adding more applicable scenarios'
  ]
}
```

### ExportResult
```javascript
{
  success: true,
  outputDir: '.sce/templates/exports/template-creation-from-spec',
  filesCreated: [
    'requirements.md',
    'design.md',
    'tasks.md',
    'template-registry.json',
    'SUBMISSION_GUIDE.md',
    'PR_DESCRIPTION.md',
    'REVIEW_CHECKLIST.md',
    'USAGE_EXAMPLE.md',
    'creation.log'
  ],
  validation: { /* ValidationResult */ },
  metadata: { /* TemplateMetadata */ }
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Spec Validation Completeness

*For any* Spec identifier provided by the user, the system should validate that the Spec exists and contains all required files (requirements.md, design.md, tasks.md), and if any file is missing, should terminate with a clear error message listing the missing files.

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 2: Content Generalization Preservation

*For any* Spec content being generalized, the system should preserve the document structure, section headers, EARS patterns, requirement numbering, and formatting while replacing project-specific content with template variables.

**Validates: Requirements 2.8, 2.9**

### Property 3: Pattern-Based Generalization

*For any* Spec file content, when generalization patterns are applied (Spec name, dates, author, version, paths), all matching instances should be replaced with the corresponding template variables ({{SPEC_NAME}}, {{DATE}}, {{AUTHOR}}, {{VERSION}}, etc.).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

### Property 4: Ambiguous Content Flagging

*For any* content that matches ambiguous patterns (company names, product names, specific URLs, hardcoded values), the system should flag it in the validation report for manual review.

**Validates: Requirements 2.7**

### Property 5: Frontmatter Addition

*For any* template file (requirements.md, design.md, tasks.md), the system should add valid YAML frontmatter containing all required metadata fields (name, description, category, tags, author, version, min_sce_version, created_at) with proper syntax and delimiters, while preserving the original content below.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

### Property 6: Validation Execution

*For any* completed template generation, the system should run TemplateValidator on all generated files and produce a ValidationReport with pass/fail status, errors, warnings, and a quality score (0-100).

**Validates: Requirements 5.1, 5.6, 12.8**

### Property 7: Validation Comprehensiveness

*For any* template validation run, the system should check: required frontmatter fields, template variable syntax, template structure, EARS pattern preservation, requirement numbering consistency, internal reference integrity, YAML validity, category validity, and semver version format.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**

### Property 8: Export Package Completeness

*For any* template export, the system should create an output directory containing all template files (requirements.md, design.md, tasks.md), a template-registry.json entry, SUBMISSION_GUIDE.md, PR_DESCRIPTION.md, REVIEW_CHECKLIST.md, USAGE_EXAMPLE.md, and creation.log.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.9, 9.7**

### Property 9: Documentation Generation Completeness

*For any* generated USAGE_EXAMPLE.md file, the system should include example commands with the template name, a list of all template variables and their purposes, a description of what the template provides, and prerequisites/dependencies if detected.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

### Property 10: Error Handling Graceful Degradation

*For any* error during Spec validation, the system should display the specific failure and terminate gracefully; for errors during generalization, the system should log the error and continue with remaining files; for errors during export, the system should clean up partial files.

**Validates: Requirements 9.1, 9.2, 9.4**

### Property 11: Template Compatibility

*For any* exported template, the system should ensure it follows the same structure as official templates, passes TemplateValidator validation, is compatible with `sce templates apply` command, is compatible with `sce templates validate` command, uses kebab-case naming, and generates registry entries compatible with the template-registry.json schema.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6, 10.7**

### Property 12: Template Application Round-Trip

*For any* template created from a Spec, applying that template with `sce templates apply` should create a new Spec with the same structure and content (with variables replaced), demonstrating that the template creation and application processes are inverses.

**Validates: Requirements 10.3**

### Property 13: Preview Completeness

*For any* template creation with preview mode active, the system should display diffs for all files (requirements.md, design.md, tasks.md), highlight replaced content and template variables, and show flagged content that needs manual review.

**Validates: Requirements 7.2, 7.3, 7.4**

### Property 14: Progress Indication

*For any* long-running operation (reading Spec, generalization, validation, export), the system should display progress indicators to inform the user of current status.

**Validates: Requirements 11.9**

## Error Handling

### Error Categories

**1. Input Validation Errors**
- Invalid Spec identifier
- Spec not found
- Missing required files
- Invalid metadata format (non-kebab-case name, invalid semver)

**2. Generalization Errors**
- File read errors
- Pattern matching failures
- Content encoding issues

**3. Validation Errors**
- Invalid YAML frontmatter
- Missing required fields
- Invalid template variable syntax
- Broken internal references
- Project-specific content remaining

**4. Export Errors**
- Output directory already exists
- File write permissions
- Disk space issues

**5. Integration Errors**
- TemplateValidator failures
- Git config unavailable (for author name)

### Error Handling Strategies

**Fail Fast**:
- Spec validation errors → Terminate immediately with clear message
- Invalid metadata input → Prompt for correction or cancel
- Output directory exists → Ask user for action (overwrite/rename/cancel)

**Graceful Degradation**:
- Generalization errors → Log error, continue with remaining files
- Author name unavailable → Use "Unknown" as default
- Tag suggestion failures → Proceed without suggestions

**Cleanup on Failure**:
- Export errors → Remove partial output directory
- Validation failures → Offer to export with warnings or cancel

**Logging**:
- All operations logged to creation.log
- Error context included (file, line, operation)
- Timestamps for debugging

### Error Messages

**Format**:
```
❌ Error: [Brief description]

Details:
  - [Specific detail 1]
  - [Specific detail 2]

Suggestion: [How to fix]
```

**Examples**:
```
❌ Error: Spec not found

Details:
  - Identifier: 99-00-nonexistent
  - Searched in: .sce/specs/

Suggestion: Run 'sce specs list' to see available Specs
```

```
❌ Error: Missing required files

Details:
  - Spec: 23-00-template-creation-from-spec
  - Missing: design.md, tasks.md

Suggestion: Complete the Spec before creating a template
```

## Testing Strategy

### Dual Testing Approach

This feature requires both **unit tests** and **property-based tests** for comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
- Test CLI argument parsing with various flag combinations
- Test metadata collection with valid and invalid inputs
- Test YAML frontmatter generation with special characters
- Test error handling for specific failure scenarios
- Test file I/O operations with mocked filesystem

**Property-Based Tests**: Verify universal properties across all inputs
- Generate random Spec structures and verify validation
- Generate random content and verify generalization patterns
- Generate random metadata and verify frontmatter generation
- Generate random template variables and verify syntax validation
- Test round-trip property (create template → apply template → verify equivalence)

### Property-Based Testing Configuration

**Library**: Use `fast-check` for JavaScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: template-creation-from-spec, Property N: [property text]`
- Seed-based reproducibility for failed tests

**Example Property Test**:
```javascript
// Feature: template-creation-from-spec, Property 3: Pattern-Based Generalization
test('generalization replaces all pattern instances', () => {
  fc.assert(
    fc.property(
      fc.record({
        specName: fc.stringOf(fc.constantFrom('a-z', '0-9', '-'), { minLength: 5 }),
        content: fc.string({ minLength: 100 }),
        date: fc.date()
      }),
      ({ specName, content, date }) => {
        // Insert spec name into content
        const contentWithSpec = content + ` ${specName} ` + specName;
        
        // Generalize
        const result = generalizer.generalize(contentWithSpec, { specName, date });
        
        // Verify all instances replaced
        expect(result.generalized).not.toContain(specName);
        expect(result.generalized).toContain('{{SPEC_NAME}}');
      }
    ),
    { numRuns: 100 }
  );
});
```

### Test Coverage Goals

- **Unit Test Coverage**: 80%+ line coverage
- **Property Test Coverage**: All 14 correctness properties implemented
- **Integration Tests**: End-to-end workflow tests
- **Edge Cases**: Empty files, special characters, large files, malformed YAML

### Testing Phases

**Phase 1: Component Testing**
- Test each component in isolation (SpecReader, ContentGeneralizer, etc.)
- Mock dependencies
- Focus on unit tests

**Phase 2: Integration Testing**
- Test component interactions
- Test full workflow with real Specs
- Test CLI interface

**Phase 3: Property Testing**
- Implement all 14 property-based tests
- Run with high iteration counts (1000+)
- Verify round-trip properties

**Phase 4: Validation Testing**
- Test with official templates from registry
- Verify compatibility with existing template system
- Test template application after creation

## Implementation Notes

### Reusing Existing Infrastructure

**From Spec 22-00**:
- `TemplateValidator`: Reuse for validation (extend with additional checks)
- `TemplateApplicator`: Use for testing round-trip property
- `RegistryParser`: Reuse for generating registry entries
- `PathUtils`: Reuse for path handling
- `TemplateError`: Reuse for error handling

**Extension Points**:
- Extend `TemplateValidator` with project-specific content detection
- Add quality score calculation to `TemplateValidator`
- Add generalization-specific validation rules

### CLI Integration

**Command Structure**:
```bash
sce templates create-from-spec [options]

Options:
  --spec <identifier>      Spec to convert (number or name)
  --output <path>          Custom output directory
  --preview                Show diff before export
  --dry-run                Simulate without writing files
  --interactive=false      Use defaults for all prompts
  --help                   Display help information
```

**Implementation**:
- Add new command to `lib/commands/templates.js`
- Create `lib/templates/template-creator.js` as main orchestrator
- Create component files in `lib/templates/` directory

### Performance Considerations

**Optimization Strategies**:
- Stream large files instead of loading entirely into memory
- Cache compiled regex patterns
- Parallelize file processing where possible
- Use incremental validation (fail fast on critical errors)

**Expected Performance**:
- Small Specs (< 1000 lines): < 2 seconds
- Medium Specs (1000-5000 lines): < 5 seconds
- Large Specs (> 5000 lines): < 10 seconds

### Security Considerations

**Input Validation**:
- Sanitize Spec identifier to prevent path traversal
- Validate output directory path
- Limit file sizes to prevent DoS

**Output Safety**:
- Never overwrite without confirmation
- Validate YAML to prevent injection
- Sanitize user-provided metadata

### Extensibility

**Future Enhancements**:
- Support for custom generalization patterns (user-defined)
- AI-assisted content generalization (detect project-specific content)
- Template versioning and updates
- Batch template creation from multiple Specs
- Template testing framework (automated quality checks)

---

**Version**: 1.0.0  
**Created**: 2025-01-31  
**Author**: sce-team
