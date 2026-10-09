
#### USE git pull command to take all files to your local desktop folder so you dont have to do manually


# 🚀 GIT CHEAT SHEET
# Keep this file on your desktop for quick access!

## 1. THE DAILY WORKING LOOP (Use this 99% of the time)
# Run these three commands in order whenever you want to save your work to GitHub:

git add .
    # 📸 STAGE: Gathers all changed and new files in this folder.

git commit -m "Your description here"
    # 💾 COMMIT: Takes a permanent local snapshot of your changes.

git push
    # 🚀 PUSH: Uploads your snapshot straight to GitHub.


## 2. SETTING UP A NEW PROJECT FROM SCRATCH
# Run these inside a brand new project folder to connect it to a new GitHub repo:

git init
    # Turns the current folder into a Git repository.

git remote add origin <PASTE_YOUR_GITHUB_URL_HERE>
    # Links your local folder to your online GitHub repository.

git branch -M main
    # Ensures your default branch is named 'main'.

git push -u origin main
    # Pushes your first commit and links the branch for future 'git push' commands.


## 3. USEFUL CHECK-UP COMMANDS

git status
    # Tells you which files are modified, staged, or untracked.

git remote -v
    # Shows the exact GitHub URL your folder is currently linked to.

git log --oneline
    # Shows a clean, one-line list of your previous saves (commits).


## 4. EMERGENCY FIXES

git push -u origin main --force
    # Forces your local code to overwrite GitHub (fixes "fetch first" / rejected errors).

git checkout -- <filename>
    # Discards local changes to a specific file and restores it to the last commit.
