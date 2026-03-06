/**
 * RegistryParser - Parses and validates template registry files
 * 
 * Handles JSON schema validation, registry parsing, indexing, and search.
 */

const fs = require('fs-extra');
const semver = require('semver');
const { ValidationError } = require('./template-error');

class RegistryParser {
  constructor() {
    this.registryCache = new Map();
    this.templateTypes = [
      'spec-scaffold',
      'capability-template',
      'runtime-playbook'
    ];
    this.validDifficulties = ['beginner', 'intermediate', 'advanced'];
    this.validRiskLevels = ['low', 'medium', 'high', 'critical'];
  }

  /**
   * Parses a template registry file
   * 
   * @param {string} registryPath - Path to template-registry.json
   * @returns {Promise<Object>} Parsed registry
   */
  async parseRegistry(registryPath) {
    // Check cache
    if (this.registryCache.has(registryPath)) {
      return this.registryCache.get(registryPath);
    }

    // Read registry file
    if (!await fs.pathExists(registryPath)) {
      throw new ValidationError(
        'Registry file not found',
        { path: registryPath }
      );
    }

    let registry;
    try {
      registry = await fs.readJson(registryPath);
    } catch (error) {
      throw new ValidationError(
        'Failed to parse registry JSON',
        {
          path: registryPath,
          error: error.message
        }
      );
    }

    // Validate schema and normalize metadata contract
    this.validateRegistrySchema(registry);
    const normalized = this.normalizeRegistry(registry);

    // Cache parsed registry
    this.registryCache.set(registryPath, normalized);

    return normalized;
  }

  /**
   * Validates registry schema
   * 
   * @param {Object} registry - Registry object
   * @throws {ValidationError} If schema is invalid
   */
  validateRegistrySchema(registry) {
    const errors = [];

    // Check version field
    if (!registry.version) {
      errors.push('Missing required field: version');
    }

    // Check templates array
    if (!registry.templates) {
      errors.push('Missing required field: templates');
    } else if (!Array.isArray(registry.templates)) {
      errors.push('Field "templates" must be an array');
    } else {
      // Validate each template entry
      registry.templates.forEach((template, index) => {
        const templateErrors = this.validateTemplateEntry(template, index);
        errors.push(...templateErrors);
      });
    }

    if (errors.length > 0) {
      throw new ValidationError(
        'Registry schema validation failed',
        {
          errors,
          errorCount: errors.length
        }
      );
    }
  }

  /**
   * Normalizes registry entries to the typed template contract
   *
   * @param {Object} registry - Registry object
   * @returns {Object} Normalized registry
   */
  normalizeRegistry(registry) {
    const templates = Array.isArray(registry.templates) ? registry.templates : [];

    return {
      ...registry,
      templates: templates.map((template) => this.normalizeTemplateEntry(template))
    };
  }

  /**
   * Normalizes a single template entry
   *
   * @param {Object} template - Template entry
   * @returns {Object} Normalized template
   */
  normalizeTemplateEntry(template = {}) {
    const templateType = this._resolveTemplateType(template);
    const ontologyScope = this._normalizeOntologyScope(template.ontology_scope);
    const normalized = {
      ...template,
      template_type: templateType,
      min_sce_version: template.min_sce_version ?? null,
      max_sce_version: template.max_sce_version ?? null,
      ontology_scope: ontologyScope,
      ontology_core: templateType === 'capability-template'
        ? this._buildCapabilityOntologyCore(ontologyScope)
        : null,
      risk_level: template.risk_level ?? null,
      rollback_contract: this._normalizeRollbackContract(template.rollback_contract),
      applicable_scenarios: Array.isArray(template.applicable_scenarios) ? template.applicable_scenarios : [],
      tags: Array.isArray(template.tags) ? template.tags : [],
      files: Array.isArray(template.files) ? template.files : []
    };

    return normalized;
  }

  /**
   * Validates a single template entry
   * 
   * @param {Object} template - Template entry
   * @param {number} index - Template index
   * @returns {string[]} Array of error messages
   */
  validateTemplateEntry(template, index) {
    const errors = [];
    const prefix = `Template[${index}]`;
    const templateType = this._resolveTemplateType(template);

    // Required fields
    const requiredFields = [
      'id', 'name', 'category', 'description',
      'difficulty', 'tags', 'applicable_scenarios', 'files',
      'template_type', 'min_sce_version', 'risk_level', 'rollback_contract'
    ];

    for (const field of requiredFields) {
      if (!template[field]) {
        errors.push(`${prefix}: Missing required field "${field}"`);
      }
    }

    // Validate field types
    if (template.tags && !Array.isArray(template.tags)) {
      errors.push(`${prefix}: Field "tags" must be an array`);
    }

    if (template.applicable_scenarios && !Array.isArray(template.applicable_scenarios)) {
      errors.push(`${prefix}: Field "applicable_scenarios" must be an array`);
    }

    if (template.files && !Array.isArray(template.files)) {
      errors.push(`${prefix}: Field "files" must be an array`);
    }

    if (template.template_type && !this.templateTypes.includes(template.template_type)) {
      errors.push(`${prefix}: Invalid template_type "${template.template_type}". Must be one of: ${this.templateTypes.join(', ')}`);
    }

    if (template.min_sce_version !== undefined && template.min_sce_version !== null) {
      if (typeof template.min_sce_version !== 'string' || !semver.valid(template.min_sce_version)) {
        errors.push(`${prefix}: Field "min_sce_version" must be a valid semver version (e.g. 3.3.13)`);
      }
    }

    if (template.max_sce_version !== undefined && template.max_sce_version !== null) {
      if (typeof template.max_sce_version !== 'string' || !semver.valid(template.max_sce_version)) {
        errors.push(`${prefix}: Field "max_sce_version" must be a valid semver version (e.g. 3.3.13)`);
      }
    }

    if (template.min_sce_version && template.max_sce_version) {
      if (semver.gt(template.min_sce_version, template.max_sce_version)) {
        errors.push(`${prefix}: Field "min_sce_version" must be less than or equal to "max_sce_version"`);
      }
    }

    if (template.ontology_scope !== undefined && template.ontology_scope !== null) {
      if (!this._isPlainObject(template.ontology_scope)) {
        errors.push(`${prefix}: Field "ontology_scope" must be an object`);
      } else {
        const ontologyArrayFields = ['domains', 'entities', 'relations', 'business_rules', 'decisions'];
        for (const fieldName of ontologyArrayFields) {
          if (template.ontology_scope[fieldName] !== undefined &&
            !Array.isArray(template.ontology_scope[fieldName])) {
            errors.push(`${prefix}: Field "ontology_scope.${fieldName}" must be an array when present`);
          }
        }
      }
    }

    if (!this.validRiskLevels.includes(template.risk_level)) {
      errors.push(`${prefix}: Invalid risk_level "${template.risk_level}". Must be one of: ${this.validRiskLevels.join(', ')}`);
    }

    if (!this._isPlainObject(template.rollback_contract)) {
      errors.push(`${prefix}: Field "rollback_contract" must be an object`);
    } else {
      if (typeof template.rollback_contract.supported !== 'boolean') {
        errors.push(`${prefix}: Field "rollback_contract.supported" must be boolean`);
      }
      if (typeof template.rollback_contract.strategy !== 'string' ||
        template.rollback_contract.strategy.trim().length === 0) {
        errors.push(`${prefix}: Field "rollback_contract.strategy" must be a non-empty string`);
      }
    }

    if (templateType === 'capability-template') {
      const ontologyScope = template.ontology_scope;
      if (!this._isPlainObject(ontologyScope)) {
        errors.push(`${prefix}: capability-template requires "ontology_scope" object`);
      } else {
        const normalizedOntologyScope = this._normalizeOntologyScope(ontologyScope);
        const ontologyCore = this._buildCapabilityOntologyCore(normalizedOntologyScope);
        if (!ontologyCore.ready) {
          errors.push(`${prefix}: capability-template missing required ontology triads: ${ontologyCore.missing.join(', ')}`);
        }
      }
    }

    // Validate difficulty
    if (template.difficulty && !this.validDifficulties.includes(template.difficulty)) {
      errors.push(`${prefix}: Invalid difficulty "${template.difficulty}". Must be one of: ${this.validDifficulties.join(', ')}`);
    }

    // Validate files array (legacy requirement only for spec scaffolds)
    if (templateType === 'spec-scaffold' && template.files && Array.isArray(template.files)) {
      const requiredFiles = ['requirements.md', 'design.md', 'tasks.md'];
      for (const file of requiredFiles) {
        if (!template.files.includes(file)) {
          errors.push(`${prefix}: spec-scaffold missing required file "${file}" in files array`);
        }
      }
    }

    return errors;
  }

  /**
   * Builds searchable index from registry
   * 
   * @param {Object} registry - Parsed registry
   * @returns {Object} Indexed registry
   */
  buildIndex(registry) {
    const index = {
      byId: {},
      byCategory: {},
      byTag: {},
      byDifficulty: {},
      byTemplateType: {},
      byRiskLevel: {},
      all: []
    };

    for (const template of registry.templates) {
      // Index by ID
      index.byId[template.id] = template;

      // Index by category
      if (!index.byCategory[template.category]) {
        index.byCategory[template.category] = [];
      }
      index.byCategory[template.category].push(template);

      // Index by tags
      for (const tag of template.tags || []) {
        if (!index.byTag[tag]) {
          index.byTag[tag] = [];
        }
        index.byTag[tag].push(template);
      }

      // Index by difficulty
      if (!index.byDifficulty[template.difficulty]) {
        index.byDifficulty[template.difficulty] = [];
      }
      index.byDifficulty[template.difficulty].push(template);

      // Index by template type
      const templateType = this._resolveTemplateType(template);
      if (!index.byTemplateType[templateType]) {
        index.byTemplateType[templateType] = [];
      }
      index.byTemplateType[templateType].push(template);

      // Index by risk level
      const riskLevel = template.risk_level || 'unspecified';
      if (!index.byRiskLevel[riskLevel]) {
        index.byRiskLevel[riskLevel] = [];
      }
      index.byRiskLevel[riskLevel].push(template);

      // Add to all templates
      index.all.push(template);
    }

    return index;
  }

  /**
   * Merges multiple registries
   * 
   * @param {Object[]} registries - Array of registry objects
   * @returns {Object} Merged registry
   */
  mergeRegistries(registries) {
    const merged = {
      version: '1.0.0',
      templates: []
    };

    const seenIds = new Set();

    for (const registry of registries) {
      for (const template of registry.templates || []) {
        // Skip duplicates (first occurrence wins)
        if (seenIds.has(template.id)) {
          continue;
        }

        seenIds.add(template.id);
        merged.templates.push(this.normalizeTemplateEntry(template));
      }
    }

    return merged;
  }

  /**
   * Clears registry cache
   */
  clearCache() {
    this.registryCache.clear();
  }

  /**
   * Gets template by ID
   * 
   * @param {Object} index - Registry index
   * @param {string} templateId - Template ID
   * @returns {Object|null} Template or null
   */
  getTemplateById(index, templateId) {
    return index.byId[templateId] || null;
  }

  /**
   * Gets templates by category
   * 
   * @param {Object} index - Registry index
   * @param {string} category - Category name
   * @returns {Object[]} Array of templates
   */
  getTemplatesByCategory(index, category) {
    return index.byCategory[category] || [];
  }

  /**
   * Gets templates by tag
   * 
   * @param {Object} index - Registry index
   * @param {string} tag - Tag name
   * @returns {Object[]} Array of templates
   */
  getTemplatesByTag(index, tag) {
    return index.byTag[tag] || [];
  }

  /**
   * Gets templates by difficulty
   * 
   * @param {Object} index - Registry index
   * @param {string} difficulty - Difficulty level
   * @returns {Object[]} Array of templates
   */
  getTemplatesByDifficulty(index, difficulty) {
    return index.byDifficulty[difficulty] || [];
  }

  /**
   * Gets templates by template type
   *
   * @param {Object} index - Registry index
   * @param {string} templateType - Template type
   * @returns {Object[]} Array of templates
   */
  getTemplatesByTemplateType(index, templateType) {
    return index.byTemplateType[templateType] || [];
  }

  /**
   * Gets all categories
   * 
   * @param {Object} index - Registry index
   * @returns {string[]} Array of category names
   */
  getCategories(index) {
    return Object.keys(index.byCategory);
  }

  /**
   * Gets all tags
   * 
   * @param {Object} index - Registry index
   * @returns {string[]} Array of tag names
   */
  getTags(index) {
    return Object.keys(index.byTag);
  }

  /**
   * Searches templates by keyword
   * 
   * @param {Object} index - Registry index
   * @param {string} keyword - Search keyword
   * @param {Object} filters - Optional filters
   * @param {string} filters.category - Filter by category
   * @param {string} filters.difficulty - Filter by difficulty
   * @param {string} filters.templateType - Filter by template type
   * @param {string} filters.riskLevel - Filter by risk level
   * @param {string[]} filters.tags - Filter by tags (any match)
   * @returns {Object[]} Array of matching templates
   */
  searchTemplates(index, keyword, filters = {}) {
    const keywordLower = keyword.toLowerCase();
    let results = [];

    // Search in all templates
    for (const template of index.all) {
      // Check if keyword matches
      const matchesKeyword = this._matchesKeyword(template, keywordLower);
      
      if (!matchesKeyword) {
        continue;
      }

      // Apply filters
      if (filters.category && template.category !== filters.category) {
        continue;
      }

      if (filters.difficulty && template.difficulty !== filters.difficulty) {
        continue;
      }

      if (filters.templateType && this._resolveTemplateType(template) !== filters.templateType) {
        continue;
      }

      if (filters.riskLevel) {
        const riskLevel = template.risk_level || 'unspecified';
        if (riskLevel !== filters.riskLevel) {
          continue;
        }
      }

      if (filters.tags && filters.tags.length > 0) {
        const hasMatchingTag = filters.tags.some(tag => 
          template.tags.includes(tag)
        );
        if (!hasMatchingTag) {
          continue;
        }
      }

      results.push(template);
    }

    return results;
  }

  /**
   * Checks if template matches keyword
   * 
   * @param {Object} template - Template object
   * @param {string} keywordLower - Lowercase keyword
   * @returns {boolean} True if matches
   * @private
   */
  _matchesKeyword(template, keywordLower) {
    // Search in name
    if (template.name.toLowerCase().includes(keywordLower)) {
      return true;
    }

    // Search in description
    if (template.description.toLowerCase().includes(keywordLower)) {
      return true;
    }

    // Search in tags
    for (const tag of template.tags || []) {
      if (tag.toLowerCase().includes(keywordLower)) {
        return true;
      }
    }

    // Search in applicable scenarios
    for (const scenario of template.applicable_scenarios || []) {
      if (scenario.toLowerCase().includes(keywordLower)) {
        return true;
      }
    }

    // Search in template type
    if (this._resolveTemplateType(template).includes(keywordLower)) {
      return true;
    }

    // Search in ontology scope values
    const ontologyScope = template.ontology_scope || {};
    for (const field of ['domains', 'entities', 'relations', 'business_rules', 'decisions']) {
      for (const value of ontologyScope[field] || []) {
        if (String(value).toLowerCase().includes(keywordLower)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Filters templates
   * 
   * @param {Object} index - Registry index
   * @param {Object} filters - Filters
   * @param {string} filters.category - Filter by category
   * @param {string} filters.difficulty - Filter by difficulty
   * @param {string} filters.templateType - Filter by template type
   * @param {string} filters.riskLevel - Filter by risk level
   * @param {string[]} filters.tags - Filter by tags (any match)
   * @returns {Object[]} Array of matching templates
   */
  filterTemplates(index, filters = {}) {
    let results = [...index.all];

    // Filter by category
    if (filters.category) {
      results = results.filter(t => t.category === filters.category);
    }

    // Filter by difficulty
    if (filters.difficulty) {
      results = results.filter(t => t.difficulty === filters.difficulty);
    }

    // Filter by template type
    if (filters.templateType) {
      results = results.filter(t => this._resolveTemplateType(t) === filters.templateType);
    }

    // Filter by risk level
    if (filters.riskLevel) {
      results = results.filter((t) => (t.risk_level || 'unspecified') === filters.riskLevel);
    }

    // Filter by tags (any match)
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(t => 
        filters.tags.some(tag => t.tags.includes(tag))
      );
    }

    return results;
  }

  /**
   * Evaluates whether a template is compatible with a target SCE version
   *
   * @param {Object} template - Template object
   * @param {string} sceVersion - Target SCE version
   * @returns {boolean} Compatibility result
   */
  isTemplateCompatible(template, sceVersion) {
    if (!sceVersion) {
      return true;
    }

    if (!semver.valid(sceVersion)) {
      return false;
    }

    const minVersion = template.min_sce_version;
    const maxVersion = template.max_sce_version;

    if (minVersion && semver.valid(minVersion) && semver.lt(sceVersion, minVersion)) {
      return false;
    }

    if (maxVersion && semver.valid(maxVersion) && semver.gt(sceVersion, maxVersion)) {
      return false;
    }

    return true;
  }

  /**
   * Resolves template type with backward-compatible default
   *
   * @param {Object} template - Template object
   * @returns {string} Template type
   * @private
   */
  _resolveTemplateType(template = {}) {
    const candidate = String(template.template_type || '').trim();
    return this.templateTypes.includes(candidate) ? candidate : 'spec-scaffold';
  }

  /**
   * Normalizes ontology scope structure
   *
   * @param {Object|null|undefined} ontologyScope - Ontology scope
   * @returns {Object|null} Normalized ontology scope
   * @private
   */
  _normalizeOntologyScope(ontologyScope) {
    if (!this._isPlainObject(ontologyScope)) {
      return null;
    }

    const normalized = {};
    for (const field of ['domains', 'entities', 'relations', 'business_rules', 'decisions']) {
      if (Array.isArray(ontologyScope[field])) {
        normalized[field] = ontologyScope[field];
      }
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  _buildCapabilityOntologyCore(ontologyScope) {
    const normalized = this._normalizeOntologyScope(ontologyScope) || {};
    const entities = Array.isArray(normalized.entities) ? normalized.entities : [];
    const relations = Array.isArray(normalized.relations) ? normalized.relations : [];
    const businessRules = Array.isArray(normalized.business_rules) ? normalized.business_rules : [];
    const decisions = Array.isArray(normalized.decisions) ? normalized.decisions : [];
    const triads = {
      entity_relation: {
        required_fields: ['entities', 'relations'],
        entity_count: entities.length,
        relation_count: relations.length,
        passed: entities.length > 0 && relations.length > 0
      },
      business_rules: {
        required_fields: ['business_rules'],
        count: businessRules.length,
        passed: businessRules.length > 0
      },
      decision_strategy: {
        required_fields: ['decisions'],
        count: decisions.length,
        passed: decisions.length > 0
      }
    };
    const missing = Object.entries(triads)
      .filter(([, value]) => !value.passed)
      .map(([key]) => key);

    return {
      triads,
      ready: missing.length === 0,
      missing,
      coverage_ratio: Number(((3 - missing.length) / 3).toFixed(3))
    };
  }

  /**
   * Normalizes rollback contract
   *
   * @param {Object|null|undefined} rollbackContract - rollback contract
   * @returns {Object|null} Normalized rollback contract
   * @private
   */
  _normalizeRollbackContract(rollbackContract) {
    if (!this._isPlainObject(rollbackContract)) {
      return null;
    }

    const supported = rollbackContract.supported;
    if (typeof supported !== 'boolean') {
      return null;
    }

    const normalized = { supported };
    if (typeof rollbackContract.strategy === 'string' && rollbackContract.strategy.trim().length > 0) {
      normalized.strategy = rollbackContract.strategy.trim();
    }

    return normalized;
  }

  /**
   * Checks if value is a plain object
   *
   * @param {*} value - Value to check
   * @returns {boolean} Is plain object
   * @private
   */
  _isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Sorts templates
   * 
   * @param {Object[]} templates - Array of templates
   * @param {string} sortBy - Sort field ('name', 'difficulty', 'created_at', 'updated_at')
   * @param {string} order - Sort order ('asc' or 'desc')
   * @returns {Object[]} Sorted templates
   */
  sortTemplates(templates, sortBy = 'name', order = 'asc') {
    const sorted = [...templates];

    sorted.sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        
        case 'difficulty':
          const difficultyOrder = { beginner: 1, intermediate: 2, advanced: 3 };
          aVal = difficultyOrder[a.difficulty] || 0;
          bVal = difficultyOrder[b.difficulty] || 0;
          break;
        
        case 'created_at':
          aVal = new Date(a.created_at || 0);
          bVal = new Date(b.created_at || 0);
          break;
        
        case 'updated_at':
          aVal = new Date(a.updated_at || 0);
          bVal = new Date(b.updated_at || 0);
          break;
        
        default:
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }

  /**
   * Groups templates by category
   * 
   * @param {Object[]} templates - Array of templates
   * @returns {Object} Templates grouped by category
   */
  groupByCategory(templates) {
    const grouped = {};

    for (const template of templates) {
      if (!grouped[template.category]) {
        grouped[template.category] = [];
      }
      grouped[template.category].push(template);
    }

    return grouped;
  }

  /**
   * Gets template statistics
   * 
   * @param {Object} index - Registry index
   * @returns {Object} Statistics
   */
  getStatistics(index) {
    return {
      totalTemplates: index.all.length,
      categories: Object.keys(index.byCategory).length,
      tags: Object.keys(index.byTag).length,
      byCategory: Object.keys(index.byCategory).reduce((acc, cat) => {
        acc[cat] = index.byCategory[cat].length;
        return acc;
      }, {}),
      byDifficulty: Object.keys(index.byDifficulty).reduce((acc, diff) => {
        acc[diff] = index.byDifficulty[diff].length;
        return acc;
      }, {}),
      byTemplateType: Object.keys(index.byTemplateType).reduce((acc, templateType) => {
        acc[templateType] = index.byTemplateType[templateType].length;
        return acc;
      }, {}),
      byRiskLevel: Object.keys(index.byRiskLevel).reduce((acc, riskLevel) => {
        acc[riskLevel] = index.byRiskLevel[riskLevel].length;
        return acc;
      }, {})
    };
  }
}

module.exports = RegistryParser;
