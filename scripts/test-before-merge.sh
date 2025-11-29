#!/bin/bash

# Test Before Merge Script
# Run this before merging any branch to main

set -e  # Exit on error

echo "🧪 Running Pre-Merge Tests..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=true

# 1. TypeScript compilation
echo "📝 Checking TypeScript compilation..."
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TypeScript compilation passed${NC}"
else
    echo -e "${RED}❌ TypeScript compilation failed${NC}"
    npm run build
    TESTS_PASSED=false
fi

echo ""

# 2. Linting (if configured)
echo "🔍 Checking code style..."
if npm run lint > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Linting passed${NC}"
else
    echo -e "${YELLOW}⚠️  Linting issues found (non-blocking)${NC}"
    npm run lint
fi

echo ""

# 3. Check for console.logs in critical files
echo "🔎 Checking for console statements..."
CONSOLE_COUNT=$(grep -r "console\." src/app src/components src/lib --include="*.ts" --include="*.tsx" | wc -l | tr -d ' ')
if [ "$CONSOLE_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $CONSOLE_COUNT console statements (consider removing for production)${NC}"
else
    echo -e "${GREEN}✅ No console statements found${NC}"
fi

echo ""

# 4. Check for any types
echo "🔤 Checking for 'any' types..."
ANY_COUNT=$(grep -r ": any" src/ --include="*.ts" --include="*.tsx" | wc -l | tr -d ' ')
if [ "$ANY_COUNT" -gt 100 ]; then
    echo -e "${YELLOW}⚠️  Found $ANY_COUNT 'any' types (consider adding proper types)${NC}"
else
    echo -e "${GREEN}✅ 'any' types under control ($ANY_COUNT found)${NC}"
fi

echo ""

# 5. Check for TODO comments
echo "📋 Checking for TODOs..."
TODO_COUNT=$(grep -r "TODO\|FIXME\|XXX" src/ --include="*.ts" --include="*.tsx" | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $TODO_COUNT TODO comments${NC}"
    grep -r "TODO\|FIXME\|XXX" src/ --include="*.ts" --include="*.tsx" | head -10
else
    echo -e "${GREEN}✅ No TODOs found${NC}"
fi

echo ""

# 6. Check for .env.local in git
echo "🔒 Checking for exposed secrets..."
if git ls-files | grep -q ".env.local"; then
    echo -e "${RED}❌ CRITICAL: .env.local is tracked by git!${NC}"
    TESTS_PASSED=false
else
    echo -e "${GREEN}✅ No secrets in git${NC}"
fi

echo ""

# 7. Check for large files
echo "📦 Checking for large files..."
LARGE_FILES=$(find src/ -type f -size +200k)
if [ -n "$LARGE_FILES" ]; then
    echo -e "${YELLOW}⚠️  Found large files:${NC}"
    echo "$LARGE_FILES"
else
    echo -e "${GREEN}✅ No unusually large files${NC}"
fi

echo ""

# 8. Run unit tests (if they exist)
echo "🧪 Running unit tests..."
if [ -f "package.json" ] && grep -q '"test"' package.json; then
    if npm test > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Unit tests passed${NC}"
    else
        echo -e "${RED}❌ Unit tests failed${NC}"
        TESTS_PASSED=false
    fi
else
    echo -e "${YELLOW}⚠️  No tests configured yet${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Summary
if [ "$TESTS_PASSED" = true ]; then
    echo -e "${GREEN}✅ All critical tests passed!${NC}"
    echo ""
    echo "Safe to merge. Run:"
    echo "  git checkout main"
    echo "  git merge $(git branch --show-current)"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please fix before merging.${NC}"
    exit 1
fi
