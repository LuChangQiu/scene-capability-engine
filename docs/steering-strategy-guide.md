# Steering Strategy Guide

## Overview

When adopting scene-capability-engine (sce) into a project that already has steering files in `.sce/steering/`, you must choose a steering strategy. This is because AI IDE loads all files in the steering directory, and having both sce steering rules and your project's custom steering rules can cause conflicts.

## Why Steering Exclusivity?

AI IDE automatically loads all Markdown files in `.sce/steering/` as AI behavior rules. If you have both sce steering files and your project's custom steering files, the AI will try to follow both sets of rules, which can lead to:

- Conflicting instructions
- Unpredictable AI behavior
- Confusion about which rules take precedence

Therefore, you must choose **one** set of steering rules to use.

## Steering Strategies

### Strategy 1: Use sce Steering (Recommended for New Users)

**When to choose:**
- You're new to sce and want to use the recommended steering rules
- You don't have critical custom steering rules
- You want the full sce experience with optimized AI behavior

**What happens:**
1. Your existing steering files are backed up to `.sce/backups/steering-{timestamp}/`
2. sce steering template files are installed to `.sce/steering/`
3. The backup ID is saved in `.sce/adoption-config.json`
4. You can rollback if needed

**Files installed:**
- `CORE_PRINCIPLES.md` - Core development principles and Spec workflow
- `ENVIRONMENT.md` - Project environment configuration
- `CURRENT_CONTEXT.md` - Current Spec context (updated per Spec)
- `RULES_GUIDE.md` - Index of steering rules

### Strategy 2: Use Project Steering (Keep Existing)

**When to choose:**
- You have custom steering rules that are critical to your project
- You want to integrate sce without changing your AI behavior rules
- You're experienced with steering files and want full control

**What happens:**
1. Your existing steering files are preserved
2. sce steering files are **not** installed
3. The choice is documented in `.sce/adoption-config.json`
4. You can manually integrate sce steering concepts if desired

**Trade-offs:**
- You won't get sce's optimized AI behavior out of the box
- You'll need to manually add sce-specific steering rules if needed
- Spec workflow may not work as smoothly without sce steering

## Adoption Flow

```
sce adopt
    ↓
Detect existing steering files
    ↓
    ├─ No steering files → Install sce steering (default)
    │
    └─ Steering files found → Prompt for strategy
           ↓
           ├─ use-sce → Backup existing → Install sce steering
           │
           └─ use-project → Keep existing → Skip sce steering
```

## Rollback

If you chose "use-sce" and want to restore your original steering files:

```bash
# List available backups
sce rollback --list

# Restore from backup
sce rollback {backup-id}
```

Or manually restore from `.sce/backups/steering-{timestamp}/`.

## Manual Integration

If you chose "use-project" but want to incorporate sce steering concepts:

1. Review sce steering templates in `template/.sce/steering/`
2. Identify useful concepts (Spec workflow, Ultrawork principles, etc.)
3. Manually merge relevant sections into your steering files
4. Test with a sample Spec to ensure compatibility

## Configuration File

Your steering strategy choice is saved in `.sce/adoption-config.json`:

```json
{
  "version": "1.0.0",
  "adoptedAt": "2026-01-23T10:00:00.000Z",
  "steeringStrategy": "use-sce",
  "steeringBackupId": "steering-2026-01-23T10-00-00-000Z",
  "multiUserMode": true,
  "lastUpdated": "2026-01-23T10:00:00.000Z"
}
```

## Best Practices

### For New sce Users

1. **Choose "use-sce"** to get the full experience
2. Review the installed steering files to understand sce workflow
3. Customize `ENVIRONMENT.md` for your project specifics
4. Update `CURRENT_CONTEXT.md` as you work on different Specs

### For Experienced Users

1. **Choose "use-project"** if you have mature steering rules
2. Review sce steering templates for useful patterns
3. Consider creating a hybrid approach:
   - Keep your core steering rules
   - Add sce-specific rules in separate files
   - Use file naming to control load order (e.g., `00-core.md`, `10-sce.md`)

### For Teams

1. **Discuss strategy** with your team before adoption
2. **Document the choice** in your project README
3. **Version control** your steering files (if using custom rules)
4. **Share backups** if team members need to rollback

## Troubleshooting

### Problem: AI behavior is inconsistent after adoption

**Solution:**
- Check which steering strategy you chose: `cat .sce/adoption-config.json`
- If "use-sce", verify sce steering files are present
- If "use-project", ensure your steering files are compatible with sce

### Problem: Want to switch strategies after adoption

**Solution:**
1. If currently "use-sce":
   ```bash
   sce rollback {steering-backup-id}
   ```

2. If currently "use-project":
   - Manually backup your steering files
   - Copy sce templates from `template/.sce/steering/`
   - Update `.sce/adoption-config.json`

### Problem: Lost steering backup

**Solution:**
- Check `.sce/backups/` for steering backups
- Backups are named `steering-{timestamp}`
- If no backup exists, you'll need to recreate your steering files

## FAQ

**Q: Can I use both sce and project steering files?**

A: No, due to AI IDE's behavior. You must choose one set of rules.

**Q: Will my Specs work without sce steering?**

A: Yes, but the AI may not follow sce workflow conventions as closely.

**Q: Can I modify sce steering files after installation?**

A: Yes! sce steering files are templates. Customize them for your project.

**Q: What if I don't have any steering files?**

A: sce will automatically install its steering files (no choice needed).

**Q: Can I switch strategies later?**

A: Yes, but you'll need to manually manage the steering files and update the config.

## Related Documentation

- [Adoption Guide](./adoption-guide.md) - Complete adoption workflow
- [Spec Workflow Guide](../.sce/specs/SPEC_WORKFLOW_GUIDE.md) - How to use Specs
- [Steering Files](../.sce/steering/) - sce steering templates

---

**Version**: 1.42.0  
**Last Updated**: 2026-02-11  
**Spec**: 03-00-multi-user-and-cross-tool-support
