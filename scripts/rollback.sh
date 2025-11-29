#!/bin/bash

# Rollback Script
# Use this to safely rollback to previous state

set -e

echo "🔙 Rollback Utility"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Select rollback option:"
echo ""
echo "1) Rollback to pre-refactor snapshot (v0.1.0-pre-refactor)"
echo "2) Rollback last commit on current branch"
echo "3) Rollback to specific commit"
echo "4) Abort current merge/rebase"
echo "5) Cancel"
echo ""
read -p "Enter choice (1-5): " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}⚠️  This will create a new branch from the pre-refactor snapshot${NC}"
        echo "Your current work will NOT be lost (it stays on current branch)"
        read -p "Continue? (y/n): " confirm

        if [ "$confirm" = "y" ]; then
            RECOVERY_BRANCH="recovery-$(date +%Y%m%d-%H%M%S)"
            git checkout v0.1.0-pre-refactor
            git checkout -b "$RECOVERY_BRANCH"
            echo -e "${GREEN}✅ Created recovery branch: $RECOVERY_BRANCH${NC}"
            echo ""
            echo "You're now on a clean state from before refactoring."
            echo "Your previous work is still on the old branch."
        fi
        ;;

    2)
        echo ""
        echo "Last 5 commits:"
        git log --oneline -5
        echo ""
        echo -e "${YELLOW}⚠️  This will revert the last commit (keeps history)${NC}"
        read -p "Continue? (y/n): " confirm

        if [ "$confirm" = "y" ]; then
            git revert HEAD
            echo -e "${GREEN}✅ Last commit reverted${NC}"
        fi
        ;;

    3)
        echo ""
        echo "Recent commits:"
        git log --oneline -10
        echo ""
        read -p "Enter commit hash to rollback to: " commit_hash

        if [ -n "$commit_hash" ]; then
            echo -e "${YELLOW}⚠️  This will revert to commit $commit_hash${NC}"
            read -p "Continue? (y/n): " confirm

            if [ "$confirm" = "y" ]; then
                git checkout "$commit_hash"
                RECOVERY_BRANCH="recovery-$(date +%Y%m%d-%H%M%S)"
                git checkout -b "$RECOVERY_BRANCH"
                echo -e "${GREEN}✅ Created recovery branch: $RECOVERY_BRANCH${NC}"
            fi
        fi
        ;;

    4)
        echo ""
        echo -e "${YELLOW}⚠️  This will abort any in-progress merge or rebase${NC}"
        read -p "Continue? (y/n): " confirm

        if [ "$confirm" = "y" ]; then
            if git merge --abort 2>/dev/null; then
                echo -e "${GREEN}✅ Merge aborted${NC}"
            elif git rebase --abort 2>/dev/null; then
                echo -e "${GREEN}✅ Rebase aborted${NC}"
            else
                echo -e "${YELLOW}No merge or rebase in progress${NC}"
            fi
        fi
        ;;

    5)
        echo "Cancelled"
        exit 0
        ;;

    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo "Current branch: $(git branch --show-current)"
echo "Status:"
git status --short
