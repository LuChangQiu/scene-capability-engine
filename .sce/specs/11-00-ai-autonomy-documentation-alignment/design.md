# Design Document

## Overview

This design transforms kiro-spec-engine's documentation from a manual, tool-centric approach to an AI-autonomy-focused approach. The core insight is that users express intent to AI agents, and AI agents autonomously use sce as invisible infrastructure. This design provides a systematic approach to audit, classify, and update all documentation files while preserving technical accuracy.

The transformation affects 40+ documentation files across English and Chinese versions, requiring careful coordination to maintain consistency while changing perspective from "you run commands" to "AI handles this for you."

## Architecture

### High-Level Architecture

```
Documentation Transformation System
├── Audit Module
│   ├── Pattern Scanner (identifies manual language)
│   ├── File Classifier (severity assessment)
│   └── Report Generator (audit results)
├── Transformation Module
│   ├── Language Transformer (manual → autonomy)
│   ├── Structure Reorganizer (guide restructuring)
│   └── Consistency Validator (cross-file checks)
├── Validation Module
│   ├── Pattern Validator (no prohibited patterns)
│   ├── Alignment Checker (EN/ZH consistency)
│   └── Compliance Reporter (final validation)
└── Style Guide Module
    ├── Principle Definer (autonomy standards)
    ├── Example Generator (before/after patterns)
    └── Guideline Publisher (future reference)
```

### Design Principles

1. **Perspective Shift**: Change from "user executes" to "AI executes for user"
2. **Technical Preservation**: Maintain all command reference and technical details
3. **Systematic Transformation**: Process files in order of user impact (README first)
4. **Bilingual Consistency**: Ensure English and Chinese convey equivalent messages
5. **Future-Proof**: Create style guide to maintain standards for new documentation

## Components and Interfaces

### 1. Audit Module

**Purpose**: Identify all instances of manual-centric language across documentation

**Components**:

**Pattern Scanner**:
- Scans all .md files for prohibited patterns
- Patterns to detect:
  - `run \`sce create-spec\``
  - `you create/run/execute/manually`
  - `Step 1:`, `Step 2:` (manual instructions)
  - `First, run...`, `Then, execute...`
- Returns: List of (file, line_number, pattern, context)

**File Classifier**:
- Classifies files by impact severity:
  - **High**: README.md, README.zh.md, docs/getting-started.md (first impression)
  - **Medium**: Tool guides, workflow guides (frequent reference)
  - **Low**: FAQ, troubleshooting (occasional reference)
- Returns: Prioritized file list

**Report Generator**:
- Generates markdown report with:
  - Summary statistics (files affected, patterns found)
  - File-by-file breakdown with line numbers
  - Severity classification
  - Recommended transformation order
- Output: `reports/audit-report.md`

### 2. Transformation Module

**Purpose**: Convert manual-centric language to AI-autonomy-focused language

**Components**:

**Language Transformer**:
- Transformation rules:
  - `"you create Specs"` → `"AI creates Specs for you based on your intent"`
  - `"run \`sce create-spec\`"` → `"tell AI to create a Spec, and it will use sce autonomously"`
  - `"Step 1: Run X"` → `"AI will: [describe outcome]"`
  - `"manually edit"` → `"AI generates and refines"`
  - `"you execute"` → `"AI executes autonomously"`
- Preserves technical details in reference sections
- Maintains code examples but changes framing

**Structure Reorganizer**:
- Restructures tool guides:
  - Before: "How to Use" → "Step 1, 2, 3"
  - After: "What This Enables" → "AI Capabilities" → "Technical Reference"
- Restructures workflow guides:
  - Before: "Manual Checklist" → "[ ] Do X, [ ] Do Y"
  - After: "Methodology Overview" → "What AI Does" → "Expected Outcomes"
- Maintains all technical information in reorganized structure

**Consistency Validator**:
- Cross-file consistency checks:
  - Terminology consistency (e.g., "AI agent" vs "AI assistant")
  - Message consistency (same concepts described similarly)
  - Structure consistency (similar sections across tool guides)
- Returns: List of inconsistencies to resolve

### 3. Validation Module

**Purpose**: Ensure all documentation meets AI autonomy standards

**Components**:

**Pattern Validator**:
- Validates no prohibited patterns remain:
  - No `run \`sce create-spec\``
  - No `you manually create`
  - No `Step 1, Step 2` manual instructions
  - No `First, run...` command sequences
- Returns: Pass/fail with remaining violations

**Alignment Checker**:
- Validates English/Chinese alignment:
  - Same section structure
  - Equivalent content coverage
  - Consistent AI autonomy messaging
  - Culturally appropriate translations
- Returns: List of alignment issues

**Compliance Reporter**:
- Generates final compliance report:
  - All files validated
  - Pattern validation results
  - Alignment validation results
  - Overall compliance status
- Output: `reports/compliance-report.md`

### 4. Style Guide Module

**Purpose**: Create documentation standards for future consistency

**Components**:

**Principle Definer**:
- Defines core principles:
  - AI Autonomy Principle: Users express intent, AI executes
  - Technical Preservation Principle: Maintain all reference information
  - Perspective Principle: Describe what AI does, not what user does
  - Consistency Principle: Uniform messaging across all docs

**Example Generator**:
- Creates before/after examples:
  - Common patterns (command execution, Spec creation, workflow steps)
  - Tool guide structures
  - Workflow guide structures
  - FAQ answer patterns
  - Troubleshooting guidance patterns

**Guideline Publisher**:
- Creates comprehensive style guide:
  - Prohibited language patterns
  - Preferred language patterns
  - Structure templates for different doc types
  - English/Chinese translation guidelines
  - Technical reference vs. user guidance balance
- Output: `docs/DOCUMENTATION_STYLE_GUIDE.md`

## Data Models

### Audit Result

```javascript
{
  file: string,              // File path
  severity: 'high' | 'medium' | 'low',
  patterns: [
    {
      line: number,
      pattern: string,       // Pattern matched
      context: string,       // Surrounding text
      suggestion: string     // Transformation suggestion
    }
  ],
  statistics: {
    totalPatterns: number,
    manualCommands: number,
    manualSteps: number,
    youLanguage: number
  }
}
```

### Transformation Rule

```javascript
{
  pattern: RegExp,           // Pattern to match
  replacement: string | Function,  // Replacement text or function
  context: 'tool-guide' | 'workflow' | 'faq' | 'general',
  preserveTechnical: boolean,  // Whether to preserve technical details
  examples: [
    {
      before: string,
      after: string
    }
  ]
}
```

### Validation Result

```javascript
{
  file: string,
  passed: boolean,
  violations: [
    {
      type: 'prohibited-pattern' | 'inconsistency' | 'alignment',
      line: number,
      description: string,
      severity: 'error' | 'warning'
    }
  ],
  suggestions: string[]
}
```

### Style Guide Entry

```javascript
{
  category: 'language' | 'structure' | 'translation',
  principle: string,
  prohibited: string[],      // Patterns to avoid
  preferred: string[],       // Patterns to use
  examples: [
    {
      scenario: string,
      before: string,
      after: string,
      explanation: string
    }
  ],
  applicableTo: string[]     // Doc types this applies to
}
```

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Comprehensive Pattern Detection

*For any* set of documentation files containing manual-centric language patterns (manual Spec creation instructions, "you create/run/execute" language, or step-by-step command tutorials), the audit scanner should identify all instances with correct file paths, line numbers, and pattern types.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: File Classification Consistency

*For any* documentation file, the classifier should assign the same severity level (high/medium/low) based on its path and purpose, regardless of when or how many times classification is performed.

**Validates: Requirements 1.4**

### Property 3: Audit Report Completeness

*For any* audit result, the generated report should contain all affected files, all pattern instances with line numbers, and severity classifications without omission.

**Validates: Requirements 1.5**

### Property 4: Tool Guide Transformation Consistency

*For any* set of tool guide files, after transformation all guides should: (1) contain no "Step 1, Step 2" patterns, (2) use "what AI does" language instead of "how you run" language, (3) show AI agent usage patterns in examples, and (4) maintain consistent structure across all files.

**Validates: Requirements 4.1, 4.2, 4.3, 4.5**

### Property 5: Workflow Guide Transformation

*For any* workflow guide file, after transformation it should contain outcome-focused descriptions instead of manual checklists, and emphasize "what AI does for you" over "what you must do."

**Validates: Requirements 5.1, 5.2**

### Property 6: Support Documentation Transformation

*For any* support documentation file (FAQ or troubleshooting), after transformation answers should describe what AI will do to resolve issues rather than direct command instructions, and focus on symptom description rather than manual diagnostic steps.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 7: English-Chinese Alignment

*For any* English documentation file with a corresponding Chinese version, both files should: (1) have the same section structure, (2) cover equivalent content, and (3) be correctly identified as corresponding pairs by the system.

**Validates: Requirements 7.1, 7.3, 7.5, 8.4**

### Property 8: Prohibited Pattern Elimination

*For any* documentation file after validation, it should contain no instances of prohibited patterns including "run \`sce create-spec\`" or "you create/run/execute" language, and should contain AI-centric language instead.

**Validates: Requirements 8.1, 8.2**

### Property 9: Validation Report Completeness

*For any* completed validation, the compliance report should include validation results for all documentation files, pattern validation status, alignment validation status, and overall compliance determination.

**Validates: Requirements 8.5**

## Error Handling

### Pattern Detection Errors

**File Access Errors**:
- If a file cannot be read, log the error and continue with other files
- Include inaccessible files in the audit report with error status
- Do not fail the entire audit due to one file error

**Pattern Matching Errors**:
- If a regex pattern is malformed, log the error and skip that pattern
- Continue with other patterns
- Report pattern errors in the audit summary

**Encoding Errors**:
- If a file has encoding issues, attempt UTF-8, then GB2312 (for Chinese), then report error
- Include encoding errors in the audit report
- Do not skip files due to encoding issues without attempting multiple encodings

### Transformation Errors

**Backup Failures**:
- Before any transformation, create backups of all files
- If backup fails, abort transformation for that file
- Report backup failures and do not proceed without successful backup

**Transformation Failures**:
- If a transformation rule fails, log the error with context
- Revert to backup for that file
- Continue with other files
- Report all transformation failures in summary

**Validation Failures**:
- If validation detects remaining prohibited patterns, report them clearly
- Do not mark transformation as complete if validation fails
- Provide specific line numbers and suggestions for manual review

### Alignment Errors

**Missing Correspondence**:
- If an English file has no Chinese counterpart, report it as a gap
- If a Chinese file has no English counterpart, report it as orphaned
- Include correspondence gaps in the alignment report

**Structure Mismatch**:
- If English and Chinese files have different section structures, report the differences
- Provide suggestions for alignment
- Do not automatically modify structure without review

### Style Guide Errors

**Incomplete Guidelines**:
- If any required section is missing from the style guide, report it
- Do not publish incomplete style guide
- Ensure all example categories are covered

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

**Unit Tests**: Focus on specific examples, edge cases, and error conditions:
- Specific pattern detection examples (e.g., detecting "run \`sce create-spec\`")
- Specific transformation examples (e.g., transforming a known manual instruction)
- Error handling scenarios (file not found, encoding errors)
- Report generation with known inputs
- Style guide structure validation

**Property Tests**: Verify universal properties across all inputs:
- Pattern detection completeness across random documentation sets
- Classification consistency across multiple runs
- Transformation consistency across all tool guides
- Alignment verification across EN/ZH file pairs
- Validation completeness across all documentation

### Property-Based Testing Configuration

**Testing Library**: Use `fast-check` for JavaScript property-based testing

**Test Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: ai-autonomy-documentation-alignment, Property {number}: {property_text}`
- Generate random documentation content with known patterns
- Generate random file structures for classification testing
- Generate random transformation scenarios

**Example Property Test Structure**:
```javascript
// Feature: ai-autonomy-documentation-alignment, Property 1: Comprehensive Pattern Detection
fc.assert(
  fc.property(
    fc.array(documentationFileGenerator()),
    (files) => {
      const auditResult = auditModule.scan(files);
      const expectedPatterns = countKnownPatterns(files);
      return auditResult.patterns.length === expectedPatterns;
    }
  ),
  { numRuns: 100 }
);
```

### Test Coverage Requirements

**Pattern Detection**:
- Unit tests: 10+ specific pattern examples
- Property tests: Random documentation with varying pattern densities
- Edge cases: Empty files, files with only patterns, files with no patterns

**Transformation**:
- Unit tests: 20+ before/after transformation pairs
- Property tests: Random documentation transformations with validation
- Edge cases: Files with mixed manual/autonomy language, files with technical references

**Validation**:
- Unit tests: Known valid and invalid documentation
- Property tests: Random documentation with validation rules
- Edge cases: Partially transformed files, files with edge-case patterns

**Alignment**:
- Unit tests: Known EN/ZH file pairs
- Property tests: Random file pairs with structure variations
- Edge cases: Missing files, orphaned files, mismatched structures

### Integration Testing

**End-to-End Workflow**:
1. Run audit on actual documentation
2. Apply transformations
3. Validate results
4. Generate reports
5. Verify all files pass validation

**Regression Testing**:
- Maintain snapshot of current documentation state
- After transformation, verify no technical information is lost
- Compare before/after for technical accuracy preservation

### Manual Validation

**Human Review Required**:
- Sample 10% of transformed files for manual review
- Verify AI autonomy messaging is clear and natural
- Verify technical accuracy is preserved
- Verify Chinese translations are culturally appropriate
- Verify style guide is comprehensive and usable

## Implementation Notes

### Transformation Order

1. **Phase 1: High-Impact Files** (README.md, README.zh.md)
   - These create first impressions
   - Transform and validate before proceeding

2. **Phase 2: Tool Guides** (docs/tools/*.md)
   - Transform all 6 guides consistently
   - Validate consistency across guides

3. **Phase 3: Workflow Guides** (docs/spec-workflow.md, docs/manual-workflows-guide.md)
   - Transform methodology descriptions
   - Validate outcome-focused language

4. **Phase 4: Support Docs** (docs/faq.md, docs/troubleshooting.md)
   - Transform Q&A and troubleshooting guidance
   - Validate AI-directed solutions

5. **Phase 5: Chinese Versions** (All *.zh.md files)
   - Transform with cultural appropriateness
   - Validate alignment with English versions

6. **Phase 6: Style Guide** (docs/DOCUMENTATION_STYLE_GUIDE.md)
   - Create comprehensive guide
   - Include all learned patterns and principles

### Backup Strategy

- Create `.backup/` directory before any transformation
- Copy all documentation files to backup
- Include timestamp in backup directory name
- Provide rollback script if needed

### Incremental Validation

- Validate after each phase
- Do not proceed to next phase if validation fails
- Generate phase-specific reports
- Allow for manual review between phases

### Style Guide Structure

```markdown
# Documentation Style Guide

## Core Principles
- AI Autonomy Principle
- Technical Preservation Principle
- Perspective Principle
- Consistency Principle

## Language Patterns

### Prohibited Patterns
- [List with examples]

### Preferred Patterns
- [List with examples]

## Document Type Templates

### Tool Guides
- Structure template
- Language guidelines
- Example transformations

### Workflow Guides
- Structure template
- Language guidelines
- Example transformations

### Support Documentation
- Structure template
- Language guidelines
- Example transformations

## Translation Guidelines

### English-Chinese Consistency
- Terminology mapping
- Cultural adaptation guidelines
- Structure alignment rules

## Before/After Examples

### [Category 1]
- Scenario
- Before
- After
- Explanation

[Continue for all categories]
```
