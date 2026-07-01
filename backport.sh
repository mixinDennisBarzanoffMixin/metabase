git reset HEAD~1
rm ./backport.sh
git cherry-pick 8e47d62c2c782691660812a9bef58c68d39c2246
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
