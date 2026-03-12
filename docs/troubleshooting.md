# Troubleshooting Guide

> Common issues and solutions for sce

---

**Version**: 1.42.0  
**Last Updated**: 2026-02-11  
**Audience**: All Users  
**Estimated Time**: Reference as needed

---

## Quick Navigation

- [Installation Issues](#installation-issues)
- [Adoption Issues](#adoption-issues)
- [Command Issues](#command-issues)
- [Integration Issues](#integration-issues)
- [Watch Mode Issues](#watch-mode-issues)
- [Document Governance Issues](#document-governance-issues)
- [Platform-Specific Issues](#platform-specific-issues)
- [Getting More Help](#getting-more-help)

---

## Installation Issues

### Error: "npm install -g scene-capability-engine" fails

**Symptoms:**
```
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /usr/local/lib/node_modules
```

**Cause:** Insufficient permissions to install global npm packages

**Solutions:**

**Option 1: Use npx (Recommended)**
```bash
# No installation needed, run directly
npx sce status
npx sce adopt
```

**Option 2: Fix npm permissions (macOS/Linux)**
```bash
# Create npm directory in home folder
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH=~/.npm-global/bin:$PATH

# Reload shell config
source ~/.bashrc  # or source ~/.zshrc

# Now install
npm install -g scene-capability-engine
```

**Option 3: Use sudo (Not Recommended)**
```bash
sudo npm install -g scene-capability-engine
```

---

### Error: "sce: command not found"

**Symptoms:**
```bash
$ sce status
bash: sce: command not found
```

**Cause:** sce is not in your PATH

**Solutions:**

**Check if sce is installed:**
```bash
npm list -g sce
```

**If installed, find where:**
```bash
npm root -g
# Output: /usr/local/lib/node_modules (or similar)
```

**Add to PATH:**
```bash
# macOS/Linux - Add to ~/.bashrc or ~/.zshrc
export PATH="/usr/local/bin:$PATH"

# Windows - Add to System Environment Variables
# C:\Users\YourName\AppData\Roaming\npm
```

**Verify:**
```bash
which sce  # macOS/Linux
where sce  # Windows
```

---

### Error: "Node.js version too old"

**Symptoms:**
```
Error: sce requires Node.js 14 or higher
Current version: v12.x.x
```

**Cause:** sce requires Node.js 14+

**Solution:**

**Update Node.js:**
```bash
# Using nvm (recommended)
nvm install 18
nvm use 18

# Or download from nodejs.org
# https://nodejs.org/
```

**Verify:**
```bash
node --version
# Should show v14.x.x or higher
```

---

## Adoption Issues

### Error: "Not a git repository"

**Symptoms:**
```bash
$ sce adopt
Error: Not a git repository
sce requires a git repository to track Specs
```

**Cause:** sce requires git for version control

**Solution:**

**Initialize git:**
```bash
git init
git add .
git commit -m "Initial commit"

# Now adopt sce
sce adopt
```

**Why git is required:**
- Specs should be version controlled
- Team collaboration needs git
- sce uses git to detect project root

---

### Error: "sce.json already exists"

**Symptoms:**
```bash
$ sce adopt
Error: sce.json already exists
Use 'sce upgrade' to update existing installation
```

**Cause:** Project already has sce installed

**Solutions:**

**If you want to upgrade:**
```bash
sce upgrade
```

**If you want to start fresh:**
```bash
# Backup existing Specs
cp -r .sce .sce.backup

# Remove sce
rm sce.json
rm -rf .sce

# Re-adopt
sce adopt
```

---

### Error: "Permission denied creating .sce directory"

**Symptoms:**
```bash
$ sce adopt
Error: EACCES: permission denied, mkdir '.sce'
```

**Cause:** Insufficient permissions in project directory

**Solution:**

**Check directory permissions:**
```bash
ls -la
```

**Fix permissions:**
```bash
# Make sure you own the directory
sudo chown -R $USER:$USER .

# Or run in a directory you own
cd ~/projects/my-project
sce adopt
```

---

## Command Issues

### Error: "No Specs found"

**Symptoms:**
```bash
$ sce status
No Specs found in .sce/specs/
```

**Cause:** No Specs have been created yet

**Solution:**

**Create your first Spec:**
```bash
sce spec bootstrap --name 01-00-my-feature --non-interactive
```

**Or check if Specs exist:**
```bash
ls -la .sce/specs/
```

---

### Error: "Invalid Spec name format"

**Symptoms:**
```bash
$ sce spec bootstrap --name my-feature --non-interactive
Error: Invalid Spec name format
Expected: {number}-{number}-{kebab-case-name}
```

**Cause:** Spec names must follow the format: `XX-YY-feature-name`

**Solution:**

**Use correct format:**
```bash
# ✅ Correct
sce spec bootstrap --name 01-00-user-login --non-interactive
sce spec bootstrap --name 02-01-fix-auth-bug --non-interactive

# ❌ Wrong
sce spec bootstrap --name user-login --non-interactive
sce spec bootstrap --name 01-user-login --non-interactive
sce spec bootstrap --name UserLogin --non-interactive
```

---

### Error: "Context export failed"

**Symptoms:**
```bash
$ sce context export 01-00-user-login
Error: Failed to export context
```

**Possible Causes & Solutions:**

**1. Spec doesn't exist:**
```bash
# Check Spec exists
ls .sce/specs/01-00-user-login/

# If not, create it
sce spec bootstrap --name 01-00-user-login --non-interactive
```

**2. Missing Spec files:**
```bash
# Spec needs at least requirements.md
ls .sce/specs/01-00-user-login/requirements.md

# Create if missing
touch .sce/specs/01-00-user-login/requirements.md
```

**3. File permission issues:**
```bash
# Check permissions
ls -la .sce/specs/01-00-user-login/

# Fix if needed
chmod 644 .sce/specs/01-00-user-login/*.md
```

---

### Error: "Task not found"

**Symptoms:**
```bash
$ sce task claim 01-00-user-login 1.1
Error: Task 1.1 not found in tasks.md
```

**Cause:** Task ID doesn't exist in tasks.md

**Solution:**

**Check tasks.md:**
```bash
cat .sce/specs/01-00-user-login/tasks.md
```

**Verify task ID format:**
```markdown
# tasks.md should have:
- [ ] 1.1 Task description
- [ ] 1.2 Another task

# Not:
- [ ] Task description (missing ID)
```

---

## Integration Issues

### My AI tool doesn't understand the context

**Symptoms:**
- AI generates code that doesn't match your Spec
- AI asks for information already in the Spec
- AI ignores design decisions

**Solutions:**

**1. Be explicit in your prompt:**
```
❌ Bad: "Implement the login feature"

✅ Good: "Please implement the login feature following the 
requirements and design in the provided context. Pay special 
attention to the API design and error handling sections."
```

**2. Verify context was provided:**
```bash
# Check context file exists and has content
cat .sce/specs/01-00-user-login/context-export.md

# Should contain requirements, design, and tasks
```

**3. Break down large contexts:**
```bash
# Instead of entire Spec, export specific task
sce prompt generate 01-00-user-login 1.1
```

**4. Use steering rules:**
```bash
# Include project-specific rules
sce context export 01-00-user-login --include-steering
```

---

### Context file too large for AI tool

**Symptoms:**
- AI tool rejects context (too many tokens)
- AI tool truncates context
- Error: "Context exceeds maximum length"

**Solutions:**

**1. Use task-specific prompts:**
```bash
# Export just one task
sce prompt generate 01-00-user-login 1.1
```

**2. Simplify your Spec:**
- Remove unnecessary details from requirements
- Condense design documentation
- Break large Specs into smaller ones

**3. Use a tool with larger context window:**
- Claude Code: 200K tokens
- GPT-4 Turbo: 128K tokens
- Gemini Pro: 1M tokens

---

### AI generates code that doesn't match design

**Symptoms:**
- Code structure differs from design
- API endpoints don't match specification
- Component names are different

**Solutions:**

**1. Improve design specificity:**
```markdown
# ❌ Vague
- Create authentication system

# ✅ Specific
- Create AuthController class with login() method
- Method signature: async login(email: string, password: string): Promise<AuthResult>
- Return { token: string } on success
- Return { error: string } on failure
```

**2. Reference design in prompt:**
```
"Please implement exactly as specified in the Design section,
using the exact class names, method signatures, and API endpoints
documented."
```

**3. Provide code examples in design:**
```markdown
## Example Implementation
```javascript
class AuthController {
  async login(email, password) {
    // Implementation here
  }
}
```
```

---

## Watch Mode Issues

### Watch mode not detecting changes

**Symptoms:**
```bash
$ sce watch status
Status: Running

# But editing Spec files doesn't trigger actions
```

**Solutions:**

**1. Restart watch mode:**
```bash
sce watch stop
sce watch start
```

**2. Check watch patterns:**
```bash
sce watch config
# Verify patterns include your files
```

**3. Check file system events:**
```bash
# Some editors don't trigger file system events
# Try saving with "Save As" instead of "Save"
```

**4. Increase watch delay:**
```bash
# If changes are too rapid
sce watch config --delay 1000
```

---

### Watch mode consuming too much CPU

**Symptoms:**
- High CPU usage when watch mode is running
- System becomes slow

**Solutions:**

**1. Reduce watch scope:**
```bash
# Watch only specific Specs
sce watch start --spec 01-00-user-login
```

**2. Exclude unnecessary files:**
```bash
# Add to watch config
{
  "exclude": [
    "node_modules/**",
    ".git/**",
    "*.log"
  ]
}
```

**3. Stop when not needed:**
```bash
# Stop watch mode when not actively developing
sce watch stop
```

---

### Watch mode actions not executing

**Symptoms:**
- Watch mode detects changes
- But actions don't run

**Solutions:**

**1. Check action configuration:**
```bash
sce watch config
# Verify actions are properly configured
```

**2. Check action logs:**
```bash
sce watch logs
# Look for error messages
```

**3. Test action manually:**
```bash
# Try running the action command directly
sce context export 01-00-user-login
```

---

## Document Governance Issues

### Diagnostic not finding violations

**Symptoms:**
```bash
$ sce docs diagnose
✅ Project is compliant
# But you know there are temporary files
```

**Cause:** Files don't match temporary patterns or are in unexpected locations

**Solutions:**

**1. Check what patterns are configured:**
```bash
sce docs config
# Look at "Temporary Patterns" section
```

**2. Add custom patterns if needed:**
```bash
sce docs config --set temporary-patterns "*-SUMMARY.md,SESSION-*.md,*-COMPLETE.md,TEMP-*.md,WIP-*.md,MVP-*.md,DRAFT-*.md"
```

**3. Manually check for violations:**
```bash
# Check root directory
ls *.md

# Should only see: README.md, README.zh.md, CHANGELOG.md, CONTRIBUTING.md
```

---

### Cleanup not removing files

**Symptoms:**
```bash
$ sce docs cleanup
Deleted 0 file(s)
# But temporary files still exist
```

**Possible Causes & Solutions:**

**1. Files don't match temporary patterns:**
```bash
# Check file names
ls *.md

# If file is "notes.md" (doesn't match patterns)
# Either rename it to match pattern or delete manually
mv notes.md TEMP-notes.md
sce docs cleanup
```

**2. Files are in subdirectories:**
```bash
# Cleanup only checks root and Spec directories
# Check subdirectories manually
find . -name "*-SUMMARY.md"
```

**3. Permission issues:**
```bash
# Check file permissions
ls -la *.md

# Fix if needed
chmod u+w filename.md
sce docs cleanup
```

---

### Archive moving files to wrong subdirectory

**Symptoms:**
```bash
$ sce docs archive --spec my-spec
# Files moved to unexpected subdirectories
```

**Cause:** File type classification based on filename

**Solution:**

**Understand classification rules:**
- **scripts/** - `.js`, `.py`, `.sh`, "script" in name
- **reports/** - "report", "analysis", "summary" in name
- **tests/** - `.test.js`, `.spec.js`, "test" in name
- **results/** - "result", "output" in name
- **docs/** - Everything else

**Rename files to match intended subdirectory:**
```bash
# Want file in reports/
mv data.md analysis-report.md

# Want file in scripts/
mv tool.js test-script.js

# Then archive
sce docs archive --spec my-spec
```

---

### Git hooks not blocking commits

**Symptoms:**
```bash
$ git commit -m "Add feature"
# Commit succeeds even with violations
```

**Possible Causes & Solutions:**

**1. Hooks not installed:**
```bash
# Check status
sce docs hooks status

# If not installed
sce docs hooks install
```

**2. Hook file not executable:**
```bash
# Check permissions (macOS/Linux)
ls -la .git/hooks/pre-commit

# Make executable
chmod +x .git/hooks/pre-commit
```

**3. Using --no-verify flag:**
```bash
# This bypasses hooks
git commit --no-verify -m "message"

# Remove --no-verify to enable validation
git commit -m "message"
```

**4. Not a git repository:**
```bash
# Check if .git exists
ls -la .git/

# If not, initialize git
git init
sce docs hooks install
```

---

### Validation failing for valid structure

**Symptoms:**
```bash
$ sce docs validate --spec my-spec
❌ Missing required file: requirements.md
# But the file exists
```

**Possible Causes & Solutions:**

**1. File in wrong location:**
```bash
# Check exact path
ls -la .sce/specs/my-spec/requirements.md

# Should be directly in Spec directory, not in subdirectory
```

**2. Wrong Spec name:**
```bash
# Check Spec directory name
ls .sce/specs/

# Use exact name
sce docs validate --spec 01-00-my-feature
```

**3. Case sensitivity (Linux/macOS):**
```bash
# File is "Requirements.md" but should be "requirements.md"
mv Requirements.md requirements.md
```

---

### Configuration changes not taking effect

**Symptoms:**
```bash
$ sce docs config --set root-allowed-files "README.md,CUSTOM.md"
✅ Configuration updated

$ sce docs diagnose
# Still reports CUSTOM.md as violation
```

**Cause:** Configuration file not being read or cached

**Solutions:**

**1. Verify configuration was saved:**
```bash
# Check config file
cat .sce/config/docs.json

# Should show your changes
```

**2. Check for typos in key name:**
```bash
# Wrong: root-files
# Correct: root-allowed-files

sce docs config --set root-allowed-files "README.md,CUSTOM.md"
```

**3. Restart any running processes:**
```bash
# If watch mode is running
sce watch stop
sce watch start
```

---

### "Permission denied" when installing hooks

**Symptoms:**
```bash
$ sce docs hooks install
Error: EACCES: permission denied, open '.git/hooks/pre-commit'
```

**Cause:** Insufficient permissions for .git/hooks directory

**Solutions:**

**1. Check directory permissions:**
```bash
ls -la .git/hooks/
```

**2. Fix permissions:**
```bash
# Make hooks directory writable
chmod u+w .git/hooks/

# Try again
sce docs hooks install
```

**3. Check if file is read-only:**
```bash
# If pre-commit already exists
ls -la .git/hooks/pre-commit

# Remove read-only flag
chmod u+w .git/hooks/pre-commit
```

---

### Stats showing no data

**Symptoms:**
```bash
$ sce docs stats
⚠️  No execution history found
```

**Cause:** No governance commands have been run yet

**Solution:**

**Run some governance commands:**
```bash
# Run diagnostic
sce docs diagnose

# Run cleanup
sce docs cleanup --dry-run

# Now check stats
sce docs stats
```

**Note:** Only actual operations are logged (not --dry-run for cleanup/archive)

---

### Report generation fails

**Symptoms:**
```bash
$ sce docs report
Error: ENOENT: no such file or directory, open '.sce/reports/...'
```

**Cause:** Reports directory doesn't exist

**Solution:**

**Create reports directory:**
```bash
mkdir -p .sce/reports

# Try again
sce docs report
```

**Or let sce create it:**
```bash
# Run diagnostic first (creates directory structure)
sce docs diagnose

# Then generate report
sce docs report
```

---

## Platform-Specific Issues

### Windows Issues

#### PowerShell vs CMD

**Issue:** Commands work in CMD but not PowerShell (or vice versa)

**Solution:**
```powershell
# Use CMD for sce commands
cmd /c sce status

# Or configure PowerShell execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Path separators

**Issue:** Paths with forward slashes don't work

**Solution:**
```bash
# ❌ Wrong on Windows
sce context export .sce/specs/01-00-user-login

# ✅ Correct on Windows
sce context export .sce\specs\01-00-user-login

# ✅ Or use forward slashes (sce handles both)
sce context export 01-00-user-login
```

#### Line endings

**Issue:** Files have wrong line endings (CRLF vs LF)

**Solution:**
```bash
# Configure git to handle line endings
git config --global core.autocrlf true

# Or use .gitattributes
echo "*.md text eol=lf" >> .gitattributes
```

---

### macOS Issues

#### Gatekeeper blocking sce

**Issue:** "sce cannot be opened because it is from an unidentified developer"

**Solution:**
```bash
# sce is installed via npm, so this shouldn't happen
# But if it does:
xattr -d com.apple.quarantine $(which sce)
```

#### Permission issues

**Issue:** "Operation not permitted"

**Solution:**
```bash
# Grant Terminal full disk access
# System Preferences → Security & Privacy → Privacy → Full Disk Access
# Add Terminal.app
```

---

### Linux Issues

#### Different shells

**Issue:** Commands work in bash but not zsh (or vice versa)

**Solution:**
```bash
# Add sce to PATH in your shell config
# For bash: ~/.bashrc
# For zsh: ~/.zshrc
export PATH="$HOME/.npm-global/bin:$PATH"

# Reload config
source ~/.bashrc  # or ~/.zshrc
```

#### Permission issues

**Issue:** "Permission denied" errors

**Solution:**
```bash
# Check file permissions
ls -la $(which sce)

# Should be executable
chmod +x $(which sce)
```

---

## Getting More Help

### Before Asking for Help

**Gather information:**
```bash
# sce version
sce --version

# Node.js version
node --version

# npm version
npm --version

# Operating system
uname -a  # macOS/Linux
ver       # Windows

# Current directory structure
ls -la .sce/
```

### Where to Get Help

**1. Documentation:**
- [Quick Start Guide](quick-start.md)
- [FAQ](faq.md)
- [Command Reference](command-reference.md)

**2. GitHub Issues:**
- Search existing issues: https://github.com/heguangyong/scene-capability-engine/issues
- Create new issue: https://github.com/heguangyong/scene-capability-engine/issues/new

**3. GitHub Discussions:**
- Ask questions: https://github.com/heguangyong/scene-capability-engine/discussions
- Share tips and tricks
- Connect with other users

**4. Community:**
- Discord: [Join our Discord](https://discord.gg/sce)
- Twitter: [@sce_dev](https://twitter.com/sce_dev)

### Creating a Good Issue Report

**Include:**
1. **What you tried to do**
2. **What you expected to happen**
3. **What actually happened**
4. **Error messages** (full text)
5. **Environment info** (OS, Node version, sce version)
6. **Steps to reproduce**

**Example:**
```markdown
## Description
Context export fails for Spec with Chinese characters in filename

## Steps to Reproduce
1. Create Spec: sce spec bootstrap --name 01-00-用户登录 --non-interactive
2. Run: sce context export 01-00-用户登录
3. Error occurs

## Expected Behavior
Context should export successfully

## Actual Behavior
Error: Invalid filename

## Environment
- OS: macOS 13.0
- Node: v18.12.0
- sce: v1.0.0

## Error Message
```
Error: EINVAL: invalid filename
```
```

---

## Related Documentation

- **[Quick Start Guide](quick-start.md)** - Get started with sce
- **[FAQ](faq.md)** - Frequently asked questions
- **[Command Reference](command-reference.md)** - All sce commands
- **[Integration Modes](integration-modes.md)** - Using sce with AI tools

---

## Summary

**Most Common Issues:**
1. **Installation** - Use npx or fix npm permissions
2. **Command not found** - Add sce to PATH
3. **Spec name format** - Use XX-YY-feature-name format
4. **Context too large** - Use task-specific prompts
5. **Watch mode** - Restart or check configuration
6. **Document governance** - Check patterns and permissions

**Quick Fixes:**
```bash
# Restart sce watch mode
sce watch stop && sce watch start

# Verify installation
sce --version

# Check Spec structure
ls -la .sce/specs/

# Test context export
sce context export spec-name

# Check document compliance
sce docs diagnose

# Clean up temporary files
sce docs cleanup --dry-run
```

**Still stuck?** → [Create an issue](https://github.com/heguangyong/scene-capability-engine/issues/new)

---

**Version**: 1.42.0  
**Last Updated**: 2026-02-11

