#!/bin/bash

# Pre-Refactor Snapshot Script
# This creates a complete backup before starting refactoring

set -e  # Exit on error

echo "🔒 Creating Pre-Refactor Snapshot..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Check for uncommitted changes
echo "📋 Checking for uncommitted changes..."
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  You have uncommitted changes. Committing them first...${NC}"
    git status --short
    echo ""
    read -p "Commit message (or 'skip' to abort): " commit_msg

    if [ "$commit_msg" = "skip" ]; then
        echo -e "${RED}❌ Aborting. Please commit or stash changes first.${NC}"
        exit 1
    fi

    git add .
    git commit -m "$commit_msg"
    echo -e "${GREEN}✅ Changes committed${NC}"
else
    echo -e "${GREEN}✅ Working directory clean${NC}"
fi

echo ""

# 2. Create snapshot tag
echo "🏷️  Creating snapshot tag..."
TAG_NAME="v0.1.0-pre-refactor"
TAG_MESSAGE="Snapshot before systematic refactoring - WORKING STATE $(date +%Y-%m-%d)"

# Check if tag already exists
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Tag $TAG_NAME already exists${NC}"
    read -p "Delete and recreate? (y/n): " recreate

    if [ "$recreate" = "y" ]; then
        git tag -d "$TAG_NAME"
        git push origin ":refs/tags/$TAG_NAME" 2>/dev/null || true
        echo -e "${GREEN}✅ Old tag removed${NC}"
    else
        echo -e "${YELLOW}Using existing tag${NC}"
    fi
fi

git tag -a "$TAG_NAME" -m "$TAG_MESSAGE" 2>/dev/null || echo "Tag already exists"
echo -e "${GREEN}✅ Tag created: $TAG_NAME${NC}"

echo ""

# 3. Push to remote
echo "☁️  Pushing to remote..."
git push origin main
git push origin "$TAG_NAME" 2>/dev/null || echo "Tag already on remote"
echo -e "${GREEN}✅ Pushed to remote${NC}"

echo ""

# 4. Create refactoring branch
echo "🌿 Creating refactoring branch..."
BRANCH_NAME="refactor/systematic-improvements"

if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Branch $BRANCH_NAME already exists${NC}"
    read -p "Switch to it? (y/n): " switch

    if [ "$switch" = "y" ]; then
        git checkout "$BRANCH_NAME"
        echo -e "${GREEN}✅ Switched to $BRANCH_NAME${NC}"
    fi
else
    git checkout -b "$BRANCH_NAME"
    echo -e "${GREEN}✅ Created and switched to $BRANCH_NAME${NC}"
fi

echo ""

# 5. Create snapshot directory
echo "📁 Creating local backup..."
SNAPSHOT_DIR="../business-coaching-platform-snapshot-$(date +%Y%m%d-%H%M%S)"
cp -r . "$SNAPSHOT_DIR"
rm -rf "$SNAPSHOT_DIR/.git"
rm -rf "$SNAPSHOT_DIR/node_modules"
echo -e "${GREEN}✅ Local backup created at: $SNAPSHOT_DIR${NC}"

echo ""

# 6. Document current state
echo "📝 Documenting current state..."
cat > CURRENT_STATE.md << EOF
# Current State Snapshot
**Date:** $(date +"%Y-%m-%d %H:%M:%S")
**Branch:** $(git branch --show-current)
**Commit:** $(git rev-parse HEAD)
**Tag:** $TAG_NAME

## Working Features (as of snapshot)
- ✅ Authentication (login working)
- ✅ Dashboard (loads with metrics)
- ✅ Business Profile (5-step form)
- ✅ Assessment (54 questions)
- ✅ Goals & KPIs (6-step wizard)
- ✅ Open Loops tracking
- ✅ To-Do management
- ✅ AI assistance (GPT-4)
- ⚠️  Xero integration (implemented, not tested)

## Known Issues (before refactoring)
- Security: API keys need rotation
- Auth: Missing signup/reset password pages
- Architecture: Inconsistent Supabase client usage
- Code: Large components (>1000 LOC)
- Testing: No test coverage

## Environment
- Node version: $(node --version)
- NPM version: $(npm --version)
- Next.js: $(npm list next --depth=0 | grep next | awk '{print $2}')

## Database State
- Using Supabase hosted instance
- Connection: Working
- Tables: businesses, assessments, kpis, open_loops, etc.

## Rollback Instructions
If anything goes wrong during refactoring:

\`\`\`bash
# Option 1: Return to this exact state
git checkout $TAG_NAME
git checkout -b recovery-branch

# Option 2: Copy from local backup
cp -r $SNAPSHOT_DIR/* .

# Option 3: Revert specific changes
git log --oneline  # Find bad commit
git revert <commit-hash>
\`\`\`

## Next Steps
Follow REFACTORING_ROADMAP.md starting with Phase 1.
EOF

echo -e "${GREEN}✅ State documented in CURRENT_STATE.md${NC}"

echo ""
echo -e "${GREEN}✨ Snapshot Complete!${NC}"
echo ""
echo "📍 Safety checkpoints created:"
echo "   - Git tag: $TAG_NAME"
echo "   - Local backup: $SNAPSHOT_DIR"
echo "   - State document: CURRENT_STATE.md"
echo "   - Refactoring branch: $BRANCH_NAME"
echo ""
echo "🚀 You're now ready to start refactoring safely!"
echo "   Follow the steps in REFACTORING_ROADMAP.md"
echo ""
echo "💡 Quick rollback command:"
echo "   git checkout $TAG_NAME"
echo ""
