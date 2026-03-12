# Implementation Plan: Template Creation from Existing Spec

## Overview

This implementation plan breaks down the template creation feature into discrete, manageable tasks. The approach follows a bottom-up strategy: build core components first, then integrate them into the orchestrator, and finally wire everything together through the CLI interface. Each task builds on previous work, ensuring incremental progress and early validation.

**Implementation Strategy**:
1. **Foundation**: Create core utility components (SpecReader, ContentGeneralizer)
2. **Metadata & Output**: Build metadata collection and frontmatter generation
3. **Validation & Export**: Extend validation and implement export functionality
4. **Orchestration**: Create the main TemplateCreator orchestrator
5. **CLI Integration**: Wire everything into the CLI command
6. **Testing & Documentation**: Add comprehensive tests and documentation

## Tasks

- [x] 1. Set up project structure and core interfaces
  - Create directory structure for new components
  - Define shared interfaces and types
  - Set up test infrastructure for new components
  - _Requirements: 10.5_

- [ ] 2. Implement SpecReader component
  - [x] 2.1 Create SpecReader class with Spec discovery
    - Implement `findSpec(identifier)` to locate Specs by number or name
    - Support both formats: "23-00" and "template-creation-from-spec"
    - Handle case-insensitive matching
    - _Requirements: 1.1, 1.2_
  
  - [x] 2.2 Implement Spec structure validation
    - Implement `validateSpecStructure(specPath)` to check for required files
    - Verify requirements.md, design.md, tasks.md exist
    - Return detailed validation result with missing files
    - _Requirements: 1.3, 1.4_
  
  - [x] 2.3 Implement Spec file reading
    - Implement `readSpecFiles(specPath)` to read all Spec files
    - Handle file encoding (UTF-8)
    - Return file contents as object
    - _Requirements: 1.3_
  
  - [x] 2.4 Implement metadata extraction
    - Implement `extractSpecMetadata(specPath, fileContents)` to extract Spec info
    - Extract Spec number, name, title-case name
    - Extract dates from file metadata or content
    - Extract author from git config or content
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [ ]* 2.5 Write property test for SpecReader
    - **Property 1: Spec Validation Completeness**
    - **Validates: Requirements 1.2, 1.3, 1.4**

- [ ] 3. Implement ContentGeneralizer component
  - [x] 3.1 Create ContentGeneralizer class with pattern definitions
    - Define generalization patterns (SPEC_NAME, DATE, AUTHOR, VERSION, paths)
    - Create regex patterns for each variable type
    - Implement pattern priority and context awareness
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 3.2 Implement replacement map builder
    - Implement `buildReplacementMap(specMetadata)` to create replacement patterns
    - Map Spec metadata to template variables
    - Handle special cases (title-case conversion, date formatting)
    - _Requirements: 2.1, 2.2_
  
  - [x] 3.3 Implement pattern application
    - Implement `applyPatterns(content, replacements)` to replace content
    - Apply patterns while preserving structure
    - Track all replacements for reporting
    - Handle edge cases (code blocks, URLs)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 3.4 Implement ambiguous content detection
    - Implement `detectAmbiguousContent(content)` to flag uncertain content
    - Detect company names, product names, specific URLs
    - Detect hardcoded configuration values
    - Return flagged items with line numbers and severity
    - _Requirements: 2.7_
  
  - [x] 3.5 Implement main generalization method
    - Implement `generalize(fileContents, specMetadata)` as main entry point
    - Process all files (requirements.md, design.md, tasks.md)
    - Preserve document structure and EARS patterns
    - Return generalized content and flags
    - _Requirements: 2.8, 2.9_
  
  - [ ]* 3.6 Write property test for ContentGeneralizer
    - **Property 2: Content Generalization Preservation**
    - **Property 3: Pattern-Based Generalization**
    - **Validates: Requirements 2.1-2.9**

- [ ] 4. Implement MetadataCollector component
  - [x] 4.1 Create MetadataCollector class with prompt infrastructure
    - Set up inquirer for interactive prompts
    - Define category list and validation rules
    - Implement non-interactive mode support
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.9_
  
  - [x] 4.2 Implement individual metadata prompts
    - Implement `promptTemplateName(defaultName)` with kebab-case validation
    - Implement `promptDescription()` with length validation
    - Implement `promptCategory()` with predefined list
    - Implement `promptTags(suggestedTags)` with comma-separated parsing
    - Implement prompts for author, version, min_sce_version with defaults
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8_
  
  - [x] 4.3 Implement tag suggestion
    - Implement `suggestTags(fileContents)` to analyze content
    - Extract keywords from requirements and design
    - Suggest relevant tags based on content analysis
    - _Requirements: 3.5_
  
  - [x] 4.4 Implement metadata validation
    - Implement `validateMetadata(metadata)` to check completeness
    - Validate kebab-case format for name
    - Validate semver format for version
    - Validate category is in allowed list
    - _Requirements: 3.10, 12.6, 12.7_
  
  - [x] 4.5 Implement main collection method
    - Implement `collectMetadata(specMetadata, interactive)` as main entry point
    - Handle interactive and non-interactive modes
    - Display summary and ask for confirmation
    - Return complete metadata object
    - _Requirements: 3.9, 3.10_
  
  - [ ]* 4.6 Write unit tests for MetadataCollector
    - Test prompt validation (kebab-case, semver)
    - Test tag suggestion algorithm
    - Test interactive and non-interactive modes
    - _Requirements: 3.1-3.10_

- [ ] 5. Implement FrontmatterGenerator component
  - [x] 5.1 Create FrontmatterGenerator class
    - Implement YAML generation utilities
    - Handle array formatting for tags and scenarios
    - Implement string escaping for YAML
    - _Requirements: 4.4, 4.5, 4.6_
  
  - [x] 5.2 Implement frontmatter generation
    - Implement `generateFrontmatter(metadata)` to create YAML block
    - Include all required fields
    - Format dates in ISO 8601
    - Add proper delimiters (---)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [x] 5.3 Implement frontmatter addition
    - Implement `addFrontmatter(content, frontmatter)` to prepend YAML
    - Preserve original content
    - Handle existing frontmatter (replace if exists)
    - _Requirements: 4.7_
  
  - [x] 5.4 Implement YAML validation
    - Implement `validateYaml(yaml)` to check syntax
    - Verify proper structure
    - Return validation errors if any
    - _Requirements: 4.6, 12.5_
  
  - [ ]* 5.5 Write property test for FrontmatterGenerator
    - **Property 5: Frontmatter Addition**
    - **Validates: Requirements 4.1-4.7**

- [ ] 6. Extend TemplateValidator for template creation
  - [ ] 6.1 Add project-specific content detection
    - Extend validator to detect remaining project-specific content
    - Use high-confidence patterns (specific paths, names)
    - Flag suspicious content for review
    - _Requirements: 5.5_
  
  - [ ] 6.2 Add template variable syntax validation
    - Verify all variables use {{VARIABLE_NAME}} format
    - Check for malformed variables
    - Ensure no unescaped braces
    - _Requirements: 5.3, 12.3_
  
  - [ ] 6.3 Add EARS pattern preservation check
    - Verify EARS patterns are intact after generalization
    - Check requirement numbering consistency
    - Validate internal references
    - _Requirements: 12.1, 12.2, 12.4_
  
  - [ ] 6.4 Implement quality score calculation
    - Calculate score based on: structure (30), frontmatter (20), variables (20), content (20), references (10)
    - Return score breakdown
    - Provide improvement suggestions
    - _Requirements: 12.8_
  
  - [ ]* 6.5 Write property test for extended validation
    - **Property 7: Validation Comprehensiveness**
    - **Validates: Requirements 5.2-5.5, 12.1-12.7**

- [ ] 7. Implement TemplateExporter component
  - [x] 7.1 Create TemplateExporter class with directory management
    - Implement `createOutputDirectory(outputDir)` to create structure
    - Handle existing directory conflicts
    - Create subdirectories as needed
    - _Requirements: 6.1, 9.5_
  
  - [x] 7.2 Implement template file writing
    - Implement `writeTemplateFiles(fileContents, outputDir)` to write files
    - Write requirements.md, design.md, tasks.md with frontmatter
    - Handle file encoding (UTF-8)
    - Return list of written files
    - _Requirements: 6.2_
  
  - [x] 7.3 Implement registry entry generation
    - Implement `generateRegistryEntry(metadata)` to create JSON entry
    - Follow template-registry.json schema
    - Include all required fields
    - _Requirements: 6.3, 10.7_
  
  - [x] 7.4 Implement documentation generation
    - Implement `generateSubmissionGuide(metadata)` for next steps
    - Implement `generatePRDescription(metadata)` for draft PR
    - Implement `generateReviewChecklist(validationResult)` for verification
    - Implement `generateUsageExample(metadata)` for template usage
    - _Requirements: 6.4, 6.5, 6.6, 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 7.5 Implement creation logging
    - Log all operations to creation.log
    - Include timestamps and operation details
    - Log errors and warnings
    - _Requirements: 9.7_
  
  - [x] 7.6 Implement main export method
    - Implement `exportTemplate(templateData, outputDir)` as main entry point
    - Coordinate all export operations
    - Handle errors and cleanup on failure
    - Display export summary
    - _Requirements: 6.7, 6.9, 9.4_
  
  - [ ]* 7.7 Write property test for TemplateExporter
    - **Property 8: Export Package Completeness**
    - **Property 9: Documentation Generation Completeness**
    - **Validates: Requirements 6.1-6.9, 8.1-8.5, 9.7**

- [ ] 8. Implement TemplateCreator orchestrator
  - [x] 8.1 Create TemplateCreator class with component initialization
    - Initialize all components (SpecReader, ContentGeneralizer, etc.)
    - Set up configuration and options
    - Implement error handling infrastructure
    - _Requirements: 9.1, 9.2, 9.4_
  
  - [x] 8.2 Implement workflow orchestration
    - Implement `createTemplate(options)` as main workflow method
    - Coordinate: read Spec → generalize → collect metadata → generate frontmatter → validate → export
    - Handle progress indicators
    - Return creation result
    - _Requirements: 1.1-12.8_
  
  - [x] 8.3 Implement preview functionality
    - Implement `showPreview(originalContent, generalizedContent)` to display diff
    - Show changes for each file
    - Highlight replacements and flagged content
    - Ask for confirmation before proceeding
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 8.4 Implement dry-run mode
    - Support --dry-run flag to simulate without writing
    - Execute all operations except file writing
    - Display what would be created
    - _Requirements: 7.6_
  
  - [x] 8.5 Implement error recovery
    - Handle validation failures with user choice (export anyway or cancel)
    - Handle metadata collection errors with retry
    - Clean up partial files on export failure
    - _Requirements: 9.3, 9.4, 9.6_
  
  - [ ]* 8.6 Write property test for TemplateCreator
    - **Property 10: Error Handling Graceful Degradation**
    - **Validates: Requirements 9.1, 9.2, 9.4**

- [ ] 9. Checkpoint - Ensure core components work together
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement CLI integration
  - [x] 10.1 Add create-from-spec command to CLI
    - Add command to lib/commands/templates.js
    - Define command structure and help text
    - Parse command-line arguments
    - _Requirements: 11.1, 11.7, 11.8_
  
  - [x] 10.2 Implement CLI flag handling
    - Support --spec flag for Spec identifier
    - Support --output flag for custom directory
    - Support --preview flag for diff display
    - Support --dry-run flag for simulation
    - Support --interactive=false flag for defaults
    - Support --help flag for usage information
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [x] 10.3 Implement CLI output formatting
    - Display progress indicators with spinners
    - Use colors for success/error/warning messages
    - Format validation reports
    - Display export summary
    - _Requirements: 11.9_
  
  - [x] 10.4 Wire TemplateCreator to CLI command
    - Instantiate TemplateCreator with CLI options
    - Call createTemplate() method
    - Handle results and errors
    - Display final report
    - _Requirements: 11.1-11.10_
  
  - [ ]* 10.5 Write integration tests for CLI
    - Test command execution with various flags
    - Test error handling and user prompts
    - Test output formatting
    - _Requirements: 11.1-11.10_

- [ ] 11. Implement template compatibility validation
  - [ ] 11.1 Add compatibility checks
    - Verify exported template structure matches official templates
    - Test with TemplateValidator from Spec 22-00
    - Ensure kebab-case naming
    - Verify registry entry schema
    - _Requirements: 10.1, 10.2, 10.4, 10.6, 10.7_
  
  - [ ]* 11.2 Write property test for template compatibility
    - **Property 11: Template Compatibility**
    - **Property 12: Template Application Round-Trip**
    - **Validates: Requirements 10.1-10.7**
    - Test: create template → apply template → verify structure

- [ ] 12. Add comprehensive documentation
  - [ ] 12.1 Create user documentation
    - Document command usage and examples
    - Document all CLI flags
    - Document workflow and best practices
    - Add troubleshooting guide
    - _Requirements: 11.7, 11.8_
  
  - [ ] 12.2 Create developer documentation
    - Document component architecture
    - Document extension points
    - Document generalization patterns
    - Add API documentation
    - _Requirements: 10.5_
  
  - [ ] 12.3 Update main README
    - Add template creation section
    - Add examples and screenshots
    - Link to detailed documentation
    - _Requirements: 11.7, 11.8_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Integration testing with real Specs
  - [ ] 14.1 Test with completed Specs from repository
    - Test with Spec 22-00 (template library)
    - Test with Spec 21-00 (gitignore auto-fix)
    - Test with Spec 20-00 (environment configuration)
    - Verify generated templates are valid
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [ ] 14.2 Test template application round-trip
    - Create template from Spec
    - Apply template to create new Spec
    - Verify structure and content
    - Verify variables are replaced correctly
    - _Requirements: 10.3_
  
  - [ ]* 14.3 Write end-to-end integration tests
    - Test complete workflow from CLI to export
    - Test with various Spec structures
    - Test error scenarios
    - _Requirements: 1.1-12.8_

- [ ] 15. Performance optimization and polish
  - [ ] 15.1 Optimize file processing
    - Stream large files instead of loading into memory
    - Cache compiled regex patterns
    - Parallelize file processing where possible
    - _Requirements: Performance considerations_
  
  - [ ] 15.2 Add progress indicators for long operations
    - Show progress during file reading
    - Show progress during generalization
    - Show progress during validation
    - Show progress during export
    - _Requirements: 11.9_
  
  - [ ] 15.3 Polish user experience
    - Improve error messages
    - Add helpful suggestions
    - Improve output formatting
    - Add confirmation prompts where appropriate
    - _Requirements: 9.1, 9.3, 9.5, 9.6_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- The implementation follows a bottom-up approach: components first, then orchestration, then CLI integration

---

**Version**: 1.0.0  
**Created**: 2025-01-31  
**Author**: sce-team
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
