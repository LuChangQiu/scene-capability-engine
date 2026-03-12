# Requirements Document: Template Creation from Existing Spec

## Introduction

This feature enables users to automatically convert their completed Specs into reusable templates that can be shared with the community. Currently, creating templates from Specs is a manual, error-prone process involving copying files, generalizing content, adding metadata, and submitting to the template repository. This feature automates the entire workflow through a CLI command `sce templates create-from-spec`, reducing the time from hours to minutes and ensuring consistency across all community-contributed templates.

## Glossary

- **Spec**: A feature specification in the `.sce/specs/` directory containing requirements.md, design.md, and tasks.md files
- **Template**: A generalized, reusable Spec with YAML frontmatter metadata and template variables
- **Template_Variable**: A placeholder in the format `{{VARIABLE_NAME}}` that gets replaced during template application
- **YAML_Frontmatter**: Metadata block at the beginning of template files enclosed in `---` markers
- **Template_Registry**: The template-registry.json file that catalogs all available templates
- **Generalization**: The process of replacing project-specific content with template variables
- **TemplateCreator**: The system component responsible for converting Specs to templates
- **ValidationReport**: A report showing whether the generated template meets all quality standards
- **ExportPackage**: The complete set of files ready for submission to the template repository

## Requirements

### Requirement 1: Spec Selection and Validation

**User Story:** As a developer, I want to select a completed Spec to convert into a template, so that I can share my work with the community.

#### Acceptance Criteria

1. WHEN a user runs `sce templates create-from-spec`, THE System SHALL prompt for the Spec identifier (number or name)
2. WHEN a user provides a Spec identifier, THE System SHALL validate that the Spec exists in `.sce/specs/`
3. WHEN a Spec is selected, THE System SHALL verify that requirements.md, design.md, and tasks.md files exist
4. IF any required file is missing, THEN THE System SHALL display an error message listing the missing files and terminate
5. WHEN all required files exist, THE System SHALL display a summary of the Spec and ask for confirmation to proceed
6. WHERE a user provides `--spec` flag with identifier, THE System SHALL skip the interactive prompt and use the provided value

### Requirement 2: Content Generalization

**User Story:** As a template creator, I want the system to automatically replace project-specific details with template variables, so that the template is reusable across different projects.

#### Acceptance Criteria

1. WHEN processing Spec files, THE System SHALL detect and replace the Spec name with `{{SPEC_NAME}}` variable
2. WHEN processing Spec files, THE System SHALL detect and replace title-case Spec names with `{{SPEC_NAME_TITLE}}` variable
3. WHEN processing Spec files, THE System SHALL replace dates with `{{DATE}}` variable
4. WHEN processing Spec files, THE System SHALL replace author names with `{{AUTHOR}}` variable where detected
5. WHEN processing Spec files, THE System SHALL replace version numbers with `{{VERSION}}` variable where appropriate
6. WHEN project-specific paths are detected, THE System SHALL replace them with generic path variables
7. WHEN ambiguous content is detected that might need manual review, THE System SHALL flag it in the validation report
8. THE System SHALL preserve the general architecture, patterns, and structure of the original Spec
9. THE System SHALL maintain all EARS patterns and requirement structures from the original Spec

### Requirement 3: Metadata Collection

**User Story:** As a template creator, I want to provide metadata about my template, so that users can discover and understand its purpose.

#### Acceptance Criteria

1. WHEN metadata collection begins, THE System SHALL prompt for template name (kebab-case format)
2. WHEN metadata collection begins, THE System SHALL prompt for a description (1-2 sentences)
3. WHEN metadata collection begins, THE System SHALL prompt for category selection from predefined list
4. THE System SHALL support categories: web-features, backend-features, infrastructure, testing, documentation, other
5. WHEN metadata collection begins, THE System SHALL prompt for tags (comma-separated) for searchability
6. WHEN metadata collection begins, THE System SHALL prompt for author name (defaulting to git config user.name)
7. WHEN metadata collection begins, THE System SHALL prompt for version (defaulting to 1.0.0)
8. WHEN metadata collection begins, THE System SHALL prompt for minimum sce version required (defaulting to current version)
9. WHERE a user provides `--interactive=false` flag, THE System SHALL use default values for all metadata
10. WHEN all metadata is collected, THE System SHALL display a summary and ask for confirmation

### Requirement 4: YAML Frontmatter Generation

**User Story:** As a template creator, I want YAML frontmatter automatically added to template files, so that the template system can process them correctly.

#### Acceptance Criteria

1. WHEN generating template files, THE System SHALL add YAML frontmatter to requirements.md with all collected metadata
2. WHEN generating template files, THE System SHALL add YAML frontmatter to design.md with all collected metadata
3. WHEN generating template files, THE System SHALL add YAML frontmatter to tasks.md with all collected metadata
4. THE System SHALL include these frontmatter fields: name, description, category, tags, author, version, min_sce_version, created_at
5. WHEN generating frontmatter, THE System SHALL use ISO 8601 format for created_at timestamp
6. WHEN generating frontmatter, THE System SHALL ensure proper YAML syntax with `---` delimiters
7. THE System SHALL preserve any existing content below the frontmatter insertion point

### Requirement 5: Template Validation

**User Story:** As a template creator, I want the generated template to be validated automatically, so that I know it meets quality standards before submission.

#### Acceptance Criteria

1. WHEN template generation completes, THE System SHALL run TemplateValidator on all generated files
2. WHEN validation runs, THE System SHALL check for required frontmatter fields in all files
3. WHEN validation runs, THE System SHALL verify template variable syntax is correct
4. WHEN validation runs, THE System SHALL check that template structure matches expected format
5. WHEN validation runs, THE System SHALL verify that no project-specific content remains (with high confidence)
6. WHEN validation completes, THE System SHALL generate a ValidationReport with pass/fail status
7. IF validation fails, THEN THE System SHALL display specific errors and warnings with line numbers
8. IF validation passes, THEN THE System SHALL display a success message and proceed to export

### Requirement 6: Export and Output

**User Story:** As a template creator, I want to export the generated template to a local directory, so that I can review it before submitting to the repository.

#### Acceptance Criteria

1. WHEN export begins, THE System SHALL create an output directory at `.sce/templates/exports/{template-name}/`
2. WHEN exporting, THE System SHALL copy all generalized template files to the output directory
3. WHEN exporting, THE System SHALL generate a template-registry.json entry for the new template
4. WHEN exporting, THE System SHALL create a SUBMISSION_GUIDE.md file with next steps
5. WHEN exporting, THE System SHALL generate a draft PR description in PR_DESCRIPTION.md
6. WHEN exporting, THE System SHALL create a REVIEW_CHECKLIST.md with items to verify before submission
7. WHEN export completes, THE System SHALL display the output directory path
8. WHERE a user provides `--output` flag, THE System SHALL use the specified directory instead of default
9. WHEN export completes, THE System SHALL display a summary of generated files

### Requirement 7: Preview and Diff

**User Story:** As a template creator, I want to see what changes were made during generalization, so that I can verify the template is correct.

#### Acceptance Criteria

1. WHERE a user provides `--preview` flag, THE System SHALL display a diff between original and generalized content
2. WHEN preview mode is active, THE System SHALL show changes for each file (requirements.md, design.md, tasks.md)
3. WHEN preview mode is active, THE System SHALL highlight replaced content and template variables
4. WHEN preview mode is active, THE System SHALL show flagged content that needs manual review
5. WHEN preview is displayed, THE System SHALL ask for confirmation before proceeding to export
6. WHERE a user provides `--dry-run` flag, THE System SHALL perform all operations except file writing

### Requirement 8: Documentation Generation

**User Story:** As a template creator, I want usage documentation automatically generated, so that users know how to apply my template.

#### Acceptance Criteria

1. WHEN generating documentation, THE System SHALL create a USAGE_EXAMPLE.md file showing how to apply the template
2. WHEN generating documentation, THE System SHALL include example commands with the template name
3. WHEN generating documentation, THE System SHALL list all template variables and their purposes
4. WHEN generating documentation, THE System SHALL include a brief description of what the template provides
5. WHEN generating documentation, THE System SHALL include prerequisites and dependencies if detected

### Requirement 9: Error Handling and Recovery

**User Story:** As a template creator, I want clear error messages and recovery options, so that I can fix issues and complete the template creation.

#### Acceptance Criteria

1. WHEN an error occurs during Spec validation, THE System SHALL display the specific validation failure and terminate gracefully
2. WHEN an error occurs during generalization, THE System SHALL log the error context and continue with remaining files
3. WHEN an error occurs during metadata collection, THE System SHALL allow the user to retry or cancel
4. WHEN an error occurs during export, THE System SHALL clean up partial files and display the error
5. IF the output directory already exists, THEN THE System SHALL ask whether to overwrite or choose a different location
6. WHEN validation fails, THE System SHALL offer to export anyway with warnings or cancel the operation
7. THE System SHALL log all operations to `.sce/templates/exports/{template-name}/creation.log`

### Requirement 10: Integration with Existing Template System

**User Story:** As a developer, I want the generated template to work seamlessly with existing template commands, so that I can test it immediately.

#### Acceptance Criteria

1. WHEN a template is exported, THE System SHALL ensure it follows the same structure as official templates
2. WHEN a template is exported, THE System SHALL ensure it passes the same validation as templates from the registry
3. WHEN a template is exported, THE System SHALL be compatible with `sce templates apply` command
4. WHEN a template is exported, THE System SHALL be compatible with `sce templates validate` command
5. THE System SHALL reuse existing TemplateValidator, TemplateApplicator infrastructure
6. THE System SHALL follow the same naming conventions as official templates (kebab-case)
7. THE System SHALL generate registry entries compatible with the existing template-registry.json schema

### Requirement 11: Command-Line Interface

**User Story:** As a developer, I want a clear and intuitive CLI interface, so that I can create templates efficiently.

#### Acceptance Criteria

1. THE System SHALL provide command `sce templates create-from-spec` as the primary entry point
2. THE System SHALL support `--spec <identifier>` flag to specify Spec without interactive prompt
3. THE System SHALL support `--output <path>` flag to specify custom export directory
4. THE System SHALL support `--preview` flag to show diff before export
5. THE System SHALL support `--dry-run` flag to simulate without writing files
6. THE System SHALL support `--interactive=false` flag to use defaults for all prompts
7. THE System SHALL support `--help` flag to display usage information
8. WHEN `--help` is provided, THE System SHALL display all available flags and examples
9. THE System SHALL display progress indicators during long-running operations
10. THE System SHALL use consistent formatting and colors for output messages

### Requirement 12: Quality Assurance

**User Story:** As a template creator, I want confidence that my template meets quality standards, so that it will be accepted by the community.

#### Acceptance Criteria

1. WHEN validation runs, THE System SHALL check that all EARS patterns are preserved correctly
2. WHEN validation runs, THE System SHALL verify that requirement numbering is consistent
3. WHEN validation runs, THE System SHALL check that all template variables use correct syntax
4. WHEN validation runs, THE System SHALL verify that no broken internal references exist
5. WHEN validation runs, THE System SHALL check that frontmatter YAML is valid
6. WHEN validation runs, THE System SHALL verify that category is one of the allowed values
7. WHEN validation runs, THE System SHALL check that version follows semver format
8. WHEN validation completes, THE System SHALL provide a quality score (0-100) based on validation results
